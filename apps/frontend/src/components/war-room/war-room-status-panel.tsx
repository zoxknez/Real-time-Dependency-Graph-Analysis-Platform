"use client";

import type { WarRoomState, PackageEvidence } from "@/lib/war-room";

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border theme-border bg-black/[0.03] dark:bg-white/[0.04] p-3"><span className="block text-[10px] uppercase tracking-wide theme-text-faint">{label}</span><span className="text-sm font-semibold theme-text-primary">{value}</span></div>;
}

export function WarRoomStatusPanel({ state, evidence }: { state: WarRoomState; evidence?: PackageEvidence }) {
  const graphState = state.phase !== "BOOTSTRAP" && state.phase !== "IDLE" ? state : null;
  const analysis = graphState && "analysis" in graphState ? graphState.analysis : undefined;
  const review = graphState && "review" in graphState ? graphState.review : undefined;
  const plan = graphState && "plan" in graphState ? graphState.plan : undefined;
  const breaking = analysis?.totalBreakingChanges;
  const reviewed = review?.items ?? [];

  return (
    <section aria-label="War Room status" data-testid="war-room-status-panel" className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[10px] uppercase tracking-[0.2em] theme-text-faint">Unified War Room</p><h2 className="text-lg font-semibold theme-text-primary">Decision context</h2></div>
        <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-primary-500/10 text-primary-400">{state.phase}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Selected package" value={graphState && "selection" in graphState ? graphState.selection.package.name : "Not selected"} />
        <Metric label="Scenario" value={graphState && "scenario" in graphState ? "Active" : "Not calculated"} />
        <Metric label="API findings" value={breaking === undefined ? "Not calculated" : breaking} />
        <Metric label="Security evidence" value={evidence ? `${evidence.status} (${evidence.advisoriesReturned})` : "Not loaded"} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric label="Human review" value={review ? `${reviewed.length} annotated` : "No human review"} />
        <Metric label="Priority decisions" value={reviewed.filter((item) => item.priority).length} />
        <Metric label="Critical paths" value={review ? "Inspect available" : "Not calculated"} />
        <Metric label="Migration plan" value={plan ? `${plan.returnedSteps ?? 0} steps` : "No migration plan"} />
      </div>
      <p className="text-xs theme-text-muted border-t theme-border pt-3">Declared version exposure does not prove downstream source incompatibility. Topology, API findings, security evidence, and human priority remain separate decision axes.</p>
      {evidence && <p className="text-[11px] theme-text-faint">Source: {evidence.provider} · fetched {evidence.fetchedAt} · {evidence.advisoriesTotal} advisories found</p>}
    </section>
  );
}
