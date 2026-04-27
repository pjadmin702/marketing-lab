/**
 * One-time backfill: read every existing aggregate_analyses.raw_json blob
 * and populate the normalized cross-search knowledge-graph tables (methods,
 * systems, hooks, frameworks, viral_signals, pitfalls, speed_tactics + their
 * mention tables).
 *
 * Idempotent — safe to re-run. New analyses created via the live pipeline
 * already write to these tables, so this is only for searches that were
 * analyzed before the schema update.
 */
import { getDB } from "../src/lib/db";
import { writeNormalizedEntities } from "../src/lib/analyze";
import type { AggregateOutput } from "../src/lib/analyze-prompts";

const db = getDB();

const rows = db
  .prepare("SELECT search_id, raw_json FROM aggregate_analyses ORDER BY search_id ASC")
  .all() as { search_id: number; raw_json: string | null }[];

if (rows.length === 0) {
  console.log("no aggregate_analyses rows — nothing to backfill");
  process.exit(0);
}

let ok = 0;
let skipped = 0;
let failed = 0;

for (const r of rows) {
  if (!r.raw_json) {
    skipped++;
    console.log(`  search ${r.search_id}: no raw_json, skipping`);
    continue;
  }
  try {
    const out = JSON.parse(r.raw_json) as AggregateOutput;
    db.transaction(() => writeNormalizedEntities(r.search_id, out))();
    ok++;
    console.log(`  search ${r.search_id}: backfilled`);
  } catch (e) {
    failed++;
    console.error(`  search ${r.search_id}: failed — ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\ndone. ok=${ok} skipped=${skipped} failed=${failed}`);

const counts = [
  "methods", "systems", "hooks", "frameworks",
  "viral_signals", "pitfalls", "speed_tactics",
];
console.log("\nentity counts:");
for (const t of counts) {
  const c = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c;
  console.log(`  ${t.padEnd(16)} ${c}`);
}
