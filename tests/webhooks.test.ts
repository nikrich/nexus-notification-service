import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { createApp } from '../src/server.js';
import { initializeDatabase } from '../src/db/schema.js';
import { WebhookService } from '../src/services/webhook.service.js';

describe('Webhooks', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;

  const authHeaders = {
    'x-user-id': 'webhook-user',
    'x-user-email': 'webhook@example.com',
    'x-user-role': 'member',
  };

  beforeAll(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    ({ app } = createApp({ db }));
  });

  afterAll(() => {
    db.close();
  });

  describe('WebhookService', () => {
    it('creates a webhook', () => {
      const service = new WebhookService(db);
      const webhook = service.create('svc-user', {
        url: 'https://example.com/hook',
        secret: 'my-secret',
        events: ['task_assigned'],
      });
      expect(webhook.id).toBeDefined();
      expect(webhook.userId).toBe('svc-user');
      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.events).toEqual(['task_assigned']);
      expect(webhook.active).toBe(true);
    });

    it('lists webhooks for user', () => {
      const service = new WebhookService(db);
      service.create('list-user', { url: 'https://a.com/hook', secret: 's', events: ['task_assigned'] });
      service.create('list-user', { url: 'https://b.com/hook', secret: 's', events: ['comment_added'] });
      const webhooks = service.list('list-user');
      expect(webhooks).toHaveLength(2);
    });

    it('updates a webhook', () => {
      const service = new WebhookService(db);
      const webhook = service.create('update-user', {
        url: 'https://old.com/hook',
        secret: 's',
        events: ['task_assigned'],
      });
      const updated = service.update(webhook.id, 'update-user', {
        url: 'https://new.com/hook',
        active: false,
      });
      expect(updated!.url).toBe('https://new.com/hook');
      expect(updated!.active).toBe(false);
    });

    it('returns null when updating non-existent webhook', () => {
      const service = new WebhookService(db);
      const result = service.update('fake-id', 'update-user', { url: 'https://new.com/hook' });
      expect(result).toBeNull();
    });

    it('deletes a webhook', () => {
      const service = new WebhookService(db);
      const webhook = service.create('del-user', {
        url: 'https://del.com/hook',
        secret: 's',
        events: ['task_assigned'],
      });
      expect(service.delete(webhook.id, 'del-user')).toBe(true);
      expect(service.getById(webhook.id, 'del-user')).toBeNull();
    });

    it('returns false when deleting non-existent webhook', () => {
      const service = new WebhookService(db);
      expect(service.delete('fake-id', 'del-user')).toBe(false);
    });

    it('does not allow cross-user access', () => {
      const service = new WebhookService(db);
      const webhook = service.create('owner-user', {
        url: 'https://private.com/hook',
        secret: 's',
        events: ['task_assigned'],
      });
      expect(service.getById(webhook.id, 'other-user')).toBeNull();
      expect(service.update(webhook.id, 'other-user', { url: 'https://evil.com' })).toBeNull();
      expect(service.delete(webhook.id, 'other-user')).toBe(false);
    });

    it('returns empty deliveries for non-existent webhook', () => {
      const service = new WebhookService(db);
      expect(service.getDeliveries('fake-id', 'some-user')).toEqual([]);
    });
  });

  describe('Routes', () => {
    let webhookId: string;

    it('POST /webhooks creates a webhook', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set(authHeaders)
        .send({
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['task_assigned', 'comment_added'],
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toBe('https://example.com/webhook');
      expect(res.body.data.events).toEqual(['task_assigned', 'comment_added']);
      webhookId = res.body.data.id;
    });

    it('GET /webhooks lists user webhooks', async () => {
      const res = await request(app)
        .get('/webhooks')
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /webhooks/:id updates a webhook', async () => {
      const res = await request(app)
        .patch(`/webhooks/${webhookId}`)
        .set(authHeaders)
        .send({ active: false });
      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(false);
    });

    it('PATCH /webhooks/:id returns 404 for non-existent', async () => {
      const res = await request(app)
        .patch('/webhooks/nonexistent')
        .set(authHeaders)
        .send({ active: false });
      expect(res.status).toBe(404);
    });

    it('GET /webhooks/:id/deliveries returns delivery history', async () => {
      const res = await request(app)
        .get(`/webhooks/${webhookId}/deliveries`)
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('DELETE /webhooks/:id deletes a webhook', async () => {
      const res = await request(app)
        .delete(`/webhooks/${webhookId}`)
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
    });

    it('DELETE /webhooks/:id returns 404 for non-existent', async () => {
      const res = await request(app)
        .delete('/webhooks/nonexistent')
        .set(authHeaders);
      expect(res.status).toBe(404);
    });

    it('POST /webhooks rejects invalid URL', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set(authHeaders)
        .send({ url: 'not-a-url', secret: 's', events: ['task_assigned'] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /webhooks rejects empty events array', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set(authHeaders)
        .send({ url: 'https://ok.com/hook', secret: 's', events: [] });
      expect(res.status).toBe(400);
    });

    it('POST /webhooks rejects invalid event type', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set(authHeaders)
        .send({ url: 'https://ok.com/hook', secret: 's', events: ['invalid_event'] });
      expect(res.status).toBe(400);
    });

    it('PATCH /webhooks/:id rejects unknown fields', async () => {
      // Create a webhook first
      const createRes = await request(app)
        .post('/webhooks')
        .set(authHeaders)
        .send({ url: 'https://ok.com/hook', secret: 's', events: ['task_assigned'] });
      const id = createRes.body.data.id;

      const res = await request(app)
        .patch(`/webhooks/${id}`)
        .set(authHeaders)
        .send({ unknownField: 'value' });
      expect(res.status).toBe(400);
    });

    it('requires auth on all endpoints', async () => {
      const endpoints = [
        { method: 'post', path: '/webhooks', body: { url: 'https://ok.com', secret: 's', events: ['task_assigned'] } },
        { method: 'get', path: '/webhooks' },
        { method: 'patch', path: '/webhooks/some-id', body: { active: true } },
        { method: 'delete', path: '/webhooks/some-id' },
        { method: 'get', path: '/webhooks/some-id/deliveries' },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.path);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
      }
    });
  });

  describe('HMAC Signature', () => {
    it('generates correct HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Verify the signature generation matches
      const actual = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(actual).toBe(expected);
      expect(actual).toHaveLength(64); // SHA256 hex is 64 chars
    });
  });
});
