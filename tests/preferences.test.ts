import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/server.js';
import { initializeDatabase } from '../src/db/schema.js';
import { PreferencesService } from '../src/services/preferences.service.js';

describe('Preferences', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;

  beforeAll(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    ({ app } = createApp({ db }));
  });

  afterAll(() => {
    db.close();
  });

  describe('PreferencesService', () => {
    it('returns default preferences for new user', () => {
      const service = new PreferencesService(db);
      const prefs = service.get('new-user');
      expect(prefs.userId).toBe('new-user');
      expect(prefs.taskAssigned).toEqual(['in_app']);
      expect(prefs.taskStatusChanged).toEqual(['in_app']);
      expect(prefs.commentAdded).toEqual(['in_app']);
      expect(prefs.projectInvited).toEqual(['in_app', 'email']);
      expect(prefs.taskDueSoon).toEqual(['in_app', 'email']);
    });

    it('updates and persists preferences', () => {
      const service = new PreferencesService(db);
      const updated = service.update('user-1', {
        taskAssigned: ['in_app', 'email'],
      });
      expect(updated.taskAssigned).toEqual(['in_app', 'email']);
      expect(updated.commentAdded).toEqual(['in_app']); // unchanged default

      const fetched = service.get('user-1');
      expect(fetched.taskAssigned).toEqual(['in_app', 'email']);
    });

    it('updates multiple fields at once', () => {
      const service = new PreferencesService(db);
      service.update('user-2', {
        taskAssigned: ['email'],
        projectInvited: ['webhook'],
        taskDueSoon: ['in_app'],
      });
      const fetched = service.get('user-2');
      expect(fetched.taskAssigned).toEqual(['email']);
      expect(fetched.projectInvited).toEqual(['webhook']);
      expect(fetched.taskDueSoon).toEqual(['in_app']);
      expect(fetched.commentAdded).toEqual(['in_app']); // default unchanged
    });

    it('handles corrupted JSON gracefully', () => {
      // Insert corrupted data directly
      db.prepare(`
        INSERT INTO notification_preferences (user_id, task_assigned, task_status_changed, comment_added, project_invited, task_due_soon)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('corrupt-user', 'not-json', '["in_app"]', '["in_app"]', '["in_app","email"]', '["in_app","email"]');

      const service = new PreferencesService(db);
      const prefs = service.get('corrupt-user');
      expect(prefs.taskAssigned).toEqual(['in_app']); // falls back to default
      expect(prefs.taskStatusChanged).toEqual(['in_app']); // valid JSON preserved
    });
  });

  describe('Routes', () => {
    const authHeaders = {
      'x-user-id': 'route-user',
      'x-user-email': 'route@example.com',
      'x-user-role': 'member',
    };

    it('GET /preferences returns defaults for new user', async () => {
      const res = await request(app)
        .get('/preferences')
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe('route-user');
      expect(res.body.data.taskAssigned).toEqual(['in_app']);
      expect(res.body.data.projectInvited).toEqual(['in_app', 'email']);
    });

    it('PUT /preferences updates preferences', async () => {
      const res = await request(app)
        .put('/preferences')
        .set(authHeaders)
        .send({ taskAssigned: ['in_app', 'email'] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.taskAssigned).toEqual(['in_app', 'email']);
    });

    it('GET /preferences returns updated values after PUT', async () => {
      const res = await request(app)
        .get('/preferences')
        .set(authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.taskAssigned).toEqual(['in_app', 'email']);
    });

    it('PUT /preferences rejects invalid channel values', async () => {
      const res = await request(app)
        .put('/preferences')
        .set(authHeaders)
        .send({ taskAssigned: ['invalid_channel'] });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('PUT /preferences rejects non-array values', async () => {
      const res = await request(app)
        .put('/preferences')
        .set(authHeaders)
        .send({ taskAssigned: 'in_app' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('PUT /preferences rejects unknown fields', async () => {
      const res = await request(app)
        .put('/preferences')
        .set(authHeaders)
        .send({ unknownField: ['in_app'] });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('GET /preferences requires auth', async () => {
      const res = await request(app).get('/preferences');
      expect(res.status).toBe(401);
    });

    it('PUT /preferences requires auth', async () => {
      const res = await request(app)
        .put('/preferences')
        .send({ taskAssigned: ['in_app'] });
      expect(res.status).toBe(401);
    });
  });
});
