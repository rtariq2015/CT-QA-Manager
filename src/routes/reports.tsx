import { pdfReadErrorCode } from "@/lib/qa-read-error";
import { filingLabel, reportReviewLane } from "@/lib/qa-triage";
import { startScan } from "@/lib/qa-scan-log";
import { tidyFileName } from "@/lib/qa-library";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { AlertCircle, CalendarDays, List, Search, FileUp, LoaderCircle, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { SCANNERS, isOutOfLimit, isScheduledQaDay, type Report, type ReportType, type ScannerId } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { PageHeader, Pill, ScannerDot, ScannerLabel, fmtDate } from "@/components/qa/ui";
import { ReportPreview } from "@/components/qa/ReportPreview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { importQaPdf } from "@/lib/qa-pdf";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { calendarDayResults, QA_ALERTS, reportAlert, reportResult } from "@/lib/qa-report-status";
import { dateFilter, monthFilter, scannerFilter } from "@/lib/qa-route-filters";

const RESULT_FILTER = ["NOT OK", "Aborted", "OK", "exceptions", "out-of-limit", "local"] as const;
type ReportSearch = {
  scanner?: ScannerId | undefined;
  type?: ReportType | undefined;
  date?: string | undefined;
  month?: string | undefined;
  result?: typeof RESULT_FILTER[number] | undefined;
  view?: "calendar" | "list" | undefined;
};

export const Route = createFileRoute("/reports")({
  validateSearch: (search): ReportSearch => ({
    scanner: scannerFilter(search["scanner"]),
    type: search["type"] === "Daily" || search["type"] === "Monthly" || search["type"] === "Other" ? search["type"] : undefined,
    date: dateFilter(search["date"]),
    month: monthFilter(search["month"]),
    result: RESULT_FILTER.find((result) => result === search["result"]),
    view: search["view"] === "calendar" || search["view"] === "list" ? search["view"] : undefined,
  }),
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
  const { reports, addReport, addFailedImport, today } = useQa();
  const { scanner, type, date, month, result: resultFilter, view } = Route.useSearch();
  const showCalendar = (view ?? (date || type || resultFilter ? "list" : "calendar")) === "calendar";
  const navigate = Route.useNavigate();
  const linkedId = useLocation({ select: ({ state }) => state.qaReportId });
  const linkedPage = useLocation({ select: ({ state }) => state.qaReportPage });
  const [openedId, setOpenedId] = useState<string>();
  const reportId = openedId ?? linkedId;
  const highlightPage = reportId === linkedId ? linkedPage : undefined;
  const selected = reportId ? reports.find((report) => report.id === reportId) : undefined;
  const openReport = (report: Report) => setOpenedId(report.id);
  const closeReport = () => {
    setOpenedId(undefined);
    if (linkedId) void navigate({ search: true, state: {}, replace: true, resetScroll: false });
  };
  const picker = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    setReading(true); setImportMessage("");
    const scan = startScan("selected-files");
    let count = 0, skipped = 0; const errors: string[] = [];
    let lastImported: Report | undefined;
    for (const file of Array.from(files)) {
      try {
        const result = await importQaPdf(file, addReport, addFailedImport);
        scan.recordRead(result);
        const { report, archiveError } = result;
        lastImported = report;
        count++;
        if (archiveError) errors.push(`${file.name}: could not save to the QA Library (${archiveError})`);
      } catch (error) {
        scan.recordFailure(error);
        if (pdfReadErrorCode(error) === "empty-pdf") skipped++;
        else errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not read this PDF"}`);
      }
    }
    scan.finish(files.length);
    setReading(false); setImportMessage(`${count} local PDF${count === 1 ? "" : "s"} read. ${skipped ? `${skipped} empty skipped. ` : ""}${errors.join(" ")}`);
    if (lastImported) openReport(lastImported);
    if (picker.current) picker.current.value = "";
  };
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());

  const rows = useMemo(() => reports.filter((r) =>
    (!scanner || r.scanner === scanner) && (!type || r.type === type) &&
    (!date || r.date === date) && (!month || r.date.startsWith(month)) &&
    matchesResult(r, resultFilter) && (!dq || searchText(r).includes(dq))), [reports, scanner, type, date, month, dq, resultFilter]);

  const box = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const height = 480;
  const first = Math.max(0, Math.floor(scrollTop / ROW) - 5);
  const visible = rows.slice(first, first + Math.ceil(height / ROW) + 10);
  const setFilters = (filters: ReportSearch) => {
    setScrollTop(0);
    box.current?.scrollTo(0, 0);
    void navigate({ search: (current) => ({ ...current, ...filters }), replace: true, resetScroll: false });
  };
  const clear = () => {
    setQ("");
    setFilters({ scanner: undefined, type: undefined, date: undefined, month: undefined, result: undefined });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="QA library" title="Reports">
        <Button onClick={() => picker.current?.click()} disabled={reading}>{reading ? <LoaderCircle className="animate-spin" /> : <FileUp />}{reading ? "Reading PDFs…" : "Open local PDFs"}</Button>
        <input ref={picker} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={e => void importFiles(e.target.files)} aria-label="Open local PDFs" />
      </PageHeader>
      {importMessage && <p role="status" className="mb-4 break-words text-sm">{importMessage}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setScrollTop(0); box.current?.scrollTo(0, 0); if (showCalendar && e.target.value.trim()) setFilters({ view: "list" }); }} placeholder="Search name, date, test, or result…"
            className="h-11 w-full rounded-md border bg-card pl-9 pr-3 outline-none focus:ring-2 focus:ring-ring" aria-label="Search reports" />
        </label>
        <div className="flex rounded-md border bg-card p-0.5" aria-label="Report view">
          <Button size="sm" variant={showCalendar ? "secondary" : "ghost"} aria-pressed={showCalendar} onClick={() => setFilters({ view: "calendar" })}><CalendarDays />Calendar</Button>
          <Button size="sm" variant={showCalendar ? "ghost" : "secondary"} aria-pressed={!showCalendar} onClick={() => setFilters({ view: "list" })}><List />List</Button>
        </div>
      </div>
      {showCalendar ? (
        <Calendar reports={reports} scanner={scanner ?? "flash"} month={month ?? date?.slice(0, 7) ?? today.slice(0, 7)}
          onScanner={(value) => setFilters({ scanner: value })} onMonth={(value) => setFilters({ month: value, date: undefined })} onReport={openReport} />
      ) : <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={scanner ?? "all"} onChange={(e) => setFilters({ scanner: scannerFilter(e.target.value) })} className="h-10 rounded-md border bg-card px-3 text-sm" aria-label="Scanner">
          <option value="all">All scanners</option>
          {SCANNERS.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.model.replace("SOMATOM ", "")}</option>)}
        </select>
        <select value={type ?? "all"} onChange={(e) => setFilters({ type: e.target.value === "all" ? undefined : e.target.value as ReportType })} className="h-10 rounded-md border bg-card px-3 text-sm" aria-label="Type">
          <option value="all">All types</option><option>Daily</option><option>Monthly</option><option>Other</option>
        </select>
        <select value={resultFilter ?? "all"} onChange={(e) => setFilters({ result: RESULT_FILTER.find((result) => result === e.target.value) })} className="h-10 rounded-md border bg-card px-3 text-sm" aria-label="QA result">
          <option value="all">All results</option><option value="exceptions">QA exceptions</option><option value="NOT OK">Printed NOT OK</option><option value="Aborted">Aborted</option><option value="out-of-limit">Outside printed limits</option><option value="OK">Printed OK</option><option value="local">Local PDFs</option>
        </select>
        {date || month ? <Button variant="outline" size="sm" onClick={() => setFilters({ date: undefined, month: undefined })} aria-label="Clear date filter">{date ? fmtDate(date) : monthLabel(month!)}<X /></Button> : null}
        {(scanner || type || resultFilter || date || month || q) && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">{rows.length.toLocaleString()} {rows.length === 1 ? "report" : "reports"}</span>
      </div>

      {rows.length > 0 ? (
        <div ref={box} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ maxHeight: height }} className="overflow-y-auto rounded-lg border bg-card" role="list" aria-label="Reports">
          <div style={{ height: rows.length * ROW, position: "relative" }}>
            {visible.map((r, i) => {
              const alert = reportAlert(r);
              return <Button variant="ghost" key={r.id} onClick={() => openReport(r)} style={{ top: (first + i) * ROW, height: ROW }}
                className={cn("absolute inset-x-0 flex justify-start gap-2 rounded-none border-b px-3 text-left", selected?.id === r.id && "bg-accent")}>
                <span className="w-28 font-mono text-sm">{r.date}</span>
                <span className="min-w-0 flex-1 truncate"><ScannerLabel id={r.scanner} /></span>
                <span className="hidden flex-1 truncate font-mono text-sm text-muted-foreground md:block">{tidyFileName(r)}</span>
                {alert && <Pill tone={QA_ALERTS[alert].tone}>{QA_ALERTS[alert].label}</Pill>}
                <span className="hidden sm:inline" title={filingLabel(r)}><Pill tone="muted">{r.type}</Pill></span>
              </Button>;
            })}
          </div>
        </div>
      ) : <p className="rounded-lg border bg-card p-6 text-muted-foreground">{reports.length ? "No reports match these filters." : "Import QA PDFs to start your library."}</p>}
      </>}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) closeReport(); }}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto p-4 sm:p-6">
          <DialogTitle className="pr-8">Report · {selected ? fmtDate(selected.date) : ""}</DialogTitle>
          <DialogDescription className="sr-only">Original PDF and recorded QA results.</DialogDescription>
          {selected && <ReportPreview key={selected.id} report={selected} initialView="pdf" {...(highlightPage ? { highlightPage } : {})} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const monthLabel = (month: string) => new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const dayTone = {
  ok: "border-ok/40 bg-ok/15 hover:bg-ok/25",
  bad: "border-destructive/50 bg-destructive/15 hover:bg-destructive/25",
  warn: "border-warn/50 bg-warn/15 hover:bg-warn/25",
  miss: "border-dashed border-warn",
  muted: "border-transparent text-muted-foreground/50",
};

function matchesResult(report: Report, filter: ReportSearch["result"]) {
  if (!filter) return true;
  if (filter === "local") return report.source === "uploaded";
  if (filter === "exceptions") return Boolean(reportAlert(report)) && reportReviewLane(report) === "exceptions";
  if (filter === "out-of-limit") return report.measurements.some(isOutOfLimit);
  return report.printedStatus === filter;
}

function Calendar({ reports, scanner, month, onScanner, onMonth, onReport }: { reports: Report[]; scanner: ScannerId; month: string; onScanner: (scanner: ScannerId) => void; onMonth: (month: string) => void; onReport: (report: Report) => void }) {
  const { today, schedule } = useQa();
  const currentMonth = today.slice(0, 7);
  const [day, setDay] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const mine = useMemo(() => reports.filter((r) => r.scanner === scanner), [reports, scanner]);
  const byDate = useMemo(() => {
    const days = new Map<string, Report[]>();
    for (const report of mine) {
      const day = days.get(report.date);
      if (day) day.push(report);
      else days.set(report.date, [report]);
    }
    return days;
  }, [mine]);
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
    onMonth(d.toISOString().slice(0, 7)); setDay(null); setAnchor(null);
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
  const dayReports = day ? byDate.get(day) ?? [] : [];
  const dayDaily = calendarDayResults(dayReports).latestDaily?.report;
  const orderedDayReports = dayDaily ? [dayDaily, ...dayReports.filter((report) => report !== dayDaily)] : dayReports;
  const counted = cells.filter((d): d is string => !!d && d <= today && d >= firstSeen && isScheduledQaDay(d, schedule.days));
  const got = counted.filter((d) => byDate.get(d)?.some((r) => r.type === "Daily")).length;
  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <h2 className="min-w-36 text-center text-lg font-semibold">{monthLabel(month)}</h2>
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
          const rs = byDate.get(d) ?? [];
          const monthly = rs.some((r) => r.type === "Monthly");
          const { latestDaily, otherAlert } = calendarDayResults(rs);
          const alert = otherAlert && QA_ALERTS[otherAlert.alert];
          const future = d > today;
          const expected = !future && d >= firstSeen && isScheduledQaDay(d, schedule.days);
          const state = latestDaily?.result.tone ?? (expected ? "miss" : "muted");
          const dailyLabel = latestDaily ? `Latest Daily · ${latestDaily.result.label}` : "No Daily report";
          const otherLabel = otherAlert && alert ? `Other report alert · ${otherAlert.report.type} · ${alert.label}` : undefined;
          const title = [dailyLabel, otherLabel].filter(Boolean).join(". ");
          return (
            <Button variant="ghost" key={d} data-day-cell aria-label={`${d} · ${title}`} title={title} disabled={future && !rs.length} onClick={(e) => open(d, e.currentTarget)} aria-pressed={d === day}
              className={cn("relative flex h-12 px-0 flex-col items-center justify-center rounded-md border text-sm sm:h-14",
                dayTone[state], state === "miss" && "border-2",
                d === day && "ring-2 ring-primary", d === today && "font-bold")}>
              {Number(d.slice(8))}
              {alert && <AlertCircle className={cn("absolute right-1 top-1 size-3", alert.tone === "bad" ? "text-destructive" : "text-warn")} aria-hidden />}
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
              <>
                {!dayDaily && <p className="mt-1 px-2 text-sm text-muted-foreground">No Daily report</p>}
                <ul className="mt-2 flex max-h-[min(370px,50vh)] flex-col gap-1 overflow-y-auto">
                  {orderedDayReports.map((r) => {
                    const { label, tone } = reportResult(r);
                    return <li key={r.id}>
                      <Button variant="ghost" onClick={() => { close(); onReport(r); }}
                        className={cn("flex h-auto w-full items-center gap-2 whitespace-normal rounded-md px-2 py-2 text-left", r === dayDaily && "bg-muted/50")}>
                        <FileText className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block">{r === dayDaily ? "Latest Daily" : r.type} · {r.time}</span>
                          <span className="block text-xs text-muted-foreground">{r.originalUrl ? "Open PDF report" : "Open report details"}</span>
                        </span>
                        <Pill tone={tone}>{label}</Pill>
                      </Button>
                    </li>;
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Calendar legend">
          <li className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", dayTone.ok)} aria-hidden />Daily OK</li>
          <li className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", dayTone.bad)} aria-hidden />Daily flagged</li>
          <li className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", dayTone.warn)} aria-hidden />Daily needs review</li>
          <li className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", dayTone.miss)} aria-hidden />Daily missing</li>
          <li className="flex items-center gap-1.5"><AlertCircle className="size-3 text-destructive" aria-hidden />Alert on another report</li>
        </ul>
        <p>Daily reports received on {got} of {counted.length} scheduled days</p>
      </div>
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
