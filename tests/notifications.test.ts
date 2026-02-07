import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/server.js';
import { initializeDatabase } from '../src/db/schema.js';
import { NotificationService } from '../src/services/notification.service.js';
import { EmailService } from '../src/services/email.service.js';

describe('Notifications', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;

  const authHeaders = {
    'x-user-id': 'test-user',
    'x-user-email': 'test@example.com',
    'x-user-role': 'member',
  };

  const serviceToken = 'nexus-internal-service-token';

  beforeAll(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    ({ app } = createApp({ db }));
  });

  afterAll(() => {
    db.close();
  });

  describe('NotificationService', () => {
    it('sends a notification to a single channel', () => {
      const service = new NotificationService(db);
      const notifications = service.send({
        userId: 'svc-user',
        type: 'task_assigned',
        title: 'Task assigned',
        body: 'You were assigned a task',
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].channel).toBe('in_app');
      expect(notifications[0].read).toBe(false);
    });

    it('sends notifications to multiple channels', () => {
      const service = new NotificationService(db);
      const notifications = service.send({
        userId: 'multi-user',
        type: 'project_invited',
        title: 'Project invite',
        body: 'You were invited',
        channels: ['in_app', 'email'],
      });
      expect(notifications).toHaveLength(2);
      expect(notifications.map(n => n.channel).sort()).toEqual(['email', 'in_app']);
    });

    it('stores metadata as JSON', () => {
      const service = new NotificationService(db);
      const notifications = service.send({
        userId: 'meta-user',
        type: 'task_assigned',
        title: 'Task',
        body: 'Body',
        metadata: { taskId: '123', projectId: '456' },
      });
      expect(notifications[0].metadata).toEqual({ taskId: '123', projectId: '456' });
    });

    it('lists notifications with pagination', () => {
      const service = new NotificationService(db);
      for (let i = 0; i < 5; i++) {
        service.send({
          userId: 'page-user',
          type: 'task_assigned',
          title: `Task ${i}`,
          body: `Body ${i}`,
        });
      }
      const page1 = service.list('page-user', { page: 1, pageSize: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore).toBe(true);
      expect(page1.page).toBe(1);

      const page3 = service.list('page-user', { page: 3, pageSize: 2 });
      expect(page3.items).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it('marks a notification as read', () => {
      const service = new NotificationService(db);
      const [notif] = service.send({
        userId: 'read-user',
        type: 'comment_added',
        title: 'Comment',
        body: 'New comment',
      });
      expect(notif.read).toBe(false);

      const updated = service.markAsRead(notif.id, 'read-user');
      expect(updated!.read).toBe(true);
    });

    it('returns null when marking non-existent notification as read', () => {
      const service = new NotificationService(db);
      expect(service.markAsRead('fake-id', 'read-user')).toBeNull();
    });

    it('marks all notifications as read', () => {
      const service = new NotificationService(db);
      service.send({ userId: 'readall-user', type: 'task_assigned', title: 'T1', body: 'B1' });
      service.send({ userId: 'readall-user', type: 'task_assigned', title: 'T2', body: 'B2' });

      const count = service.markAllAsRead('readall-user');
      expect(count).toBe(2);

      const unread = service.getUnreadCount('readall-user');
      expect(unread).toBe(0);
    });

    it('counts unread notifications', () => {
      const service = new NotificationService(db);
      service.send({ userId: 'count-user', type: 'task_assigned', title: 'T1', body: 'B1' });
      service.send({ userId: 'count-user', type: 'task_assigned', title: 'T2', body: 'B2' });
      service.send({ userId: 'count-user', type: 'task_assigned', title: 'T3', body: 'B3' });

      expect(service.getUnreadCount('count-user')).toBe(3);
    });

    it('does not allow cross-user read', () => {
      const service = new NotificationService(db);
      const [notif] = service.send({
        userId: 'owner-user',
        type: 'task_assigned',
        title: 'Private',
        body: 'Private notification',
      });
      expect(service.markAsRead(notif.id, 'other-user')).toBeNull();
    });
  });

  describe('Routes', () => {
    it('POST /notifications/send creates notifications with service token', async () => {
      const res = await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({
          userId: 'test-user',
          type: 'task_assigned',
          title: 'New task',
          body: 'You have a new task',
          metadata: { taskId: 'task-1' },
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('New task');
    });

    it('POST /notifications/send rejects without service token', async () => {
      const res = await request(app)
        .post('/notifications/send')
        .send({
          userId: 'test-user',
          type: 'task_assigned',
          title: 'New task',
          body: 'Body',
        });
      expect(res.status).toBe(403);
    });

    it('POST /notifications/send validates request body', async () => {
      const res = await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({
          userId: '',
          type: 'invalid_type',
          title: '',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /notifications/send rejects invalid notification type', async () => {
      const res = await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({
          userId: 'test-user',
          type: 'nonexistent_type',
          title: 'Test',
          body: 'Test body',
        });
      expect(res.status).toBe(400);
    });

    it('GET /notifications returns paginated notifications', async () => {
      // Send a few notifications first
      await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({ userId: 'test-user', type: 'comment_added', title: 'Comment 1', body: 'Body 1' });
      await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({ userId: 'test-user', type: 'comment_added', title: 'Comment 2', body: 'Body 2' });

      const res = await request(app)
        .get('/notifications?page=1&pageSize=2')
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeLessThanOrEqual(2);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(2);
      expect(typeof res.body.data.total).toBe('number');
    });

    it('GET /notifications requires auth', async () => {
      const res = await request(app).get('/notifications');
      expect(res.status).toBe(401);
    });

    it('PATCH /notifications/:id/read marks notification as read', async () => {
      const sendRes = await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({ userId: 'test-user', type: 'task_assigned', title: 'Read me', body: 'Body' });
      const notifId = sendRes.body.data[0].id;

      const res = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.read).toBe(true);
    });

    it('PATCH /notifications/:id/read returns 404 for non-existent', async () => {
      const res = await request(app)
        .patch('/notifications/fake-id/read')
        .set(authHeaders);
      expect(res.status).toBe(404);
    });

    it('POST /notifications/read-all marks all as read', async () => {
      const res = await request(app)
        .post('/notifications/read-all')
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(typeof res.body.data.updated).toBe('number');
    });

    it('GET /notifications/unread-count returns count', async () => {
      // Send a new notification so there's at least one unread
      await request(app)
        .post('/notifications/send')
        .set('x-service-token', serviceToken)
        .send({ userId: 'test-user', type: 'task_due_soon', title: 'Due soon', body: 'Body' });

      const res = await request(app)
        .get('/notifications/unread-count')
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(typeof res.body.data.count).toBe('number');
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('requires auth on all protected endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/notifications' },
        { method: 'patch', path: '/notifications/some-id/read' },
        { method: 'post', path: '/notifications/read-all' },
        { method: 'get', path: '/notifications/unread-count' },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.path);
        const res = await req;
        expect(res.status).toBe(401);
      }
    });
  });

  describe('EmailService', () => {
    it('sends and stores an email', () => {
      const service = new EmailService(db);
      const email = service.send('user@example.com', 'Test Subject', 'Test body');
      expect(email.toEmail).toBe('user@example.com');
      expect(email.subject).toBe('Test Subject');
      expect(email.body).toBe('Test body');
      expect(email.id).toBeDefined();
    });

    it('lists sent emails', () => {
      const service = new EmailService(db);
      service.send('a@example.com', 'Subject A', 'Body A');
      service.send('b@example.com', 'Subject B', 'Body B');
      const emails = service.list();
      expect(emails.length).toBeGreaterThanOrEqual(2);
    });
  });
});
