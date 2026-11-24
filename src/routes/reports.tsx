import { filingLabel } from "@/lib/qa-triage";
import { startScan } from "@/lib/qa-scan-log";
import { tidyFileName } from "@/lib/qa-library";
import { createFileRoute } from "@tanstack/react-router";
import { Search, FileUp, LoaderCircle, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { SCANNERS, isScheduledQaDay, type Report, type ReportType, type ScannerId } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { PageHeader, Pill, ScannerDot, ScannerLabel, fmtDate } from "@/components/qa/ui";
import { ReportPreview } from "@/components/qa/ReportPreview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { importQaPdf } from "@/lib/qa-pdf";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports library — CT QA Manager Companion" },
      { name: "description", content: "Search thousands of CT QA reports instantly and see Daily receipt per scanner on a calendar." },
      { property: "og:title", content: "Reports library — CT QA Manager Companion" },
      { property: "og:description", content: "Instant search and Daily receipt calendar for CT QA reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reports,
});

const ROW = 52;

function Reports() {
  const { reports, addReport, addFailedImport } = useQa();
  const picker = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    setReading(true); setImportMessage("");
    const scan = startScan("selected-files");
    let count = 0; const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const result = await importQaPdf(file, addReport, addFailedImport);
        scan.recordRead(result);
        const { report, archiveError } = result;
        setSelected(report);
        count++;
        if (archiveError) errors.push(`${file.name}: could not save to the QA Library (${archiveError})`);
      } catch (error) { scan.recordFailure(error); errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not read this PDF"}`); }
    }
    scan.finish(files.length);
    setReading(false); setImportMessage(`${count} local PDF${count === 1 ? "" : "s"} read. ${errors.join(" ")}`);
    if (picker.current) picker.current.value = "";
  };
  const [q, setQ] = useState("");
  const [scanner, setScanner] = useState<ScannerId | "all">("all");
  const [type, setType] = useState<ReportType | "all">("all");
  const [selected, setSelected] = useState<Report | null>(null);
  const dq = useDeferredValue(q.trim().toLowerCase());

  const rows = useMemo(() => reports.filter((r) =>
    (scanner === "all" || r.scanner === scanner) && (type === "all" || r.type === type) &&
    (resultFilter === "all" || (resultFilter === "local" ? r.source === "uploaded" : r.printedStatus === resultFilter)) &&
    (!dq || searchText(r).includes(dq))), [reports, scanner, type, dq, resultFilter]);

  const box = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const height = 560;
  const first = Math.max(0, Math.floor(scrollTop / ROW) - 5);
  const visible = rows.slice(first, first + Math.ceil(height / ROW) + 10);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Reports" title={`${rows.length.toLocaleString()} reports`}>
        <Button onClick={() => picker.current?.click()} disabled={reading}>{reading ? <LoaderCircle className="animate-spin" /> : <FileUp />}{reading ? "Reading PDFs…" : "Open local PDFs"}</Button>
        <input ref={picker} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={e => void importFiles(e.target.files)} aria-label="Open local PDFs" />
      </PageHeader>
      {importMessage && <p role="status" className="mb-4 break-words text-sm">{importMessage}</p>}
      <Calendar reports={reports} scanner={scanner === "all" ? "flash" : scanner} onScanner={setScanner} onReport={setSelected} />

      <details className="mt-6 border-t pt-4">
        <summary className="cursor-pointer text-sm font-medium">Search report library</summary>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); box.current?.scrollTo(0, 0); }} placeholder="Search name, date, test, kernel, NOT OK…"
            className="h-11 w-full rounded-md border bg-card pl-9 pr-3 outline-none focus:ring-2 focus:ring-ring" aria-label="Search reports" />
        </label>
        <select value={scanner} onChange={(e) => setScanner(e.target.value as ScannerId | "all")} className="h-11 rounded-md border bg-card px-3" aria-label="Scanner">
          <option value="all">All scanners</option>
          {SCANNERS.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.model.replace("SOMATOM ", "")}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as ReportType | "all")} className="h-11 rounded-md border bg-card px-3" aria-label="Type">
          <option value="all">All types</option><option>Daily</option><option>Monthly</option><option>Other</option>
        </select>
        <select value={resultFilter} onChange={e => { setResultFilter(e.target.value); box.current?.scrollTo(0, 0); }} className="h-11 rounded-md border bg-card px-3" aria-label="Printed result">
          <option value="all">All results</option><option value="NOT OK">Printed NOT OK</option><option value="OK">Printed OK</option><option value="local">Local PDFs</option>
        </select>
      </div>

      <div className="mt-4">
        <div ref={box} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ height }} className="overflow-y-auto rounded-lg border bg-card" role="list">
          <div style={{ height: rows.length * ROW, position: "relative" }}>
            {visible.map((r, i) => (
              <Button variant="ghost" key={r.id} role="listitem" onClick={() => setSelected(r)} style={{ top: (first + i) * ROW, height: ROW }}
                className={cn("absolute inset-x-0 flex justify-start gap-2 rounded-none border-b px-3 text-left", selected?.id === r.id && "bg-accent")}>
                <span className="w-28 font-mono text-sm">{r.date}</span>
                <span className="min-w-0 flex-1 truncate"><ScannerLabel id={r.scanner} /></span>
                <span className="hidden flex-1 truncate font-mono text-sm text-muted-foreground md:block">{tidyFileName(r)}</span>
                {r.printedStatus === "NOT OK" && <Pill tone="bad">NOT OK</Pill>}
                <span className="hidden sm:inline"><Pill tone={r.needsReview ? "warn" : "muted"}>{r.needsReview ? filingLabel(r) : r.type}</Pill></span>
              </Button>
            ))}
          </div>
        </div>
      </div>
      </details>
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto p-4 sm:p-6">
          <DialogTitle className="pr-8">Report · {selected ? fmtDate(selected.date) : ""}</DialogTitle>
          <DialogDescription className="sr-only">Original PDF and recorded QA results.</DialogDescription>
          {selected && <ReportPreview key={selected.id} report={reports.find(r => r.id === selected.id) ?? selected} initialView="pdf" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Calendar({ reports, scanner, onScanner, onReport }: { reports: Report[]; scanner: ScannerId; onScanner: (s: ScannerId) => void; onReport: (report: Report) => void }) {
  const { today, schedule } = useQa();
  const currentMonth = today.slice(0, 7);
  const [monthPick, setMonth] = useState<string | null>(null);
  const month = monthPick ?? currentMonth;
  const [day, setDay] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const mine = useMemo(() => reports.filter((r) => r.scanner === scanner), [reports, scanner]);
  const firstSeen = mine.at(-1)?.date ?? today;
  const cells = useMemo(() => {
    const start = new Date(month + "-01T00:00:00Z");
    const lead = start.getUTCDay();
    const len = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let i = 1; i <= len; i++) out.push(`${month}-${String(i).padStart(2, "0")}`);
    return out;
  }, [month]);
  const shift = (n: number) => {
    const d = new Date(month + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7)); setDay(null); setAnchor(null);
  };
  const close = () => { setDay(null); setAnchor(null); };
  const open = (d: string, el: HTMLButtonElement) => {
    if (d === day) { close(); return; }
    const grid = gridRef.current;
    if (grid) {
      const gr = grid.getBoundingClientRect();
      const br = el.getBoundingClientRect();
      const width = Math.min(340, gr.width - 8);
      const left = Math.min(Math.max(br.left - gr.left + br.width / 2 - width / 2, 4), Math.max(4, gr.width - width - 4));
      const flip = br.bottom - gr.top > gr.height * 0.55;
      setAnchor({ left, width, flip, top: flip ? br.top - gr.top - 6 : br.bottom - gr.top + 6 });
    }
    setDay(d);
  };
  useEffect(() => {
    if (!day) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || popRef.current?.contains(t) || t.closest("[data-day-cell]")) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [day]);
  const dayReports = day ? mine.filter((r) => r.date === day) : [];
  const counted = cells.filter((d): d is string => !!d && d <= today && d >= firstSeen && isScheduledQaDay(d, schedule.days));
  const got = counted.filter((d) => mine.some((r) => r.date === d && r.type === "Daily")).length;
  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <h2 className="min-w-36 text-center text-lg font-semibold">{new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <Button variant="outline" size="icon" onClick={() => shift(1)} disabled={month >= currentMonth} aria-label="Next month"><ChevronRight /></Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {SCANNERS.map((s) => (
            <Button variant="outline" key={s.id} onClick={() => { onScanner(s.id); close(); }} className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm", scanner === s.id ? "border-primary bg-accent" : "hover:bg-muted")}>
              <ScannerDot id={s.id} />{s.name}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => <div key={w}>{w}</div>)}
      </div>
      <div ref={gridRef} className="relative mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const rs = mine.filter((r) => r.date === d);
          const daily = rs.some((r) => r.type === "Daily");
          const monthly = rs.some((r) => r.type === "Monthly");
          const bad = rs.some((r) => r.printedStatus === "NOT OK");
          const future = d > today;
          const expected = !future && d >= firstSeen && isScheduledQaDay(d, schedule.days);
          const state = bad ? "bad" : daily ? "ok" : expected ? "miss" : "none";
          return (
            <Button variant="ghost" key={d} data-day-cell aria-label={`${d}${bad ? ": NOT OK" : daily ? ": Daily received" : expected ? ": No Daily report" : ""}`} disabled={future && !rs.length} onClick={(e) => open(d, e.currentTarget)} aria-pressed={d === day}
              className={cn("relative flex h-12 px-0 flex-col items-center justify-center rounded-md border text-sm sm:h-14",
                state === "ok" && "border-ok/40 bg-ok/15", state === "bad" && "border-destructive/50 bg-destructive/15",
                state === "miss" && "border-2 border-dashed border-warn", state === "none" && "border-transparent text-muted-foreground/50",
                d === day && "ring-2 ring-primary", d === today && "font-bold")}>
              {Number(d.slice(8))}
              {monthly && <span className="absolute bottom-1 size-1.5 rounded-full bg-primary" />}
            </Button>
          );
        })}
        {day && anchor && (
          <div ref={popRef} style={{ left: anchor.left, top: anchor.top, width: anchor.width }}
            className={cn("absolute z-50 rounded-lg border bg-card p-3 shadow-xl", anchor.flip && "-translate-y-full")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{fmtDate(day)}</h3>
              <Button variant="ghost" size="icon" onClick={close} aria-label="Close day details"><X className="size-4" /></Button>
            </div>
            {dayReports.length === 0 ? (
              <p className="mt-1 text-sm text-warn">No report available for this date.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {dayReports.map((r) => (
                  <li key={r.id}><Button variant="ghost" onClick={() => { close(); onReport(r); }} className="flex h-auto w-full items-center gap-2 whitespace-normal rounded-md px-2 py-3 text-left">
                    <FileText className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block">{r.type} · {r.time}</span><span className="block text-xs text-muted-foreground">{r.originalUrl ? "Open PDF report" : "Open report details"}</span></span>
                    <Pill tone={r.printedStatus === "NOT OK" ? "bad" : r.printedStatus === "OK" ? "ok" : "muted"}>{r.printedStatus ?? "Not available"}</Pill>
                  </Button></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{got} of {counted.length} days received</p>

    </section>
  );
}

const searchCache = new WeakMap<Report, string>();
function searchText(r: Report) {
  let t = searchCache.get(r);
  if (!t) {
    t = [r.fileName, tidyFileName(r), r.date, r.scanner, r.type, r.printedStatus ?? "", ...(r.printedSections ?? []).map((x) => `${x.label} ${x.status}`),
      ...r.measurements.map((m) => `${m.context} ${m.kernel ?? ""} ${m.mode ?? ""}`)].join(" ").toLowerCase();
    searchCache.set(r, t);
  }
  return t;
}
