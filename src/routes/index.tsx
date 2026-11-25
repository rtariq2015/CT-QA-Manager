import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, CalendarDays, ChevronRight, History } from "lucide-react";
import { useMemo } from "react";
import { MONTHLY_CHECKLIST, isScheduledQaDay, trendWarnings } from "@/lib/qa-data";
import { monthlyCoverage } from "@/lib/qa-monthly-status";
import { QA_ALERTS, reportAlert, strongestReportAlert } from "@/lib/qa-report-status";
import { configuredScanners } from "@/lib/qa-settings";
import { reportReviewLane } from "@/lib/qa-triage";
import { useQa } from "@/lib/qa-store";
import { useConfiguredFolders } from "@/components/qa/LiveLog";
import { Button } from "@/components/ui/button";
import { Pill, ScannerDot, fmtDate, scanColor } from "@/components/qa/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — CT QA Manager" },
      { name: "description", content: "Today's Daily QA, monthly checklist progress and pending reviews for each scanner." },
      { property: "og:title", content: "Today — CT QA Manager" },
      { property: "og:description", content: "Daily QA and monthly checklist progress for each CT scanner." },
    ],
  }),
  component: Today,
});

const scannerColumns = "grid grid-cols-2 items-center gap-3 md:grid-cols-[minmax(7rem,1fr)_minmax(6rem,.9fr)_minmax(10rem,1.5fr)_minmax(6.5rem,.9fr)]";

function Today() {
  const { reports, pending, failedImports, today, schedule } = useQa();
  const sources = useConfiguredFolders();
  const groups = useMemo(() => configuredScanners(sources), [sources]);
  const month = today.slice(0, 7);
  const dailyExpected = isScheduledQaDay(today, schedule.days);
  const scanners = useMemo(() => groups.map(({ scanner, folders }) => {
    const name = folders[0].name;
    if (!scanner) return { name, results: undefined };
    const mine = reports.filter((report) => report.scanner === scanner);
    const daily = mine.filter((report) => report.type === "Daily" && report.date === today);
    const monthly = monthlyCoverage(mine, scanner, month);
    const monthlyFlags = monthly.filed.filter((report) => reportAlert(report)).length;
    return { name, results: { scanner, daily, issue: strongestReportAlert(daily), monthly, monthlyFlags } };
  }), [groups, reports, month, today]);
  const trends = useMemo(() => groups.flatMap(({ scanner, folders }) => scanner ? trendWarnings(reports, scanner).slice(0, 2)
    .map((warning) => ({ ...warning, scannerName: folders[0].name })) : []), [groups, reports]);
  const assigned = scanners.filter(({ results }) => results).length;
  const received = scanners.filter(({ results }) => results?.daily.length).length;
  const filing = pending.filter((report) => reportReviewLane(report) === "filing").length;
  const exceptions = pending.length - filing;
  const importIssues = failedImports.length;
  const reviewCount = pending.length + importIssues;
  const dueIn = schedule.dueDay - Number(today.slice(8));
  const monthlyIncomplete = scanners.some(({ results }) => results && results.monthly.done < MONTHLY_CHECKLIST.length);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden />{fmtDate(today)}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Today</h1>
        </div>
        {reviewCount > 0 && <Button asChild><Link to="/review">Open Review <ArrowRight /></Link></Button>}
      </header>

      <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="scanner-status-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-4 sm:px-5">
          <div>
            <h2 id="scanner-status-heading" className="text-lg font-semibold">Scanner status</h2>
            <p className="text-sm text-muted-foreground">{assigned > 0
              ? dailyExpected ? `${received} of ${assigned} Daily reports received` : "Daily QA is not scheduled today"
              : scanners.length ? "Choose a model for each scanner folder to see its QA results." : "Add a scanner folder to track its QA reports."}</p>
          </div>
          {assigned > 0 ? <Link to="/monthly" search={{ month }} className="text-sm text-primary hover:underline">
            {monthlyIncomplete ? (dueIn < 0 ? `Monthly QA · due date passed` : dueIn === 0 ? "Monthly QA due today" : `Monthly QA due ${month.slice(5)}/${schedule.dueDay}`) : "Monthly checklist"}
          </Link> : <Link to="/settings" className="text-sm text-primary hover:underline">Scanner folders</Link>}
        </div>
        {assigned > 0 && <div className={`${scannerColumns} hidden border-y bg-muted/35 px-5 py-2 text-xs font-medium text-muted-foreground md:grid`} aria-hidden>
          <span>Scanner</span><span>Latest Daily PDF</span><span>Daily status</span><span>Latest Monthly</span>
        </div>}
        <ul className="divide-y">
          {scanners.map(({ name, results }, index) => {
            if (!results) return (
              <li key={`folder-${index}`} className={`${scannerColumns} px-4 py-3 md:px-5`}>
                <span className="break-words font-semibold">{name}</span>
                <Link to="/settings" className="text-sm text-primary hover:underline md:col-span-3">Choose scanner model</Link>
              </li>
            );
            const { scanner, daily, issue, monthly, monthlyFlags } = results;
            const latest = daily[0];
            const target = issue?.report ?? latest;
            const status = issue && QA_ALERTS[issue.alert];
            const statusLabel = status?.label ?? (latest?.printedStatus === "OK" ? "Printed OK" : "Result unavailable");
            return (
              <li key={scanner} className={`${scannerColumns} px-4 py-3 first:border-t md:px-5 md:first:border-t-0`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <ScannerDot id={scanner} />
                  <p className="min-w-0 break-words font-semibold">{name}</p>
                </div>
                <div className="text-sm">
                  <span className="mr-2 text-xs text-muted-foreground md:sr-only">Daily PDF</span>
                  {latest ? <span className="font-mono tabular-nums">{latest.time.slice(0, 5)}</span> : <span className="text-muted-foreground">—</span>}
                  {daily.length > 1 && <span className="ml-2 text-xs text-muted-foreground md:ml-0 md:block">{daily.length} reports</span>}
                </div>
                {target ? (
                  <Link to="/reports" search={{ scanner, date: today, type: "Daily" }} state={{ qaReportId: target.id }}
                    className="group flex w-fit items-center gap-1 text-sm" aria-label={`${name} Daily report · ${statusLabel}`}>
                    <Pill tone={status?.tone ?? (latest?.printedStatus === "OK" ? "ok" : "muted")}>{statusLabel}</Pill>
                    {issue && latest && target.id !== latest.id && <span className="text-xs text-muted-foreground">{target.time.slice(0, 5)}</span>}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                ) : (
                  <Link to="/reports" search={{ scanner, view: "calendar", month }} className="w-fit hover:underline"
                    aria-label={`${name} calendar · ${dailyExpected ? "Daily missing" : "Not scheduled"}`}>
                    <Pill tone={dailyExpected ? "warn" : "muted"}>{dailyExpected ? "Daily missing" : "Not scheduled"}</Pill>
                  </Link>
                )}
                <Link to="/monthly" search={{ scanner, month }} className="group flex w-fit items-center gap-2 text-sm hover:text-primary"
                  aria-label={`${name} Monthly · ${monthly.passed} of ${MONTHLY_CHECKLIST.length} latest results printed OK · ${monthly.done} tests recorded${monthly.exceptions ? ` · ${monthly.exceptions} latest results flagged` : ""}${monthlyFlags ? ` · ${monthlyFlags} reports in exception history` : ""}`}>
                  <span className="text-xs text-muted-foreground md:sr-only">Monthly</span>
                  <span className="leading-tight">
                    <span className="font-mono font-medium tabular-nums">{monthly.passed}/{MONTHLY_CHECKLIST.length} OK</span>
                    <span className="block text-xs text-muted-foreground">{monthly.done} recorded</span>
                  </span>
                  {monthly.exceptions > 0 ? <AlertCircle className="size-4 shrink-0 text-warn" aria-hidden />
                    : monthlyFlags > 0 && <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="hidden h-1.5 w-9 overflow-hidden rounded-full bg-muted xl:block" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${monthly.passed / MONTHLY_CHECKLIST.length * 100}%`, background: scanColor[scanner] }} />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {reviewCount > 0 && (
        <section className="mt-5 rounded-xl border bg-card" aria-labelledby="review-queue-heading">
          <h2 id="review-queue-heading" className="px-4 pt-4 text-lg font-semibold sm:px-5">Review queue</h2>
          <div className="grid gap-2 p-4 sm:grid-cols-3 sm:px-5">
            <ReviewLink lane="exceptions" label="QA exceptions" count={exceptions} />
            <ReviewLink lane="filing" label="Filing decisions" count={filing} />
            <ReviewLink lane="failed" label="Import issues" count={importIssues} />
          </div>
        </section>
      )}
      {trends.length > 0 && (
        <details className="mt-5 rounded-xl border bg-card px-4 py-3 text-sm sm:px-5">
          <summary className="cursor-pointer font-medium">Trend warnings ({trends.length})</summary>
          <ul className="mt-2 divide-y text-muted-foreground">
            {trends.map((warning) => <li key={`${warning.scanner}-${warning.metric}-${warning.context}`} className="py-2">
              <Link to="/trends" search={{ scanner: warning.scanner, metric: warning.metric }} state={{ qaTrendContext: warning.context }} className="hover:underline">{warning.scannerName} · {warning.label} ({warning.context}) moved {warning.direction === "rising" ? "higher" : "lower"} in 3 consecutive reports and remains within its printed limits.</Link>
            </li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function ReviewLink({ lane, label, count }: { lane: "exceptions" | "filing" | "failed"; label: string; count: number }) {
  return (
    <Link to="/review" search={{ lane }} className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:border-primary/50">
      <span className="font-mono font-semibold tabular-nums text-primary">{count}</span>{label}
      <ChevronRight className="ml-auto size-4 text-muted-foreground group-hover:text-primary" aria-hidden />
    </Link>
  );
}
