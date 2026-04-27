import { getDB } from "./db";

export const DEFAULT_PLAN_CONTENT = `# North Star

**Goal:** Drive organic traffic to my Etsy shops via TikTok (and Instagram) — without paying agency rates.

The marketing-lab is a research instrument: TikTok + Reddit get scraped for what's actually working *right now*, the brain at \`/library\` dedupes findings across searches, and the highest-recurrence patterns become the blueprint for the AI tools I build next.

## Tools we're building

_(Pull ideas from \`/library\` once enough searches accumulate. Update status as you go: idea → planning → building → shipped.)_

- [ ] **(idea)** _example: AI script writer that takes an Etsy listing URL → outputs 3 TikTok hook variations using top hooks from /library_

## Tools we're using

_(Pull from \`/library?type=tools\` — these are the ones the lab keeps surfacing across creators.)_

- _none yet_

## Open questions

- _What niche searches haven't I run yet?_
- _Which methods recur in 5+ creators? (those are proven)_
- _Which methods only show up once? (those are flash-in-pan, skip)_

## Decisions log

- **YYYY-MM-DD** — _short note explaining a non-obvious choice_
`;

export interface PlanDoc {
  content: string;
  updated_at: number;
}

export function getPlan(): PlanDoc {
  const db = getDB();
  const row = db.prepare("SELECT content, updated_at FROM plan_doc WHERE id = 1").get() as
    | PlanDoc
    | undefined;
  if (row) return row;
  // First read — seed with the default and return it.
  const now = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO plan_doc (id, content, updated_at) VALUES (1, ?, ?)").run(
    DEFAULT_PLAN_CONTENT,
    now,
  );
  return { content: DEFAULT_PLAN_CONTENT, updated_at: now };
}

export function setPlan(content: string): PlanDoc {
  const db = getDB();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO plan_doc (id, content, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
  ).run(content, now);
  return { content, updated_at: now };
}
