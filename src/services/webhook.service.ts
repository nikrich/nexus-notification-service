import Database from 'better-sqlite3';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'comment_added'
  | 'project_invited'
  | 'task_due_soon';

export interface WebhookConfig {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: NotificationType[];
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed';
  responseCode: number | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

export interface CreateWebhookRequest {
  url: string;
  secret: string;
  events: NotificationType[];
}

export interface UpdateWebhookRequest {
  url?: string;
  secret?: string;
  events?: NotificationType[];
  active?: boolean;
}

interface WebhookRow {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string;
  active: number;
  created_at: string;
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  status: string;
  response_code: number | null;
  attempts: number;
  last_attempt_at: string | null;
  created_at: string;
}

function rowToWebhook(row: WebhookRow): WebhookConfig {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    secret: row.secret,
    events: JSON.parse(row.events),
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

function rowToDelivery(row: DeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload),
    status: row.status as WebhookDelivery['status'],
    responseCode: row.response_code,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    createdAt: row.created_at,
  };
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

export class WebhookService {
  constructor(private db: Database.Database) {}

  create(userId: string, req: CreateWebhookRequest): WebhookConfig {
    const id = nanoid();
    this.db.prepare(`
      INSERT INTO webhooks (id, user_id, url, secret, events, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(id, userId, req.url, req.secret, JSON.stringify(req.events));

    const row = this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow;
    return rowToWebhook(row);
  }

  list(userId: string): WebhookConfig[] {
    const rows = this.db.prepare(
      'SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as WebhookRow[];
    return rows.map(rowToWebhook);
  }

  getById(webhookId: string, userId: string): WebhookConfig | null {
    const row = this.db.prepare(
      'SELECT * FROM webhooks WHERE id = ? AND user_id = ?'
    ).get(webhookId, userId) as WebhookRow | undefined;
    return row ? rowToWebhook(row) : null;
  }

  update(webhookId: string, userId: string, req: UpdateWebhookRequest): WebhookConfig | null {
    const existing = this.getById(webhookId, userId);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (req.url !== undefined) {
      updates.push('url = ?');
      values.push(req.url);
    }
    if (req.secret !== undefined) {
      updates.push('secret = ?');
      values.push(req.secret);
    }
    if (req.events !== undefined) {
      updates.push('events = ?');
      values.push(JSON.stringify(req.events));
    }
    if (req.active !== undefined) {
      updates.push('active = ?');
      values.push(req.active ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(webhookId, userId);
      this.db.prepare(
        `UPDATE webhooks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
      ).run(...values);
    }

    return this.getById(webhookId, userId);
  }

  delete(webhookId: string, userId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM webhooks WHERE id = ? AND user_id = ?'
    ).run(webhookId, userId);
    return result.changes > 0;
  }

  getDeliveries(webhookId: string, userId: string): WebhookDelivery[] {
    // Verify webhook belongs to user
    const webhook = this.getById(webhookId, userId);
    if (!webhook) return [];

    const rows = this.db.prepare(
      'SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC'
    ).all(webhookId) as DeliveryRow[];
    return rows.map(rowToDelivery);
  }

  async deliver(eventType: NotificationType, payload: Record<string, unknown>, userId: string): Promise<void> {
    const webhooks = this.db.prepare(
      'SELECT * FROM webhooks WHERE user_id = ? AND active = 1'
    ).all(userId) as WebhookRow[];

    for (const webhookRow of webhooks) {
      const webhook = rowToWebhook(webhookRow);
      if (!webhook.events.includes(eventType)) continue;

      const deliveryId = nanoid();
      const payloadStr = JSON.stringify(payload);

      this.db.prepare(`
        INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status, attempts, created_at)
        VALUES (?, ?, ?, ?, 'pending', 0, datetime('now'))
      `).run(deliveryId, webhook.id, eventType, payloadStr);

      await this.attemptDelivery(deliveryId, webhook, payloadStr);
    }
  }

  private async attemptDelivery(deliveryId: string, webhook: WebhookConfig, payload: string): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
      }

      try {
        const signature = signPayload(payload, webhook.secret);
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Nexus-Signature': signature,
          },
          body: payload,
          signal: AbortSignal.timeout(10000),
        });

        this.db.prepare(`
          UPDATE webhook_deliveries
          SET attempts = ?, response_code = ?, last_attempt_at = datetime('now'),
              status = ?
          WHERE id = ?
        `).run(attempt + 1, response.status, response.ok ? 'delivered' : (attempt + 1 >= maxAttempts ? 'failed' : 'pending'), deliveryId);

        if (response.ok) return;
      } catch {
        this.db.prepare(`
          UPDATE webhook_deliveries
          SET attempts = ?, last_attempt_at = datetime('now'),
              status = ?
          WHERE id = ?
        `).run(attempt + 1, attempt + 1 >= maxAttempts ? 'failed' : 'pending', deliveryId);
      }
    }
  }
}
