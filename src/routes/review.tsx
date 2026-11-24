import { FailedImports } from "@/components/qa/FailedImports";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SCANNERS, type ReportType, type ScannerId } from "@/lib/qa-data";
import { matchingReviewReports, reviewMatchKey } from "@/lib/qa-review-matching";
import { useQa } from "@/lib/qa-store";
import { reviewAction, reviewReason, reviewReasonCode } from "@/lib/qa-triage";
import { PageHeader, ScannerLabel } from "@/components/qa/ui";
import { ReportPreview } from "@/components/qa/ReportPreview";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review queue — CT QA Manager Companion" },
      { name: "description", content: "File QA reports as Daily, Monthly or Other with one key press and instant undo." },
      { property: "og:title", content: "Review queue — CT QA Manager Companion" },
      { property: "og:description", content: "Keyboard-first filing of Siemens CT QA reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Review,
});

const CHOICES: { type: ReportType; key: string }[] = [
  { type: "Daily", key: "D" }, { type: "Monthly", key: "M" }, { type: "Other", key: "O" },
];

function Review() {
  const { pending, failedImports, file, fileMatching, undo, filingBusy, lastFiling } = useQa();
  const [scanner, setScanner] = useState<ScannerId | "all">("all");
  const [view, setView] = useState<"filing" | "exceptions" | "failed">();
  const lanes = useMemo(() => {
    const filing: typeof pending = [];
    const exceptions: typeof pending = [];
    for (const report of pending) {
      (reviewReasonCode(report) === "non-routine-report" ? filing : exceptions).push(report);
    }
    return { filing, exceptions };
  }, [pending]);
  const active = view ?? (lanes.filing.length ? "filing" : lanes.exceptions.length ? "exceptions" : failedImports.length ? "failed" : "filing");
  const lane = active === "failed" ? [] : lanes[active];
  const scoped = scanner === "all" ? lane : lane.filter((r) => r.scanner === scanner);
  const counts: Partial<Record<ScannerId, number>> = {};
  for (const report of lane) counts[report.scanner] = (counts[report.scanner] ?? 0) + 1;
  const [batch, setBatch] = useState<{ ids: string[]; key: string; names: string[]; tests: string[] }>();
  const [batchType, setBatchType] = useState<ReportType | "">("");
  const selectView = (next: typeof active) => {
    setView(next);
    setScanner("all");
  };
  const selection = (
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Review inbox views">
      <Button variant={active === "filing" ? "default" : "outline"} aria-pressed={active === "filing"} onClick={() => selectView("filing")}>Filing decisions ({lanes.filing.length})</Button>
      <Button variant={active === "exceptions" ? "default" : "outline"} aria-pressed={active === "exceptions"} onClick={() => selectView("exceptions")}>QA exceptions ({lanes.exceptions.length})</Button>
      <Button variant={active === "failed" ? "default" : "outline"} aria-pressed={active === "failed"} onClick={() => selectView("failed")}>Import issues ({failedImports.length})</Button>
    </div>
  );
  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const current = scoped.find((r) => r.id === currentId) ?? scoped[0];
  const matching = useMemo(() => current ? matchingReviewReports(current, scoped) : [], [current, scoped]);
  const filter = lane.length > 0 && (
    <label className="mb-4 flex w-fit items-center gap-3 text-sm font-medium">
      Scanner
      <select value={scanner} className="h-10 rounded-md border bg-card px-3 text-sm"
        onChange={(event) => { setScanner(event.target.value as ScannerId | "all"); setCurrentId(undefined); }}>
        <option value="all">All scanners ({lane.length})</option>
        {SCANNERS.map((s) => <option value={s.id} key={s.id}>{s.name} ({counts[s.id] ?? 0})</option>)}
      </select>
    </label>
  );

  const undoRef = useRef(undo);
  useEffect(() => { undoRef.current = undo; }, [undo]);
  const undoFiling = async (expectedBatchId?: number) => {
    try {
      const filing = await undoRef.current(expectedBatchId);
      if (filing) setCurrentId(filing.id);
    } catch (error) {
      toast.error("Could not undo filing", { description: String(error) });
    }
  };

  const doFile = async (type: ReportType) => {
    if (!current || filingBusy || active === "failed") return;
    const idx = scoped.indexOf(current);
    const next = scoped[idx + 1] ?? scoped[idx - 1];
    try {
      if (!await file(current.id, type)) return;
      setCurrentId(next?.id);
      toast.success(`Filed as ${type}`, { description: current.fileName, action: { label: "Undo", onClick: () => void undoFiling() } });
    } catch (error) {
      toast.error("Could not file this PDF", { description: String(error) });
    }
  };

  const showMatches = () => {
    const key = current && reviewMatchKey(current);
    if (!key || matching.length < 2) return;
    setBatch({
      key, ids: matching.map((r) => r.id),
      names: matching.map((r) => r.fileName),
      tests: current.printedSections?.map((section) => section.label) ?? [],
    });
    setBatchType("");
  };

  const confirmBatch = async () => {
    if (!batch || !batchType || filingBusy) return;
    const result = await fileMatching(batch.ids, batch.key, batchType);
    setBatch(undefined);
    if (result.stopped) toast.warning(`${result.filed} of ${batch.ids.length} filed. Review the remaining reports and try again.`, result.filed ? {
      action: { label: "Undo group", onClick: () => void undoFiling(result.batchId) },
    } : undefined);
    else toast.success(`Filed ${result.filed} reports as ${batchType}`, {
      action: { label: "Undo group", onClick: () => void undoFiling(result.batchId) },
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (active === "failed" || batch || filingBusy) return;
      if ((e.target instanceof HTMLElement && e.target.closest("input,select,textarea,[contenteditable]")) || e.metaKey || e.ctrlKey) return;
      const k = e.key.toUpperCase();
      const c = CHOICES.find((x) => x.key === k);
      if (c) { e.preventDefault(); void doFile(c.type); }
      if (k === "Z") void undoFiling();
      if (k === "J" || k === "K") {
        const i = current ? scoped.indexOf(current) : 0;
        const n = scoped[k === "J" ? i + 1 : i - 1];
        if (n) setCurrentId(n.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (active === "failed") {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Review" title="Import issues" />
        {selection}
        <FailedImports />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Review" title={lane.length ? "No reports for this scanner" : active === "exceptions" ? "No QA exceptions" : "No filing decisions"} />
        {selection}
        {filter}
        <p className="text-lg text-muted-foreground">{lane.length ? "Choose another scanner to continue reviewing." : active === "exceptions" ? "Reported QA exceptions will appear here." : "Recognized reports are filed automatically."}</p>
        {lastFiling && <Button variant="outline" disabled={filingBusy} onClick={() => void undoFiling()} className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-muted"><Undo2 className="size-4" />{lastFiling.batchId ? "Undo last group" : "Undo last filing"}</Button>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Review" title="QA review">
        {lastFiling && <Button variant="outline" size="sm" disabled={filingBusy}
          onClick={() => void undoFiling()}><Undo2 />{lastFiling.batchId ? "Undo last group" : "Undo last filing"}</Button>}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
        {selection}
        {filter}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border bg-card lg:sticky lg:top-24">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Queue <span className="text-muted-foreground">· {scoped.length}</span></h2>
          <div className="max-h-[55vh] overflow-y-auto" role="list" aria-label="Queue">
            {scoped.map((r) => (
              <Button variant="ghost" key={r.id} role="listitem" onClick={() => setCurrentId(r.id)}
                className={cn("flex h-auto w-full flex-col items-start gap-0.5 rounded-none border-b px-3 py-2 text-left last:border-0", r.id === current.id && "bg-accent")}>
                <span className="flex w-full items-center justify-between gap-1 text-sm">
                  <ScannerLabel id={r.scanner} /><span className="shrink-0 text-xs text-muted-foreground">{r.date.slice(5)}</span>
                </span>
                <span className={cn("text-xs", r.printedStatus === "NOT OK" ? "text-destructive" : "text-muted-foreground")}>
                  {r.autoFiled ? `${r.type} · ` : ""}{r.printedStatus === "NOT OK" ? "Printed NOT OK" : r.printedStatus === "Aborted" ? "Aborted" : r.autoFiled ? "Review needed" : "Filing pending"}
                </span>
              </Button>
            ))}
          </div>
        </section>
        <div className="min-w-0 space-y-4">
          <section className="space-y-2 rounded-lg border bg-card p-3" aria-label="Review actions">
            <p className={cn("text-sm font-semibold", current.printedStatus === "NOT OK" && "text-destructive")}>
              {reviewReason(current) ?? "Check this report"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {current.autoFiled && <Button size="sm" disabled={filingBusy} onClick={() => void doFile(current.type)}>Acknowledge</Button>}
              {CHOICES.map(({ type, key }) => (
                <Button variant="outline" size="sm" key={type} disabled={filingBusy} onClick={() => void doFile(type)}>
                  {type}<Kbd>{key}</Kbd>
                </Button>
              ))}
              {matching.length > 1 && <Button variant="outline" size="sm" disabled={filingBusy} onClick={showMatches}>Review {matching.length} matching reports</Button>}
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Review guidance</summary>
              <p className="mt-1">{reviewAction(current)}</p>
            </details>
          </section>
          <ReportPreview key={current.id} report={current} initialView={current.printedStatus === "Not available" || !current.printedStatus ? "pdf" : "readings"} />
        </div>
      </div>
      <Dialog open={Boolean(batch)} onOpenChange={(open) => { if (!open && !filingBusy) setBatch(undefined); }}>
        {batch && <DialogContent>
          <DialogTitle>File {batch.ids.length} matching reports</DialogTitle>
          <DialogDescription>These reports share a scanner, software version, printed tests, and measurement layout. Confirm their filing category.</DialogDescription>
          <p className="text-sm font-medium">{batch.tests.join(" · ")}</p>
          <ul className="max-h-40 space-y-1 overflow-auto rounded-md border p-3 text-sm">
            {batch.names.map((name, index) => <li key={batch.ids[index]} className="break-all">{name}</li>)}
          </ul>
          <label className="grid gap-1 text-sm font-medium">File as
            <select value={batchType} disabled={filingBusy} className="h-10 rounded-md border bg-card px-3"
              onChange={(event) => setBatchType(event.target.value as ReportType | "")}>
              <option value="">Choose a category</option>
              {CHOICES.map(({ type }) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <DialogFooter>
            <Button variant="outline" disabled={filingBusy} onClick={() => setBatch(undefined)}>Cancel</Button>
            <Button disabled={!batchType || filingBusy} onClick={() => void confirmBatch()}>{filingBusy ? "Updating QA Library…" : `File ${batch.ids.length} reports`}</Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</kbd>;
}


