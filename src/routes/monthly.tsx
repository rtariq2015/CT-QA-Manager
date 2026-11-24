import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, CircleDashed, FileText } from "lucide-react";
import { useMemo } from "react";
import { MONTHLY_CHECKLIST, SCANNERS, addDays, isScheduledQaDay, scannerById, type ScannerId } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { PageHeader, Pill, ScannerDot, fmtDate } from "@/components/qa/ui";
import { cn } from "@/lib/utils";
import { MONTHLY_RESULTS, monthlyCoverage, monthlyResultAlert, monthlyWaiting } from "@/lib/qa-monthly-status";
import { QA_ALERTS, reportAlert } from "@/lib/qa-report-status";
import { monthFilter, scannerFilter } from "@/lib/qa-route-filters";

type MonthlySearch = { scanner?: ScannerId | undefined; month?: string | undefined };

export const Route = createFileRoute("/monthly")({
  validateSearch: (search): MonthlySearch => ({ scanner: scannerFilter(search["scanner"]), month: monthFilter(search["month"]) }),
  head: () => ({
    meta: [
      { title: "Monthly checklist — CT QA Manager Companion" },
      { name: "description", content: "See which monthly constancy tests were found for each CT scanner and what is still missing." },
      { property: "og:title", content: "Monthly checklist — CT QA Manager Companion" },
      { property: "og:description", content: "Monthly constancy test coverage per scanner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Monthly,
});

function monthOptions(today: string, reportMonths: string[]) {
  const out: string[] = [];
  const d = new Date(today.slice(0, 7) + "-01T00:00:00Z");
  for (let i = 0; i < 12; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); }
  return [...new Set([...out, ...reportMonths])].sort().reverse();
}

function Monthly() {
  const { reports, today, schedule } = useQa();
  const { scanner: scannerPick, month: monthPick } = Route.useSearch();
  const navigate = Route.useNavigate();
  const scanner = scannerPick ?? "flash";
  const currentMonth = today.slice(0, 7);
  const months = useMemo(() => monthOptions(today, reports.map((r) => r.date.slice(0, 7)).filter((m) => m <= currentMonth)), [today, currentMonth, reports]);
  const month = monthPick && months.includes(monthPick) ? monthPick : currentMonth;

  const coverage = useMemo(() => monthlyCoverage(reports, scanner, month), [reports, scanner, month]);
  const { done, passed, missing, filed } = coverage;
  const items = useMemo(() => [...coverage.items].sort((a, b) => {
    const rank = (item: typeof a) => item.current ? MONTHLY_RESULTS[item.current.status].rank : 0;
    return rank(b) - rank(a);
  }), [coverage]);
  const exceptions = useMemo(() => filed.flatMap((report) => {
    const alert = reportAlert(report);
    return alert ? [{ report, alert }] : [];
  }), [filed]);
  const monthlyReview = reports.filter((r) =>
    r.scanner === scanner && r.date.startsWith(month) && r.needsReview && (r.type === "Monthly" || r.suggested === "Monthly"));
  const unfiled = monthlyReview.filter((r) => r.type !== "Monthly").length;
  const filedForReview = monthlyReview.length - unfiled;
  const awaiting = useMemo(() => new Set(unfiled ? monthlyWaiting(reports, scanner, month) : []), [unfiled, reports, scanner, month]);
  const noResult = missing.length - awaiting.size;

  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const summaryEnd = month === currentMonth ? Number(today.slice(8, 10)) : last;
  const daysExpected = new Set(Array.from({ length: summaryEnd }, (_, i) => addDays(`${month}-01`, i)).filter((date) => isScheduledQaDay(date, schedule.days)));
  const summary = SCANNERS.map((s) => {
    const mine = reports.filter((r) => r.scanner === s.id && r.date.startsWith(month));
    const days = new Set(mine.filter((r) => r.type === "Daily" && daysExpected.has(r.date)).map((r) => r.date)).size;
    return { s, days, cov: monthlyCoverage(mine, s.id, month), alerts: mine.flatMap((report) => {
      const alert = reportAlert(report);
      return alert && alert !== "review" ? [`${report.date} (${report.type}, ${QA_ALERTS[alert].label})`] : [];
    }) };
  });
  const monthName = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-5xl">
      <section className="hidden print:block">
        <h1 className="mb-4 text-2xl font-semibold">CT QA monthly summary · {monthName}</h1>
        {summary.map(({ s, days, cov, alerts }) => (
          <div key={s.id} className="mb-6 break-inside-avoid border-b pb-4">
            <h2 className="text-lg font-semibold">{s.name} · {s.model}</h2>
            <p>Daily reports received: {days} of {daysExpected.size} scheduled days</p>
            <p>Monthly tests with results: {cov.done} of {MONTHLY_CHECKLIST.length}{cov.missing.length ? ` (no result found: ${cov.missing.map((c) => c.label).join(", ")})` : ""}</p>
            <p>Latest Monthly tests printed OK: {cov.passed} of {MONTHLY_CHECKLIST.length}</p>
            {cov.items.filter(({ current }) => current && monthlyResultAlert(current.status)).map(({ metric, label, current }) =>
              current && <p key={metric}>{label} · {MONTHLY_RESULTS[current.status].label} · {current.report.date}</p>)}
            <p>Report exception history: {alerts.length === 0 ? "none" : alerts.join(", ")}</p>
          </div>
        ))}
        <p className="text-sm">Filing is not clinical sign-off. Review with the department physicist.</p>
      </section>
      <div className="print:hidden">
      <PageHeader eyebrow={`Due day ${schedule.dueDay}`} title="Monthly checklist">
        <button onClick={() => window.print()} className="no-print rounded-md border px-4 py-2 text-sm hover:bg-muted">Print monthly summary</button>
        <select value={month} onChange={(e) => { const next = e.target.value; void navigate({ search: (search) => ({ ...search, month: next }), replace: true }); }} className="h-10 rounded-md border bg-card px-3" aria-label="Month">
          {months.map((m) => <option key={m} value={m}>{new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}
        </select>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SCANNERS.map((s) => (
          <Button variant="outline" size="sm" key={s.id} aria-pressed={scanner === s.id} onClick={() => void navigate({ search: (search) => ({ ...search, scanner: s.id }), replace: true })} className={cn("flex items-center gap-2", scanner === s.id && "border-primary bg-accent font-medium")}>
            <ScannerDot id={s.id} />{s.name}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{done} of {items.length} tests recorded · {scannerById(scanner).name}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone={passed > 0 ? "ok" : "muted"}>{passed} latest OK</Pill>
        {coverage.exceptions > 0 && <Pill tone="warn">{coverage.exceptions} latest {coverage.exceptions === 1 ? "result" : "results"} flagged</Pill>}
        {noResult > 0 && <Pill tone="warn">{noResult} with no result found</Pill>}
      </div>
      {(filedForReview > 0 || unfiled > 0) && <p className="mb-4 rounded-md border border-warn/50 bg-warn/15 px-4 py-3 text-sm">
        <Link to="/review" search={{ scanner, month, lane: "exceptions" }} className="font-medium underline underline-offset-2">{filedForReview + unfiled} Monthly {filedForReview + unfiled === 1 ? "report needs" : "reports need"} review</Link>
        {unfiled > 0 && <span className="text-muted-foreground"> · {unfiled} awaiting filing</span>}
      </p>}
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Latest Monthly results</h2>
      <ul aria-label="Latest Monthly results" className="divide-y rounded-lg border bg-card">
        {items.map((item) => {
          const current = item.current;
          const status = current && MONTHLY_RESULTS[current.status];
          return <li key={item.metric} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {current && monthlyResultAlert(current.status) ? <AlertCircle className={cn("size-4", status?.tone === "bad" ? "text-destructive" : "text-warn")} aria-hidden /> : current ? <FileText className="size-4 text-muted-foreground" aria-hidden /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden />}
              <span className="min-w-36 flex-1 font-medium">{item.label}</span>
              {current && status ? (
              <>
                <Pill tone={current.reference && current.status === "ok" ? "muted" : status.tone}>{current.reference ? "Reference · " : ""}{status.label}</Pill>
                {current.outside > 0 && <span className="text-xs text-muted-foreground">{current.outside} {current.outside === 1 ? "reading" : "readings"} out of limit</span>}
                <Link to="/reports" search={{ scanner, month, type: "Monthly" }} state={{ qaReportId: current.report.id, qaReportPage: current.page }}
                  className="flex items-center gap-1 text-sm text-primary hover:underline" aria-label={`Open ${item.label} report from ${fmtDate(current.report.date)} at ${current.report.time}`}>
                  {fmtDate(current.report.date)}{item.history.some((run) => run.report.date === current.report.date) ? ` · ${current.report.time.slice(0, 5)}` : ""} <ChevronRight className="size-4" aria-hidden />
                </Link>
              </>
              ) : awaiting.has(item.label) ? <Pill tone="warn">Awaiting filing</Pill> : <Pill tone="muted">No result found</Pill>}
            </div>
            {item.history.length > 0 && <details className="mt-1 pl-6 text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer hover:text-foreground">Test history ({item.history.length})</summary>
              <ul className="mt-1 space-y-2 border-l pl-3">
                {item.history.map((run) => <li key={`${run.report.id}:${run.reference}`} className="flex flex-wrap items-center gap-2 py-1">
                  <Pill tone={MONTHLY_RESULTS[run.status].tone}>{run.reference ? "Reference · " : ""}{MONTHLY_RESULTS[run.status].label}</Pill>
                  <Link to="/reports" search={{ scanner, month, type: "Monthly" }} state={{ qaReportId: run.report.id, qaReportPage: run.page }}
                    className="text-primary underline-offset-2 hover:underline" aria-label={`Open ${item.label} history from ${fmtDate(run.report.date)} at ${run.report.time}`}>
                    {fmtDate(run.report.date)} · {run.report.time.slice(0, 5)}
                  </Link>
                </li>)}
              </ul>
            </details>}
          </li>;
        })}
      </ul>
      {exceptions.length > 0 && <details className="mt-4 rounded-lg border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Report history ({exceptions.length} with exceptions)</summary>
        <ul className="mt-2 divide-y">
          {exceptions.map(({ report, alert }) => <li key={report.id} className="flex flex-wrap items-center gap-2 py-2">
            <Pill tone={QA_ALERTS[alert].tone}>{QA_ALERTS[alert].label}</Pill>
            <Link to="/reports" search={{ scanner, month, type: "Monthly" }} state={{ qaReportId: report.id }} className="break-all text-sm text-primary hover:underline">{fmtDate(report.date)} · {report.fileName}</Link>
          </li>)}
        </ul>
      </details>}
      </div>
    </div>
  );
}
