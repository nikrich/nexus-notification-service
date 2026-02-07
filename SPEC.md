# Nexus — Microservices Platform Spec

A multi-service project management API built to battle-test Hive's multi-team orchestration. Five independent repos, five teams, complex inter-service dependencies.

**Domain:** Project & task management platform ("Nexus")

---

## Architecture Overview

```
                    ┌─────────────────────┐
                    │    API Gateway       │  :3000
                    │  (routing, auth,     │
                    │   rate limiting)     │
                    └─────┬───┬───┬───────┘
                          │   │   │
              ┌───────────┘   │   └───────────┐
              ▼               ▼               ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
     │ User Service  │ │Content Service│ │Notification Svc  │
     │   :3001       │ │   :3002       │ │   :3003          │
     └──────────────┘ └──────────────┘ └──────────────────┘
              │               │               │
              └───────────────┴───────────────┘
                              │
                    ┌─────────────────────┐
                    │  Shared Contracts    │
                    │  (types, schemas,    │
                    │   API client)        │
                    └─────────────────────┘
```

---

## Tech Stack (All Services)

- **Runtime:** Node.js 20+ with TypeScript 5+
- **Framework:** Express 4 with express-async-errors
- **Database:** SQLite via better-sqlite3 (each service owns its own DB file)
- **Validation:** Zod schemas (defined in shared-contracts, consumed by all)
- **Auth:** JWT tokens (issued by user-service, verified by gateway)
- **Testing:** Vitest
- **Build:** tsup (fast TypeScript bundler)
- **Package Manager:** npm with workspaces (each repo is standalone)

---

## Repo Setup

### Step 1: Create GitHub Repos

Create 5 empty repos on GitHub (public or private):

```bash
gh repo create nikrich/nexus-shared-contracts --public --clone=false
gh repo create nikrich/nexus-api-gateway --public --clone=false
gh repo create nikrich/nexus-user-service --public --clone=false
gh repo create nikrich/nexus-content-service --public --clone=false
gh repo create nikrich/nexus-notification-service --public --clone=false
```

Initialize each with a README and this spec:

```bash
for repo in nexus-shared-contracts nexus-api-gateway nexus-user-service nexus-content-service nexus-notification-service; do
  mkdir -p /tmp/$repo && cd /tmp/$repo
  git init && git checkout -b main
  cp /path/to/MICROSERVICES-SPEC.md SPEC.md
  echo "# $repo" > README.md
  git add . && git commit -m "initial commit"
  git remote add origin "https://github.com/nikrich/$repo.git"
  git push -u origin main
  cd ..
done
```

### Step 2: Register Teams in Hive

```bash
hive add-repo --url https://github.com/nikrich/nexus-shared-contracts.git --team shared-contracts --branch main
hive add-repo --url https://github.com/nikrich/nexus-api-gateway.git --team api-gateway --branch main
hive add-repo --url https://github.com/nikrich/nexus-user-service.git --team user-service --branch main
hive add-repo --url https://github.com/nikrich/nexus-content-service.git --team content-service --branch main
hive add-repo --url https://github.com/nikrich/nexus-notification-service.git --team notification-service --branch main
```

### Step 3: Verify

```bash
hive teams list
# Should show 5 teams + existing teams
```

---

## Service Specifications

---

### 1. Shared Contracts (`nexus-shared-contracts`)

The foundational package consumed by all other services. Defines types, Zod schemas, API client, and shared utilities.

**Project Structure:**
```
nexus-shared-contracts/
├── package.json            # name: @nexus/shared-contracts
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts            # barrel export
│   ├── types/
│   │   ├── user.ts         # User, UserRole, AuthToken types
│   │   ├── project.ts      # Project, Task, Comment types
│   │   ├── notification.ts # Notification, NotificationChannel types
│   │   └── common.ts       # Pagination, ApiResponse, ApiError
│   ├── schemas/
│   │   ├── user.schemas.ts       # Zod schemas for user payloads
│   │   ├── project.schemas.ts   # Zod schemas for project/task payloads
│   │   ├── notification.schemas.ts
│   │   └── common.schemas.ts
│   ├── events/
│   │   └── events.ts       # Inter-service event types (EventBus)
│   ├── client/
│   │   └── api-client.ts   # Typed HTTP client for inter-service calls
│   └── utils/
│       ├── errors.ts       # AppError, NotFoundError, ValidationError, AuthError
│       └── jwt.ts          # JWT sign/verify helpers (shared secret)
└── tests/
    └── schemas.test.ts
```

**Key Types:**

```typescript
// types/user.ts
export type UserRole = 'admin' | 'member' | 'viewer';

export interface User {
  id: string;           // nanoid
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;    // ISO 8601
  updatedAt: string;
}

export interface AuthToken {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
```

```typescript
// types/project.ts
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;      // references User.id
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;  // references User.id
  createdBy: string;    // references User.id
  dueDate?: string;     // ISO 8601
  tags: string[];       // JSON array stored as TEXT
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;     // references User.id
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
}

export interface CreateCommentRequest {
  body: string;
}
```

```typescript
// types/notification.ts
export type NotificationChannel = 'in_app' | 'email' | 'webhook';
export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'comment_added'
  | 'project_invited'
  | 'task_due_soon';

export interface Notification {
  id: string;
  userId: string;       // recipient
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata: Record<string, string>;  // JSON stored as TEXT
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  taskAssigned: NotificationChannel[];
  taskStatusChanged: NotificationChannel[];
  commentAdded: NotificationChannel[];
  projectInvited: NotificationChannel[];
  taskDueSoon: NotificationChannel[];
}

export interface SendNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, string>;
  channels?: NotificationChannel[];  // override preferences
}

export interface WebhookConfig {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: NotificationType[];
  active: boolean;
  createdAt: string;
}
```

```typescript
// types/common.ts
export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginationQuery {
  page?: number;    // default 1
  pageSize?: number; // default 20, max 100
}
```

```typescript
// events/events.ts
export type ServiceEvent =
  | { type: 'user.created'; payload: { userId: string; email: string; name: string } }
  | { type: 'user.updated'; payload: { userId: string; changes: string[] } }
  | { type: 'task.created'; payload: { taskId: string; projectId: string; createdBy: string } }
  | { type: 'task.assigned'; payload: { taskId: string; assigneeId: string; assignedBy: string } }
  | { type: 'task.status_changed'; payload: { taskId: string; from: TaskStatus; to: TaskStatus; changedBy: string } }
  | { type: 'comment.created'; payload: { commentId: string; taskId: string; authorId: string } }
  | { type: 'project.created'; payload: { projectId: string; ownerId: string } };

// Simple in-process event bus for inter-service communication
// In production this would be Redis pub/sub or a message queue
export class EventBus {
  private handlers: Map<string, ((event: ServiceEvent) => Promise<void>)[]>;

  on(type: string, handler: (event: ServiceEvent) => Promise<void>): void;
  emit(event: ServiceEvent): Promise<void>;
  removeAll(): void;
}
```

```typescript
// client/api-client.ts
// Typed HTTP client for inter-service calls
export class NexusApiClient {
  constructor(private baseUrl: string, private serviceToken?: string);

  // User Service
  getUser(userId: string): Promise<User>;
  getUsersByIds(ids: string[]): Promise<User[]>;
  validateToken(token: string): Promise<AuthToken>;

  // Content Service
  getTask(taskId: string): Promise<Task>;
  getProjectTasks(projectId: string, query?: PaginationQuery): Promise<PaginatedResponse<Task>>;

  // Notification Service
  sendNotification(req: SendNotificationRequest): Promise<void>;
}
```

---

### 2. User Service (`nexus-user-service`)

Handles authentication, user profiles, and authorization.

**Project Structure:**
```
nexus-user-service/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts           # Express app entry point
│   ├── server.ts          # createApp() factory
│   ├── db/
│   │   ├── schema.ts      # SQLite schema + migrations
│   │   └── client.ts      # better-sqlite3 connection
│   ├── routes/
│   │   ├── auth.routes.ts      # POST /auth/register, POST /auth/login, POST /auth/refresh
│   │   ├── users.routes.ts     # GET /users, GET /users/:id, PATCH /users/:id
│   │   └── health.routes.ts    # GET /health
│   ├── services/
│   │   ├── auth.service.ts     # register, login, token management
│   │   └── user.service.ts     # CRUD operations
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT verification (optional on some routes)
│   │   └── error.middleware.ts  # Global error handler
│   └── utils/
│       └── password.ts         # bcrypt hash/verify
└── tests/
    ├── auth.test.ts
    └── users.test.ts
```

**Database Schema (SQLite):**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | No | Register new user |
| POST | /auth/login | No | Login, returns JWT |
| POST | /auth/refresh | Yes | Refresh JWT token |
| GET | /users | Yes | List users (paginated) |
| GET | /users/:id | Yes | Get user by ID |
| GET | /users/batch | Yes | Get multiple users by IDs (query: ?ids=a,b,c) |
| PATCH | /users/:id | Yes (self or admin) | Update profile |
| GET | /health | No | Health check |

**JWT Configuration:**
- Secret: `NEXUS_JWT_SECRET` env var (default: `nexus-dev-secret-change-in-production`)
- Expiry: 24 hours
- Payload: `{ userId, email, role }`

**Port:** 3001

---

### 3. Content Service (`nexus-content-service`)

Manages projects, tasks, and comments. The core business logic service.

**Project Structure:**
```
nexus-content-service/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── db/
│   │   ├── schema.ts
│   │   └── client.ts
│   ├── routes/
│   │   ├── projects.routes.ts   # CRUD for projects
│   │   ├── tasks.routes.ts      # CRUD for tasks
│   │   ├── comments.routes.ts   # CRUD for comments
│   │   └── health.routes.ts
│   ├── services/
│   │   ├── project.service.ts
│   │   ├── task.service.ts
│   │   └── comment.service.ts
│   └── middleware/
│       ├── auth.middleware.ts    # Verify JWT from header
│       └── error.middleware.ts
└── tests/
    ├── projects.test.ts
    ├── tasks.test.ts
    └── comments.test.ts
```

**Database Schema (SQLite):**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee_id TEXT,
  created_by TEXT NOT NULL,
  due_date TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_comments_task ON comments(task_id);
```

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /projects | Yes | Create project |
| GET | /projects | Yes | List user's projects (paginated) |
| GET | /projects/:id | Yes | Get project details |
| PATCH | /projects/:id | Yes (owner) | Update project |
| DELETE | /projects/:id | Yes (owner) | Delete project |
| POST | /projects/:id/members | Yes (owner) | Add member |
| DELETE | /projects/:id/members/:userId | Yes (owner) | Remove member |
| POST | /projects/:projectId/tasks | Yes (member) | Create task |
| GET | /projects/:projectId/tasks | Yes (member) | List tasks (paginated, filterable) |
| GET | /tasks/:id | Yes | Get task details |
| PATCH | /tasks/:id | Yes (member) | Update task |
| DELETE | /tasks/:id | Yes (owner/creator) | Delete task |
| POST | /tasks/:taskId/comments | Yes (member) | Add comment |
| GET | /tasks/:taskId/comments | Yes (member) | List comments |
| DELETE | /comments/:id | Yes (author/admin) | Delete comment |
| GET | /health | No | Health check |

**Task Filtering (GET /projects/:projectId/tasks):**
- `?status=todo,in_progress` — filter by status (comma-separated)
- `?priority=high,critical` — filter by priority
- `?assigneeId=user123` — filter by assignee
- `?search=keyword` — search title and description
- `?sortBy=createdAt|dueDate|priority` — sort field
- `?sortOrder=asc|desc` — sort direction
- `?page=1&pageSize=20` — pagination

**Inter-service calls:**
- On task assignment → call notification-service to notify assignee
- On comment creation → call notification-service to notify task assignee + creator
- On task status change → call notification-service to notify relevant users

**Port:** 3002

---

### 4. Notification Service (`nexus-notification-service`)

Handles in-app notifications, email simulation, and webhook delivery.

**Project Structure:**
```
nexus-notification-service/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── db/
│   │   ├── schema.ts
│   │   └── client.ts
│   ├── routes/
│   │   ├── notifications.routes.ts  # GET /notifications, POST /notifications/send
│   │   ├── preferences.routes.ts    # GET/PUT /preferences
│   │   ├── webhooks.routes.ts       # CRUD for webhook configs
│   │   └── health.routes.ts
│   ├── services/
│   │   ├── notification.service.ts  # Core notification logic
│   │   ├── email.service.ts         # Email simulation (logs to console + DB)
│   │   ├── webhook.service.ts       # Webhook delivery with retry
│   │   └── preferences.service.ts
│   └── middleware/
│       ├── auth.middleware.ts
│       └── error.middleware.ts
└── tests/
    ├── notifications.test.ts
    ├── webhooks.test.ts
    └── preferences.test.ts
```

**Database Schema (SQLite):**
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  response_code INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
```

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /notifications/send | Service token | Send notification (called by other services) |
| GET | /notifications | Yes | Get user's notifications (paginated) |
| PATCH | /notifications/:id/read | Yes | Mark as read |
| POST | /notifications/read-all | Yes | Mark all as read |
| GET | /notifications/unread-count | Yes | Get unread count |
| GET | /preferences | Yes | Get notification preferences |
| PUT | /preferences | Yes | Update preferences |
| POST | /webhooks | Yes | Create webhook config |
| GET | /webhooks | Yes | List user's webhooks |
| PATCH | /webhooks/:id | Yes | Update webhook |
| DELETE | /webhooks/:id | Yes | Delete webhook |
| GET | /webhooks/:id/deliveries | Yes | List delivery history |
| GET | /health | No | Health check |

**Email Simulation:**
- Don't actually send emails
- Log to console: `[EMAIL] To: user@example.com | Subject: ... | Body: ...`
- Store in a `sent_emails` table for testing verification

**Webhook Delivery:**
- POST to configured URL with JSON payload
- Include `X-Nexus-Signature` header (HMAC-SHA256 of body with webhook secret)
- Retry up to 3 times with exponential backoff (1s, 5s, 15s)
- Log all delivery attempts

**Port:** 3003

---

### 5. API Gateway (`nexus-api-gateway`)

Central entry point. Routes requests, handles auth, rate limiting, and request logging.

**Project Structure:**
```
nexus-api-gateway/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── config.ts              # Service URLs, rate limits
│   ├── routes/
│   │   ├── proxy.routes.ts    # Proxy rules for all services
│   │   └── health.routes.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts      # JWT verification, attach user to req
│   │   ├── rate-limiter.ts         # Token bucket rate limiter
│   │   ├── request-logger.ts      # Log all requests with timing
│   │   ├── error.middleware.ts
│   │   └── cors.middleware.ts
│   └── proxy/
│       └── service-proxy.ts   # HTTP proxy with circuit breaker
└── tests/
    ├── auth.test.ts
    ├── rate-limiter.test.ts
    └── proxy.test.ts
```

**Route Mapping:**

```typescript
const ROUTE_MAP = {
  // Auth routes (no auth required)
  'POST /api/auth/register':    'http://localhost:3001/auth/register',
  'POST /api/auth/login':       'http://localhost:3001/auth/login',
  'POST /api/auth/refresh':     'http://localhost:3001/auth/refresh',

  // User routes
  'GET /api/users':             'http://localhost:3001/users',
  'GET /api/users/:id':         'http://localhost:3001/users/:id',
  'PATCH /api/users/:id':       'http://localhost:3001/users/:id',

  // Project routes
  'POST /api/projects':                          'http://localhost:3002/projects',
  'GET /api/projects':                           'http://localhost:3002/projects',
  'GET /api/projects/:id':                       'http://localhost:3002/projects/:id',
  'PATCH /api/projects/:id':                     'http://localhost:3002/projects/:id',
  'DELETE /api/projects/:id':                    'http://localhost:3002/projects/:id',
  'POST /api/projects/:id/members':              'http://localhost:3002/projects/:id/members',
  'DELETE /api/projects/:id/members/:userId':    'http://localhost:3002/projects/:id/members/:userId',
  'POST /api/projects/:projectId/tasks':         'http://localhost:3002/projects/:projectId/tasks',
  'GET /api/projects/:projectId/tasks':          'http://localhost:3002/projects/:projectId/tasks',

  // Task routes
  'GET /api/tasks/:id':         'http://localhost:3002/tasks/:id',
  'PATCH /api/tasks/:id':       'http://localhost:3002/tasks/:id',
  'DELETE /api/tasks/:id':      'http://localhost:3002/tasks/:id',
  'POST /api/tasks/:taskId/comments':    'http://localhost:3002/tasks/:taskId/comments',
  'GET /api/tasks/:taskId/comments':     'http://localhost:3002/tasks/:taskId/comments',
  'DELETE /api/comments/:id':            'http://localhost:3002/comments/:id',

  // Notification routes
  'GET /api/notifications':              'http://localhost:3003/notifications',
  'PATCH /api/notifications/:id/read':   'http://localhost:3003/notifications/:id/read',
  'POST /api/notifications/read-all':    'http://localhost:3003/notifications/read-all',
  'GET /api/notifications/unread-count': 'http://localhost:3003/notifications/unread-count',
  'GET /api/preferences':                'http://localhost:3003/preferences',
  'PUT /api/preferences':                'http://localhost:3003/preferences',
  'POST /api/webhooks':                  'http://localhost:3003/webhooks',
  'GET /api/webhooks':                   'http://localhost:3003/webhooks',
  'PATCH /api/webhooks/:id':             'http://localhost:3003/webhooks/:id',
  'DELETE /api/webhooks/:id':            'http://localhost:3003/webhooks/:id',
};
```

**Rate Limiting:**
- Token bucket algorithm (in-memory)
- Default: 100 requests per minute per IP
- Auth endpoints: 10 requests per minute per IP
- Configurable via environment variables

**Request Logging:**
- Log every request: `[timestamp] METHOD /path -> status (latency ms)`
- Include request ID header (`X-Request-Id`, generated via nanoid)
- Forward request ID to downstream services

**Circuit Breaker:**
- Track failures per service
- If >5 failures in 30 seconds, circuit opens
- Open circuit returns 503 immediately for 15 seconds
- Half-open: allow 1 request through, close circuit on success

**Auth Flow:**
1. Gateway receives request
2. Check if route requires auth (all except /auth/* and /health)
3. Extract `Authorization: Bearer <token>` header
4. Verify JWT using shared secret
5. Attach decoded user to request headers: `X-User-Id`, `X-User-Email`, `X-User-Role`
6. Forward to downstream service
7. Downstream services trust these headers (internal network)

**CORS:**
- Allow all origins in development
- Configurable allowed origins via env var

**Port:** 3000

---

## Inter-Service Communication

Services communicate via HTTP. The content-service calls the notification-service when events occur.

**Service-to-Service Auth:**
- Services use a shared `NEXUS_SERVICE_TOKEN` for internal calls
- Notification service's `POST /notifications/send` requires this token
- Gateway does NOT proxy this endpoint (internal only)

**Communication Pattern:**
```
Client → API Gateway → Content Service ──→ Notification Service
                              │
                              └──→ User Service (to validate user exists)
```

**Example flow: User assigns a task**
1. Client sends `PATCH /api/tasks/123 { assigneeId: "user456" }` to Gateway
2. Gateway verifies JWT, forwards to Content Service
3. Content Service updates task in DB
4. Content Service calls Notification Service: `POST /notifications/send` with `{ userId: "user456", type: "task_assigned", ... }`
5. Notification Service checks user preferences, creates in_app notification, logs email
6. Content Service returns updated task to Gateway
7. Gateway returns response to client

---

## Implementation Phases

### Phase 1: Foundation (shared-contracts)
**Team: shared-contracts**
No dependencies. Must be completed first.

**Stories:**
1. **NEXUS-SC-001**: Scaffold TypeScript project with tsup build, vitest, and package.json (complexity: 3)
2. **NEXUS-SC-002**: Implement all type definitions (user, project, notification, common) (complexity: 4)
3. **NEXUS-SC-003**: Implement Zod validation schemas for all request/response types (complexity: 4)
4. **NEXUS-SC-004**: Implement shared utilities (errors, JWT helpers, EventBus) (complexity: 4)
5. **NEXUS-SC-005**: Implement typed API client for inter-service calls (complexity: 5)

### Phase 2: Core Services (parallel after Phase 1)
**Teams: user-service, content-service, notification-service**
All depend on shared-contracts being published. Can run in parallel with each other.

#### User Service Stories:
6. **NEXUS-US-001**: Scaffold Express app with SQLite, health endpoint, error handling (complexity: 3)
   - Depends on: NEXUS-SC-001
7. **NEXUS-US-002**: Implement auth routes (register, login, refresh) with JWT (complexity: 5)
   - Depends on: NEXUS-US-001, NEXUS-SC-004
8. **NEXUS-US-003**: Implement user CRUD routes (list, get, batch, update) (complexity: 4)
   - Depends on: NEXUS-US-002
9. **NEXUS-US-004**: Add input validation with Zod schemas and comprehensive tests (complexity: 4)
   - Depends on: NEXUS-US-003, NEXUS-SC-003

#### Content Service Stories:
10. **NEXUS-CS-001**: Scaffold Express app with SQLite, health endpoint, error handling (complexity: 3)
    - Depends on: NEXUS-SC-001
11. **NEXUS-CS-002**: Implement project CRUD with ownership and member management (complexity: 5)
    - Depends on: NEXUS-CS-001, NEXUS-SC-002
12. **NEXUS-CS-003**: Implement task CRUD with filtering, sorting, and pagination (complexity: 6)
    - Depends on: NEXUS-CS-002
13. **NEXUS-CS-004**: Implement comments CRUD and inter-service notification calls (complexity: 5)
    - Depends on: NEXUS-CS-003, NEXUS-SC-005
14. **NEXUS-CS-005**: Add input validation with Zod schemas and comprehensive tests (complexity: 4)
    - Depends on: NEXUS-CS-004, NEXUS-SC-003

#### Notification Service Stories:
15. **NEXUS-NS-001**: Scaffold Express app with SQLite, health endpoint, error handling (complexity: 3)
    - Depends on: NEXUS-SC-001
16. **NEXUS-NS-002**: Implement notification sending, listing, and read status (complexity: 5)
    - Depends on: NEXUS-NS-001, NEXUS-SC-002
17. **NEXUS-NS-003**: Implement notification preferences system (complexity: 4)
    - Depends on: NEXUS-NS-002
18. **NEXUS-NS-004**: Implement webhook CRUD and delivery with retry logic (complexity: 6)
    - Depends on: NEXUS-NS-003
19. **NEXUS-NS-005**: Add email simulation, input validation, and comprehensive tests (complexity: 4)
    - Depends on: NEXUS-NS-004, NEXUS-SC-003

### Phase 3: API Gateway (after Phase 2)
**Team: api-gateway**
Depends on all services being operational.

20. **NEXUS-GW-001**: Scaffold Express app with CORS, request logging, health endpoint (complexity: 3)
    - Depends on: NEXUS-SC-001
21. **NEXUS-GW-002**: Implement JWT auth middleware and route proxying to all services (complexity: 6)
    - Depends on: NEXUS-GW-001, NEXUS-SC-004, NEXUS-US-002
22. **NEXUS-GW-003**: Implement rate limiter (token bucket) with configurable limits (complexity: 5)
    - Depends on: NEXUS-GW-002
23. **NEXUS-GW-004**: Implement circuit breaker for downstream service calls (complexity: 5)
    - Depends on: NEXUS-GW-002
24. **NEXUS-GW-005**: End-to-end integration tests through gateway to all services (complexity: 6)
    - Depends on: NEXUS-GW-003, NEXUS-GW-004, NEXUS-US-004, NEXUS-CS-005, NEXUS-NS-005

---

## Dependency Graph

```
NEXUS-SC-001 (scaffold)
├── NEXUS-SC-002 (types)
├── NEXUS-SC-003 (schemas)
├── NEXUS-SC-004 (utils/jwt)
├── NEXUS-SC-005 (api client)
│
├── NEXUS-US-001 (user scaffold)
│   └── NEXUS-US-002 (auth) ← NEXUS-SC-004
│       └── NEXUS-US-003 (user CRUD)
│           └── NEXUS-US-004 (validation/tests) ← NEXUS-SC-003
│
├── NEXUS-CS-001 (content scaffold)
│   └── NEXUS-CS-002 (projects) ← NEXUS-SC-002
│       └── NEXUS-CS-003 (tasks)
│           └── NEXUS-CS-004 (comments/notif) ← NEXUS-SC-005
│               └── NEXUS-CS-005 (validation/tests) ← NEXUS-SC-003
│
├── NEXUS-NS-001 (notif scaffold)
│   └── NEXUS-NS-002 (notifications) ← NEXUS-SC-002
│       └── NEXUS-NS-003 (preferences)
│           └── NEXUS-NS-004 (webhooks)
│               └── NEXUS-NS-005 (email/tests) ← NEXUS-SC-003
│
└── NEXUS-GW-001 (gateway scaffold)
    └── NEXUS-GW-002 (auth/proxy) ← NEXUS-SC-004, NEXUS-US-002
        ├── NEXUS-GW-003 (rate limiter)
        ├── NEXUS-GW-004 (circuit breaker)
        └── NEXUS-GW-005 (e2e tests) ← ALL service test stories
```

**Maximum parallelism after Phase 1:**
- 4 teams can work simultaneously (user, content, notification, gateway scaffold)
- Within each team, stories are sequential
- Gateway integration tests are the final convergence point

---

## Environment Variables

All services share these defaults for local development:

```env
NODE_ENV=development
NEXUS_JWT_SECRET=nexus-dev-secret-change-in-production
NEXUS_SERVICE_TOKEN=nexus-internal-service-token

# Service URLs (for inter-service calls)
USER_SERVICE_URL=http://localhost:3001
CONTENT_SERVICE_URL=http://localhost:3002
NOTIFICATION_SERVICE_URL=http://localhost:3003
GATEWAY_URL=http://localhost:3000
```

---

## Shared package.json Template

Each service should use this base structure:

```json
{
  "name": "@nexus/<service-name>",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "nanoid": "^5.0.0",
    "zod": "^3.23.0",
    "jsonwebtoken": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0",
    "@types/express": "^4.17.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/jsonwebtoken": "^9.0.0"
  }
}
```

**Additional deps per service:**
- user-service: `bcrypt`, `@types/bcrypt`
- notification-service: `node-fetch` (for webhook delivery, if not using native fetch)
- api-gateway: `http-proxy-middleware`

---

## Testing Strategy

Each service must have:
1. **Unit tests** for service layer functions
2. **Integration tests** for API routes (using supertest)
3. **Each test file uses an in-memory or temp SQLite database**

The gateway's NEXUS-GW-005 runs end-to-end tests that:
1. Start all 4 services on test ports
2. Run a complete user journey through the gateway:
   - Register a user
   - Login
   - Create a project
   - Create tasks
   - Assign a task (triggers notification)
   - Add comments
   - Check notifications
   - Test rate limiting
   - Test circuit breaker (by killing a service)

---

## Success Criteria

The platform is complete when:
1. All 25 stories are merged across all 5 teams
2. Each service starts independently and passes its own tests
3. The gateway E2E test suite passes
4. All services can be started together: `npm run dev` in each repo
5. A full user journey works through the gateway

---

## Hive Battle-Test Metrics

This spec is designed to stress-test Hive across these dimensions:

| Dimension | Target |
|-----------|--------|
| Teams | 5 concurrent |
| Total stories | 25 |
| Max parallel stories | 4 (Phase 2) |
| Cross-team dependencies | 8 |
| Agent types exercised | Senior, Intermediate, Junior, QA |
| Total expected agents | 15-25 |
| Expected merge conflicts | Medium (shared contracts consumed by all) |
| Expected duration | 60-90 minutes |
