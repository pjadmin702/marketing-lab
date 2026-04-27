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
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export const DB_FILE = DB_PATH;
