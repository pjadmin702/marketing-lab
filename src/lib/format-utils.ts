/** Unix-seconds → "5m ago" / "2h ago" / locale date. */
export function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

/** Extract a string message from any thrown value. */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
