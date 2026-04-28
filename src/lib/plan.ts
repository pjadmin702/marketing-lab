import { getDB } from "./db";

export const DEFAULT_PLAN_CONTENT = `# North Star

**Goal:** Drive organic traffic to my Etsy shops via TikTok (and Instagram) — without paying agency rates.

The marketing-lab is a research instrument: TikTok + Reddit get scraped for what's actually working *right now*, the brain at \`/library\` dedupes findings across searches, and the highest-recurrence patterns become the blueprint for the AI tools I build next.

## My shops

_Fill these in — Synth and "Suggest from plan" both read this section to tailor recommendations to your actual products._

- **Shop 1 name:** _e.g. Kooki Studio_
- **Shop 1 URL:** _https://www.etsy.com/shop/..._
- **What I sell:** _e.g. 3D printed hand-painted earrings_
- **Price range:** _e.g. $12–$28_
- **Production constraint:** _e.g. I can ship up to 30 orders/day_
- **Current sales/day:** _3_
- **Target sales/day:** _15_

(Add a Shop 2 section below if you have multiple shops.)

## Posting cadence

- **Current:** _e.g. 1 video / week_
- **Target:** _e.g. 1 video / day_
- **Time budget for content:** _e.g. 30 min/day shooting + 30 min editing_

## Tools we're building

_(Pull ideas from \`/library\` once enough searches accumulate. Update status as you go: idea → planning → building → shipped.)_

- [ ] **(idea)** _example: AI script writer that takes an Etsy listing URL → outputs 3 TikTok hook variations using top hooks from /library_

## Tools we're using

_(Pull from \`/library?type=tools\` — these are the ones the lab keeps surfacing across creators.)_

- _none yet_

## Open questions

- _Which methods recur in 5+ creators? (those are proven)_
- _Which methods only show up once? (those are flash-in-pan, skip)_
- _What hook formula works best for MY product category?_

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
