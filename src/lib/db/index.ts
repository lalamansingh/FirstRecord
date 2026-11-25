import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrations } from "./migrations";

export type Row = Record<string, unknown>;
export type Param = SQLInputValue | boolean | undefined;

let instance: DatabaseSync | null = null;

function resolveDbPath(): string {
  const p = process.env.DATABASE_PATH || "./data/firstrecord.db";
  return p === ":memory:" ? p : path.resolve(/* turbopackIgnore: true */ process.cwd(), p);
}

/** Open (once per process) and migrate the database. */
export function getDb(): DatabaseSync {
  if (instance) return instance;
  const file = resolveDbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  runMigrations(db);
  instance = db;
  return db;
}

/** Close the shared connection (used by scripts and tests). */
export function closeDb() {
  instance?.close();
  instance = null;
}

export function runMigrations(db: DatabaseSync): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id),
  );
  const ran: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, now());
      db.exec("COMMIT");
      ran.push(m.id);
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${m.id} failed: ${(e as Error).message}`);
    }
  }
  return ran;
}

function norm(params: Param[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

/** Query helpers. Always use bound parameters — never interpolate user input. */
// node:sqlite returns null-prototype rows; React cannot pass those to Client
// Components, so rows are copied into plain objects.
export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...norm(params)).map((r) => ({ ...r })) as T[];
}
export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  const row = getDb().prepare(sql).get(...norm(params));
  return (row ? { ...row } : undefined) as T | undefined;
}
export function run(sql: string, ...params: Param[]) {
  return getDb().prepare(sql).run(...norm(params));
}

let txDepth = 0;
/** Run fn inside a transaction (nested calls use savepoints). */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  const sp = `sp_${txDepth}`;
  if (txDepth === 0) db.exec("BEGIN IMMEDIATE");
  else db.exec(`SAVEPOINT ${sp}`);
  txDepth++;
  try {
    const result = fn();
    txDepth--;
    if (txDepth === 0) db.exec("COMMIT");
    else db.exec(`RELEASE ${sp}`);
    return result;
  } catch (e) {
    txDepth--;
    if (txDepth === 0) db.exec("ROLLBACK");
    else db.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

/** Insert a row from an object. Keys are trusted column names (never user input). */
export function insert(table: string, values: Record<string, Param>) {
  const keys = Object.keys(values);
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
  return run(sql, ...keys.map((k) => values[k]));
}

/** Update a row by id. Keys are trusted column names (never user input). */
export function update(table: string, id: string, values: Record<string, Param>) {
  const keys = Object.keys(values);
  if (keys.length === 0) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  return run(sql, ...keys.map((k) => values[k]), id);
}

export function now(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
