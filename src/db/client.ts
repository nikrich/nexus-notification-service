import Database from 'better-sqlite3';
import path from 'path';
import { initializeDatabase } from './schema.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'notification-service.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    initializeDatabase(db);
  }
  return db;
}

export function createDatabase(dbPath?: string): Database.Database {
  const instance = new Database(dbPath || ':memory:');
  initializeDatabase(instance);
  return instance;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
