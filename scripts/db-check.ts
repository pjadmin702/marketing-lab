import { getDB, DB_FILE } from "../src/lib/db";

const db = getDB();
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all() as { name: string }[];

console.log(`db: ${DB_FILE}`);
console.log(`tables (${tables.length}):`);
for (const t of tables) {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get() as { c: number }).c;
  console.log(`  ${t.name.padEnd(22)} rows=${count}`);
}
