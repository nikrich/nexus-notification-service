import express from 'express';
import 'express-async-errors';
import Database from 'better-sqlite3';
import { initializeDatabase } from './db/schema.js';
import healthRoutes from './routes/health.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';

export interface AppOptions {
  db?: Database.Database;
}

export function createApp(options: AppOptions = {}): { app: express.Express; db: Database.Database } {
  const app = express();
  const db = options.db || new Database(':memory:');

  if (!options.db) {
    initializeDatabase(db);
  }

  app.use(express.json());

  // Store db on app for access in routes
  app.set('db', db);

  // Routes
  app.use(healthRoutes);
  app.use(notificationsRoutes);

  // Error handler (must be last)
  app.use(errorMiddleware);

  return { app, db };
}
