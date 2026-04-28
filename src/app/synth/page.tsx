import { NavTabs } from "@/components/NavTabs";
import { SynthView } from "@/components/SynthView";
import { listBriefs } from "@/lib/synth";

export const dynamic = "force-dynamic";

export default function SynthPage() {
  const briefs = listBriefs();
  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <NavTabs active="synth" />
      <div className="flex-1 overflow-hidden">
        <SynthView initial={briefs} />
      </div>
    </div>
  );
}
