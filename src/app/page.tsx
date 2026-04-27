export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-2xl px-8 py-24">
        <div className="mb-2 text-xs font-mono uppercase tracking-widest text-zinc-500">
          marketing-lab
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          TikTok Research Lab
        </h1>
        <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Search TikTok, select videos, transcribe, and extract a tools
          inventory + organic-content action plan.
        </p>
        <div className="mt-10 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Status</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Foundation ready
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Next chunk</span>
            <span className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
              setup script
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
