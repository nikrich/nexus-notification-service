# Nexus Notification Service

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

Notification management service for the **Nexus** platform. Handles in-app notifications, email simulation, webhook delivery with retry, and user notification preferences.

## Features

- **In-App Notifications** — Send, list, mark read, unread count
- **Email Simulation** — Logs emails to console and stores in DB for testing
- **Webhooks** — CRUD for webhook configs with HMAC-SHA256 signed delivery
- **Retry Logic** — Exponential backoff (1s, 5s, 15s) for failed webhook deliveries
- **Preferences** — Per-user notification channel preferences
- **Service-to-Service** — Internal endpoint for other services to trigger notifications

## Quick Start

```bash
npm install
npm run dev    # Start with hot reload on port 3003
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with tsx watch |
| `npm run build` | Build with tsup |
| `npm start` | Start production server |
| `npm test` | Run tests |
| `npm run lint` | Type-check |

## API Endpoints

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/notifications/send` | Service token | Send notification (internal) |
| `GET` | `/notifications` | User | List notifications (paginated) |
| `PATCH` | `/notifications/:id/read` | User | Mark as read |
| `POST` | `/notifications/read-all` | User | Mark all as read |
| `GET` | `/notifications/unread-count` | User | Get unread count |

### Preferences

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/preferences` | User | Get notification preferences |
| `PUT` | `/preferences` | User | Update preferences |

### Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/webhooks` | User | Create webhook config |
| `GET` | `/webhooks` | User | List user's webhooks |
| `PATCH` | `/webhooks/:id` | User | Update webhook |
| `DELETE` | `/webhooks/:id` | User | Delete webhook |
| `GET` | `/webhooks/:id/deliveries` | User | List delivery history |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3003` | Service port |
| `NEXUS_JWT_SECRET` | `nexus-dev-secret-change-in-production` | JWT signing secret |
| `NEXUS_SERVICE_TOKEN` | `nexus-internal-service-token` | Service-to-service auth |
| `DATABASE_PATH` | `./data/notifications.db` | SQLite database path |

## Webhook Delivery

- Sends POST to configured URL with JSON payload
- Signs payload with `X-Nexus-Signature` header (HMAC-SHA256 of body with webhook secret)
- Retries up to 3 times with exponential backoff: 1s, 5s, 15s
- All delivery attempts logged in `webhook_deliveries` table

## Database Schema

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY,
  task_assigned TEXT NOT NULL DEFAULT '["in_app"]',
  task_status_changed TEXT NOT NULL DEFAULT '["in_app"]',
  comment_added TEXT NOT NULL DEFAULT '["in_app"]',
  project_invited TEXT NOT NULL DEFAULT '["in_app","email"]',
  task_due_soon TEXT NOT NULL DEFAULT '["in_app","email"]'
);

CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  response_code INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Project Structure

```
src/
├── index.ts              # Entry point (port 3003)
├── server.ts             # Express app factory
├── db/
│   ├── schema.ts         # SQLite schema + migrations
│   └── client.ts         # better-sqlite3 connection
├── routes/
│   ├── notifications.routes.ts
│   ├── preferences.routes.ts
│   ├── webhooks.routes.ts
│   └── health.routes.ts
├── services/
│   ├── notification.service.ts
│   ├── email.service.ts
│   ├── webhook.service.ts
│   └── preferences.service.ts
└── middleware/
    ├── auth.middleware.ts
    └── error.middleware.ts
```

## Part of Nexus Platform

| Service | Port | Repository |
|---------|------|------------|
| API Gateway | 3000 | [nexus-api-gateway](https://github.com/nikrich/nexus-api-gateway) |
| Shared Contracts | — | [nexus-shared-contracts](https://github.com/nikrich/nexus-shared-contracts) |
| User Service | 3001 | [nexus-user-service](https://github.com/nikrich/nexus-user-service) |
| Content Service | 3002 | [nexus-content-service](https://github.com/nikrich/nexus-content-service) |
| **Notification Service** | **3003** | [nexus-notification-service](https://github.com/nikrich/nexus-notification-service) |
