import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      alias TEXT NOT NULL, avatar TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, invite TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL REFERENCES users(id), season TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      club TEXT NOT NULL DEFAULT '', joined_at TEXT NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      author_id TEXT REFERENCES users(id), kind TEXT NOT NULL DEFAULT 'talk',
      bot_name TEXT, body TEXT NOT NULL, match_json TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id TEXT REFERENCES users(id), bot_name TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reactions (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('fire','laugh','salt')),
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS posts_room_time ON posts(room_id, created_at);
    CREATE INDEX IF NOT EXISTS comments_post_time ON comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS messages_room_users_time ON messages(room_id, sender_id, recipient_id, created_at);
    CREATE INDEX IF NOT EXISTS messages_unread ON messages(recipient_id, read_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS collectors (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_seen TEXT,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY, collector_id TEXT NOT NULL REFERENCES collectors(id),
      event_key TEXT NOT NULL, post_id TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
      image BLOB, mime TEXT, source TEXT NOT NULL, captured_at TEXT NOT NULL,
      UNIQUE(collector_id,event_key)
    );
    CREATE TABLE IF NOT EXISTS news_articles (
      post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      headline TEXT NOT NULL, topic TEXT NOT NULL, event_identity TEXT NOT NULL,
      facts_json TEXT NOT NULL, UNIQUE(room_id,event_identity)
    );
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
