import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export type NotificationChannel = 'in_app' | 'email' | 'webhook';
export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'comment_added'
  | 'project_invited'
  | 'task_due_soon';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata: Record<string, string>;
  read: boolean;
  createdAt: string;
}

export interface SendNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, string>;
  channels?: NotificationChannel[];
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  metadata: string;
  read: number;
  created_at: string;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    channel: row.channel as NotificationChannel,
    title: row.title,
    body: row.body,
    metadata: JSON.parse(row.metadata),
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export class NotificationService {
  constructor(private db: Database.Database) {}

  send(req: SendNotificationRequest): Notification[] {
    const channels = req.channels || ['in_app'];
    const notifications: Notification[] = [];

    const stmt = this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, channel, title, body, metadata, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `);

    for (const channel of channels) {
      const id = nanoid();
      const metadata = JSON.stringify(req.metadata || {});
      stmt.run(id, req.userId, req.type, channel, req.title, req.body, metadata);

      const row = this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as NotificationRow;
      notifications.push(rowToNotification(row));
    }

    return notifications;
  }

  list(userId: string, query: PaginationQuery = {}): PaginatedResponse<Notification> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const total = (this.db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?'
    ).get(userId) as { count: number }).count;

    const rows = this.db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(userId, pageSize, offset) as NotificationRow[];

    return {
      items: rows.map(rowToNotification),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    };
  }

  markAsRead(notificationId: string, userId: string): Notification | null {
    const row = this.db.prepare(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?'
    ).get(notificationId, userId) as NotificationRow | undefined;

    if (!row) return null;

    this.db.prepare(
      'UPDATE notifications SET read = 1 WHERE id = ?'
    ).run(notificationId);

    return rowToNotification({ ...row, read: 1 });
  }

  markAllAsRead(userId: string): number {
    const result = this.db.prepare(
      'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0'
    ).run(userId);
    return result.changes;
  }

  getUnreadCount(userId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
    ).get(userId) as { count: number };
    return row.count;
  }
}
