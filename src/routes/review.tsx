import { FailedImports } from "@/components/qa/FailedImports";
import { tidyFileName } from "@/lib/qa-library";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SCANNERS, type ReportType, type ScannerId } from "@/lib/qa-data";
import { matchingReviewReports, reviewMatchKey } from "@/lib/qa-review-matching";
import { useQa } from "@/lib/qa-store";
import { reviewAction, reviewReason } from "@/lib/qa-triage";
import { PageHeader, Pill, ScannerLabel, fmtDate } from "@/components/qa/ui";
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
  const scoped = useMemo(() => scanner === "all" ? pending : pending.filter((r) => r.scanner === scanner), [pending, scanner]);
  const counts = useMemo(() => {
    const totals: Partial<Record<ScannerId, number>> = {};
    for (const report of pending) totals[report.scanner] = (totals[report.scanner] ?? 0) + 1;
    return totals;
  }, [pending]);
  const [batch, setBatch] = useState<{ ids: string[]; key: string; names: string[]; tests: string[] }>();
  const [batchType, setBatchType] = useState<ReportType | "">("");
  const [view, setView] = useState<"filing" | "failed">();
  const active = view ?? (pending.length || !failedImports.length ? "filing" : "failed");
  const selection = (
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Review inbox views">
      <Button variant={active === "filing" ? "default" : "outline"} aria-pressed={active === "filing"} onClick={() => setView("filing")}>Ready to review ({pending.length})</Button>
      <Button variant={active === "failed" ? "default" : "outline"} aria-pressed={active === "failed"} onClick={() => setView("failed")}>Import issues ({failedImports.length})</Button>
    </div>
  );
  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const current = scoped.find((r) => r.id === currentId) ?? scoped[0];
  const matching = useMemo(() => current ? matchingReviewReports(current, scoped) : [], [current, scoped]);
  const filter = pending.length > 0 && (
    <label className="mb-4 flex w-fit items-center gap-3 text-sm font-medium">
      Scanner
      <select value={scanner} className="h-10 rounded-md border bg-card px-3 text-sm"
        onChange={(event) => { setScanner(event.target.value as ScannerId | "all"); setCurrentId(undefined); }}>
        <option value="all">All scanners ({pending.length})</option>
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
    if (!current || filingBusy || active !== "filing") return;
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
      if (active !== "filing" || batch || filingBusy) return;
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
        <PageHeader eyebrow="Review" title={pending.length ? "No reports for this scanner" : failedImports.length ? "No reports waiting to file" : "All caught up"} />
        {selection}
        {filter}
        <p className="text-lg text-muted-foreground">{pending.length ? "Choose another scanner to continue reviewing." : failedImports.length ? "Open Import issues to review PDFs that could not be filed." : "Every report is filed. New reports that need a decision will appear here."}</p>
        {lastFiling && <Button variant="outline" disabled={filingBusy} onClick={() => void undoFiling()} className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-muted"><Undo2 className="size-4" />{lastFiling.batchId ? "Undo last group" : "Undo last filing"}</Button>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow={`Review · ${scoped.length} left`} title="Needs attention">
        <p className="text-sm text-muted-foreground">Clean Daily and Monthly reports are filed automatically. Reports with unreadable results or other exceptions appear here for review.</p>
        {lastFiling && <Button variant="outline" disabled={filingBusy} onClick={() => void undoFiling()}><Undo2 />{lastFiling.batchId ? "Undo last group" : "Undo last filing"}</Button>}
      </PageHeader>
      {selection}
      {filter}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border bg-card p-5">
            <ScannerLabel id={current.scanner} />
            <p className="mt-2 break-all font-mono text-sm">{tidyFileName(current)}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">Original: {current.fileName}</p>
            <p className="text-muted-foreground">{fmtDate(current.date)} · {current.time} · {current.sizeKb} KB · {current.pages} pages</p>
            {reviewReason(current) && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium"><span className="block">Why: {reviewReason(current)}</span><span className="mt-1 block font-normal">What to do: {reviewAction(current)}</span></p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Suggested:</span>
              <Pill tone={current.confidence === "uncertain" ? "warn" : "muted"}>{current.suggested} · {current.confidence}</Pill>
            </div>
            <p className="mt-4 text-sm font-medium">{filingBusy ? "Updating QA Library…" : "File as"}</p>
            <div className="mt-2 grid gap-2">
              {CHOICES.map((c) => (
                <Button variant="outline" key={c.type} disabled={filingBusy} onClick={() => void doFile(c.type)}
                  className={cn("flex items-center justify-between rounded-md border px-4 py-3 text-left text-lg font-medium transition-colors hover:bg-accent",
                    c.type === current.suggested && "border-primary bg-primary/8")}>
                  {c.type}<Kbd>{c.key}</Kbd>
                </Button>
              ))}
            </div>
            {matching.length > 1 && (
              <Button variant="outline" className="mt-3 w-full" disabled={filingBusy} onClick={showMatches}>Review {matching.length} matching reports</Button>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Filing sorts the document. It is not clinical sign-off.</p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border bg-card" role="list" aria-label="Queue">
            {scoped.map((r) => (
              <Button variant="outline" key={r.id} role="listitem" onClick={() => setCurrentId(r.id)}
                className={cn("flex w-full items-center justify-between gap-2 border-b px-4 py-2 text-left text-sm last:border-0 hover:bg-muted", r.id === current.id && "bg-accent")}>
                <ScannerLabel id={r.scanner} /><span className="font-mono text-muted-foreground">{r.date.slice(5)}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="min-w-0"><ReportPreview key={current.id} report={current} initialView={current.printedStatus === "Not available" || !current.printedStatus ? "pdf" : "readings"} /></div>
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


