import { NavTabs } from "@/components/NavTabs";
import { PlanEditor } from "@/components/PlanEditor";
import { getPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default function PlanPage() {
  const plan = getPlan();
  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <NavTabs active="plan" />
      <PlanEditor initialContent={plan.content} initialUpdatedAt={plan.updated_at} />
    </div>
  );
}
