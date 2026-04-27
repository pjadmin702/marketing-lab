import Link from "next/link";

export type NavTabKey = "tiktok" | "reddit" | "plan";

export function NavTabs({ active }: { active: NavTabKey }) {
  const tab = (key: NavTabKey, href: string, label: string) => {
    const isActive = key === active;
    return (
      <Link
        key={key}
        href={href}
        className={
          "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
          (isActive
            ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900")
        }
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="mr-3 text-xs font-mono uppercase tracking-widest text-zinc-500">marketing-lab</span>
      {tab("tiktok", "/", "TikTok")}
      {tab("reddit", "/reddit", "Reddit")}
      {tab("plan", "/plan", "Plan")}
    </div>
  );
}
