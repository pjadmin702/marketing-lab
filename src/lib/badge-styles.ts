export const CONFIDENCE_BADGE: Record<string, string> = {
  demoed:         "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  named_specific: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  name_drop:      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pitch_bait:     "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function confidenceLabel(c: string): string {
  return c === "named_specific" ? "named" : c === "pitch_bait" ? "pitch" : c;
}

export const OPPORTUNITY_KIND_BADGE: Record<string, string> = {
  content_idea:    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  product_idea:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ad_test:         "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  traffic_play:    "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  tool_to_install: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  experiment:      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};
