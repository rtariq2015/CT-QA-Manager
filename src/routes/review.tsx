import { FailedImports } from "@/components/qa/FailedImports";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SCANNERS, scannerById, type ReportType, type ScannerId } from "@/lib/qa-data";
import { matchingReviewReports, reviewMatchKey } from "@/lib/qa-review-matching";
import { useQa } from "@/lib/qa-store";
import { reportReviewLane, reviewAction, reviewReason } from "@/lib/qa-triage";
import { PageHeader, ScannerDot } from "@/components/qa/ui";
import { ReportPreview } from "@/components/qa/ReportPreview";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QA_ALERTS, reportAlert } from "@/lib/qa-report-status";
import { monthFilter, scannerFilter } from "@/lib/qa-route-filters";

const REVIEW_LANES = ["exceptions", "filing", "failed"] as const;
type ReviewSearch = { scanner?: ScannerId | undefined; month?: string | undefined; lane?: typeof REVIEW_LANES[number] | undefined };

export const Route = createFileRoute("/review")({
  validateSearch: (search): ReviewSearch => ({
    scanner: scannerFilter(search["scanner"]),
    month: monthFilter(search["month"]),
    lane: REVIEW_LANES.find((lane) => lane === search["lane"]),
  }),
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
  const { scanner, month, lane: view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const lanes = useMemo(() => {
    const filing: typeof pending = [];
    const exceptions = [];
    for (const report of pending) {
      if (reportReviewLane(report) === "filing") filing.push(report);
      else {
        const issue = reportAlert(report);
        exceptions.push({ report, rank: issue ? QA_ALERTS[issue].rank : 0 });
      }
    }
    return { filing, exceptions: exceptions.sort((a, b) => b.rank - a.rank).map(({ report }) => report) };
  }, [pending]);
  const active = view ?? (lanes.exceptions.length ? "exceptions" : lanes.filing.length ? "filing" : failedImports.length ? "failed" : "exceptions");
  const lane = useMemo(() => active === "failed" ? [] : month ? lanes[active].filter((report) => report.date.startsWith(month)) : lanes[active], [active, month, lanes]);
  const scoped = useMemo(() => scanner ? lane.filter((r) => r.scanner === scanner) : lane, [scanner, lane]);
  const counts: Partial<Record<ScannerId, number>> = {};
  for (const report of lane) counts[report.scanner] = (counts[report.scanner] ?? 0) + 1;
  const [batch, setBatch] = useState<{ ids: string[]; key: string; names: string[]; tests: string[] }>();
  const [batchType, setBatchType] = useState<ReportType | "">("");
  const [currentId, setCurrentId] = useState<string | undefined>();
  const current = scoped.find((r) => r.id === currentId) ?? scoped[0];
  const selectedIndex = current ? scoped.indexOf(current) : -1;
  const selectView = (next: typeof active) => {
    setCurrentId(undefined);
    void navigate({ search: (search) => ({ ...search, lane: next }), replace: true, resetScroll: false });
  };
  const selection = (
    <div className="flex flex-wrap gap-2" aria-label="Review inbox views">
      <Button size="sm" variant={active === "exceptions" ? "default" : "outline"} aria-pressed={active === "exceptions"} onClick={() => selectView("exceptions")}>QA exceptions ({lanes.exceptions.length})</Button>
      <Button size="sm" variant={active === "filing" ? "default" : "outline"} aria-pressed={active === "filing"} onClick={() => selectView("filing")}>Filing decisions ({lanes.filing.length})</Button>
      <Button size="sm" variant={active === "failed" ? "default" : "outline"} aria-pressed={active === "failed"} onClick={() => selectView("failed")}>Import issues ({failedImports.length})</Button>
    </div>
  );
  const matching = useMemo(() => current ? matchingReviewReports(current, scoped) : [], [current, scoped]);
  const filter = active !== "failed" && <div className="flex flex-wrap items-center gap-2">
    {lane.length > 0 && (
    <label className="flex w-fit items-center gap-2 text-sm font-medium">
      <span className="sr-only">Scanner</span>
      <select value={scanner ?? "all"} className="h-9 rounded-md border bg-card px-3 text-sm"
        onChange={(event) => {
          const next = scannerFilter(event.target.value);
          setCurrentId(undefined);
          void navigate({ search: (search) => ({ ...search, scanner: next }), replace: true, resetScroll: false });
        }}>
        <option value="all">All scanners ({lane.length})</option>
        {SCANNERS.map((s) => <option value={s.id} key={s.id}>{s.name} ({counts[s.id] ?? 0})</option>)}
      </select>
    </label>
    )}
    {month && <Button variant="outline" size="sm" aria-label="Clear month filter" onClick={() => void navigate({ search: (search) => ({ ...search, month: undefined }), replace: true })}>{month}<X /></Button>}
  </div>;

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

  const doFile = async (type: ReportType, acknowledged = false) => {
    if (!current || filingBusy || active === "failed") return;
    const idx = scoped.indexOf(current);
    const next = scoped[idx + 1] ?? scoped[idx - 1];
    try {
      if (!await file(current.id, type)) return;
      setCurrentId(next?.id);
      toast.success(acknowledged ? "Report acknowledged" : `Filed as ${type}`, { description: current.fileName, action: { label: "Undo", onClick: () => void undoFiling() } });
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
      if ((e.target instanceof HTMLElement && e.target.closest("input,select,textarea,[contenteditable],[role=menu]")) || e.metaKey || e.ctrlKey || e.altKey) return;
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
        <div className="mb-4">{selection}</div>
        <FailedImports />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Review" title={lane.length ? "No reports for this scanner" : active === "exceptions" ? "No QA exceptions" : "No filing decisions"} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">{selection}{filter}</div>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {selection}
        {filter}
      </div>
      <div className="grid items-start gap-3 min-[900px]:grid-cols-[minmax(9.5rem,11rem)_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)]">
        <section className="hidden overflow-hidden rounded-lg border bg-card min-[900px]:sticky min-[900px]:top-20 min-[900px]:block">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Queue <span className="text-muted-foreground">· {scoped.length}</span></h2>
          <div className="max-h-[62vh] overflow-y-auto" aria-label="Queue">
            {scoped.map((r) => {
              const issue = reportAlert(r);
              return <Button variant="ghost" key={r.id} aria-pressed={r.id === current.id} onClick={() => setCurrentId(r.id)}
                className={cn("flex h-auto w-full flex-col items-start gap-0.5 rounded-none border-b px-3 py-2 text-left last:border-0", r.id === current.id && "bg-accent")}>
                <span className="flex w-full items-center justify-between gap-1 text-sm">
                  <span className="flex items-center gap-2"><ScannerDot id={r.scanner} />{scannerById(r.scanner).name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.date.slice(5)} · {r.time.slice(0, 5)}</span>
                </span>
                <span className={cn("whitespace-normal text-xs", issue && QA_ALERTS[issue].tone === "bad" ? "text-destructive" : "text-muted-foreground")}>
                  {r.autoFiled ? `${r.type} · ` : ""}{issue && issue !== "review" ? QA_ALERTS[issue].label : r.autoFiled ? "Review needed" : "Filing pending"}
                </span>
              </Button>;
            })}
          </div>
        </section>
        <div className="flex min-w-0 items-center gap-1.5 min-[900px]:hidden">
          <Button size="icon" variant="outline" aria-label="Previous report" disabled={selectedIndex <= 0} onClick={() => setCurrentId(scoped[selectedIndex - 1]?.id)}><ChevronLeft /></Button>
          <select className="h-9 min-w-0 flex-1 truncate rounded-md border bg-card px-2 text-sm" aria-label="Select queued report" value={current.id} onChange={(e) => setCurrentId(e.target.value)}>
            {scoped.map((report, index) => <option key={report.id} value={report.id}>{index + 1}/{scoped.length} · {scannerById(report.scanner).name} · {report.date.slice(5)} {report.time.slice(0, 5)}</option>)}
          </select>
          <Button size="icon" variant="outline" aria-label="Next report" disabled={selectedIndex >= scoped.length - 1} onClick={() => setCurrentId(scoped[selectedIndex + 1]?.id)}><ChevronRight /></Button>
        </div>
        <div className="min-w-0 space-y-4">
          <section className="space-y-2 rounded-lg border bg-card p-3.5" aria-label="Review actions">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cn("text-sm font-semibold", current.printedStatus === "NOT OK" && "text-destructive")}>{reviewReason(current) ?? "Check this report"}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {current.autoFiled && <Button size="sm" disabled={filingBusy} onClick={() => void doFile(current.type, true)}>Acknowledge</Button>}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="sm" variant={current.autoFiled ? "outline" : "default"} disabled={filingBusy}>
                    {current.autoFiled ? "Change filing" : "File as"}<ChevronDown />
                  </Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {CHOICES.map(({ type, key }) => <DropdownMenuItem key={type} onSelect={() => void doFile(type)}>{type}<Kbd>{key}</Kbd></DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
                {matching.length > 1 && <Button variant="outline" size="sm" disabled={filingBusy} onClick={showMatches}>Review {matching.length} matching reports</Button>}
              </div>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Review guidance</summary>
              <p className="mt-1">{reviewAction(current)}</p>
            </details>
          </section>
          <ReportPreview key={current.id} report={current} initialView={current.printedStatus === "Aborted" || current.printedStatus === "Not available" || !current.printedStatus ? "pdf" : "readings"} />
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
  return <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</kbd>;
}


