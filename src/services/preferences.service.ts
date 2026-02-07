import Database from 'better-sqlite3';

export type NotificationChannel = 'in_app' | 'email' | 'webhook';

export interface NotificationPreferences {
  userId: string;
  taskAssigned: NotificationChannel[];
  taskStatusChanged: NotificationChannel[];
  commentAdded: NotificationChannel[];
  projectInvited: NotificationChannel[];
  taskDueSoon: NotificationChannel[];
}

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId'> = {
  taskAssigned: ['in_app'],
  taskStatusChanged: ['in_app'],
  commentAdded: ['in_app'],
  projectInvited: ['in_app', 'email'],
  taskDueSoon: ['in_app', 'email'],
};

interface PreferencesRow {
  user_id: string;
  task_assigned: string;
  task_status_changed: string;
  comment_added: string;
  project_invited: string;
  task_due_soon: string;
}

function rowToPreferences(row: PreferencesRow): NotificationPreferences {
  return {
    userId: row.user_id,
    taskAssigned: JSON.parse(row.task_assigned),
    taskStatusChanged: JSON.parse(row.task_status_changed),
    commentAdded: JSON.parse(row.comment_added),
    projectInvited: JSON.parse(row.project_invited),
    taskDueSoon: JSON.parse(row.task_due_soon),
  };
}

export class PreferencesService {
  constructor(private db: Database.Database) {}

  get(userId: string): NotificationPreferences {
    const row = this.db.prepare(
      'SELECT * FROM notification_preferences WHERE user_id = ?'
    ).get(userId) as PreferencesRow | undefined;

    if (!row) {
      return { userId, ...DEFAULT_PREFERENCES };
    }

    return rowToPreferences(row);
  }

  update(userId: string, preferences: Partial<Omit<NotificationPreferences, 'userId'>>): NotificationPreferences {
    const existing = this.get(userId);

    const updated = {
      taskAssigned: preferences.taskAssigned ?? existing.taskAssigned,
      taskStatusChanged: preferences.taskStatusChanged ?? existing.taskStatusChanged,
      commentAdded: preferences.commentAdded ?? existing.commentAdded,
      projectInvited: preferences.projectInvited ?? existing.projectInvited,
      taskDueSoon: preferences.taskDueSoon ?? existing.taskDueSoon,
    };

    this.db.prepare(`
      INSERT INTO notification_preferences (user_id, task_assigned, task_status_changed, comment_added, project_invited, task_due_soon)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        task_assigned = excluded.task_assigned,
        task_status_changed = excluded.task_status_changed,
        comment_added = excluded.comment_added,
        project_invited = excluded.project_invited,
        task_due_soon = excluded.task_due_soon
    `).run(
      userId,
      JSON.stringify(updated.taskAssigned),
      JSON.stringify(updated.taskStatusChanged),
      JSON.stringify(updated.commentAdded),
      JSON.stringify(updated.projectInvited),
      JSON.stringify(updated.taskDueSoon),
    );

    return { userId, ...updated };
  }
}
