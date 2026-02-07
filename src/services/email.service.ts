import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export interface SentEmail {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: string;
}

interface SentEmailRow {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
}

function rowToSentEmail(row: SentEmailRow): SentEmail {
  return {
    id: row.id,
    toEmail: row.to_email,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
  };
}

export class EmailService {
  constructor(private db: Database.Database) {}

  send(toEmail: string, subject: string, body: string): SentEmail {
    const id = nanoid();

    console.log(`[EMAIL] To: ${toEmail} | Subject: ${subject} | Body: ${body}`);

    this.db.prepare(`
      INSERT INTO sent_emails (id, to_email, subject, body, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(id, toEmail, subject, body);

    const row = this.db.prepare('SELECT * FROM sent_emails WHERE id = ?').get(id) as SentEmailRow;
    return rowToSentEmail(row);
  }

  list(): SentEmail[] {
    const rows = this.db.prepare(
      'SELECT * FROM sent_emails ORDER BY created_at DESC'
    ).all() as SentEmailRow[];
    return rows.map(rowToSentEmail);
  }
}
