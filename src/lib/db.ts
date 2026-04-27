import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "marketing-lab.sqlite");
const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "schema.sql");

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;
  mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
  runMigrations(db);
  return db;
}

/**
 * Idempotent column-additions for tables that existed before a column did.
 * SQLite ALTER TABLE has no IF NOT EXISTS, so we check pragma first.
 */
function runMigrations(db: Database.Database): void {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  ensureColumn("search_queue", "category", "category TEXT");
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export const DB_FILE = DB_PATH;
