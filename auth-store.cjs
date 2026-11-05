"use strict";

const session = require("express-session");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const DB_FILE = path.join(__dirname, "sethelion-sessions.db");
const DEFAULT_TTL = 8 * 60 * 60 * 1000;

class SQLiteSessionStore extends session.Store {
  constructor() {
    super();

    this.db = new DatabaseSync(DB_FILE);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_expired_idx
      ON sessions(expired);
    `);

    this.getStatement = this.db.prepare(
      "SELECT sess, expired FROM sessions WHERE sid = ?"
    );

    this.setStatement = this.db.prepare(`
      INSERT INTO sessions (sid, sess, expired)
      VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET
        sess = excluded.sess,
        expired = excluded.expired
    `);

    this.deleteStatement = this.db.prepare(
      "DELETE FROM sessions WHERE sid = ?"
    );

    this.expiryStatement = this.db.prepare(
      "UPDATE sessions SET expired = ? WHERE sid = ?"
    );

    this.cleanupStatement = this.db.prepare(
      "DELETE FROM sessions WHERE expired <= ?"
    );

    fs.chmodSync(DB_FILE, 0o600);
  }

  expiry(sessionData) {
    const cookie = sessionData.cookie || {};

    if (cookie.expires) {
      const time = new Date(cookie.expires).getTime();
      if (Number.isFinite(time)) return time;
    }

    return Date.now() +
      (Number(cookie.maxAge) > 0 ? Number(cookie.maxAge) : DEFAULT_TTL);
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);

      if (!row) return callback(null, null);

      if (row.expired <= Date.now()) {
        this.deleteStatement.run(sid);
        return callback(null, null);
      }

      callback(null, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sessionData, callback) {
    try {
      this.setStatement.run(
        sid,
        JSON.stringify(sessionData),
        this.expiry(sessionData)
      );

      this.cleanupStatement.run(Date.now());

      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid, sessionData, callback) {
    try {
      this.expiryStatement.run(this.expiry(sessionData), sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.deleteStatement.run(sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = SQLiteSessionStore;
