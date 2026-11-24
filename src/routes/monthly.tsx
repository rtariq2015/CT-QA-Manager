import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { useMemo, useState } from "react";
import { MONTHLY_CHECKLIST, SCANNERS, addDays, isOutOfLimit, isScheduledQaDay, monthlyCoverage, type ScannerId } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { PageHeader, Pill, ScannerDot } from "@/components/qa/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/monthly")({
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
  const [scanner, setScanner] = useState<ScannerId>("flash");
  const currentMonth = today.slice(0, 7);
  const months = useMemo(() => monthOptions(today, reports.map((r) => r.date.slice(0, 7)).filter((m) => m <= currentMonth)), [today, currentMonth, reports]);
  const [monthPick, setMonth] = useState<string | null>(null);
  const month = monthPick && months.includes(monthPick) ? monthPick : currentMonth;

  const items = useMemo(() => {
    const mine = reports.filter((r) => r.scanner === scanner && r.date.startsWith(month) && r.type === "Monthly");
    return MONTHLY_CHECKLIST.map((c) => {
      const src = mine.find((r) => r.measurements.some((m) => m.metric === c.metric));
      const ms = src?.measurements.filter((m) => m.metric === c.metric) ?? [];
      return { ...c, src, flagged: ms.filter(isOutOfLimit).length, page: ms[0]?.page };
    });
  }, [reports, scanner, month]);
  const monthlyReview = reports.filter((r) =>
    r.scanner === scanner && r.date.startsWith(month) && r.needsReview && (r.type === "Monthly" || r.suggested === "Monthly"));
  const unfiled = monthlyReview.filter((r) => r.type !== "Monthly").length;
  const filedForReview = monthlyReview.length - unfiled;
  const done = items.filter((i) => i.src).length;

  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const summaryEnd = month === currentMonth ? Number(today.slice(8, 10)) : last;
  const daysExpected = new Set(Array.from({ length: summaryEnd }, (_, i) => addDays(`${month}-01`, i)).filter((date) => isScheduledQaDay(date, schedule.days)));
  const summary = SCANNERS.map((s) => {
    const mine = reports.filter((r) => r.scanner === s.id && r.date.startsWith(month));
    const days = new Set(mine.filter((r) => r.type === "Daily" && daysExpected.has(r.date)).map((r) => r.date)).size;
    return { s, days, cov: monthlyCoverage(reports, s.id, month), notOk: mine.filter((r) => r.printedStatus === "NOT OK").sort((a, b) => a.date.localeCompare(b.date)) };
  });
  const monthName = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-5xl">
      <section className="hidden print:block">
        <h1 className="mb-4 text-2xl font-semibold">CT QA monthly summary · {monthName}</h1>
        {summary.map(({ s, days, cov, notOk }) => (
          <div key={s.id} className="mb-6 break-inside-avoid border-b pb-4">
            <h2 className="text-lg font-semibold">{s.name} · {s.model}</h2>
            <p>Daily reports received: {days} of {daysExpected.size} scheduled days</p>
            <p>Monthly tests found: {cov.done} of {MONTHLY_CHECKLIST.length}{cov.missing.length ? ` (missing: ${cov.missing.map((c) => c.label).join(", ")})` : ""}</p>
            <p>Printed NOT OK: {notOk.length === 0 ? "none" : notOk.map((r) => `${r.date} (${r.type})`).join(", ")}</p>
          </div>
        ))}
        <p className="text-sm">Filing is not clinical sign-off. Review with the department physicist.</p>
      </section>
      <div className="print:hidden">
      <PageHeader eyebrow={`Monthly · due day ${schedule.dueDay}`} title={`${done} of ${items.length} tests found`}>
        <button onClick={() => window.print()} className="no-print rounded-md border px-4 py-2 text-sm hover:bg-muted">Print monthly summary</button>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-11 rounded-md border bg-card px-3" aria-label="Month">
          {months.map((m) => <option key={m} value={m}>{new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}
        </select>
      </PageHeader>
      <div className="mb-5 flex flex-wrap gap-2">
        {SCANNERS.map((s) => (
          <Button variant="outline" key={s.id} onClick={() => setScanner(s.id)} className={cn("flex items-center gap-2 rounded-md border px-4 py-2", scanner === s.id ? "border-primary bg-accent font-medium" : "bg-card hover:bg-muted")}>
            <ScannerDot id={s.id} />{s.name} · {s.model.replace("SOMATOM ", "")}
          </Button>
        ))}
      </div>
      {unfiled > 0 && <p className="mb-4 rounded-md border border-warn/50 bg-warn/15 px-4 py-3">{unfiled} likely Monthly report{unfiled > 1 ? "s" : ""} for this month still need filing in Review. Their tests aren't counted yet.</p>}
      {filedForReview > 0 && <p className="mb-4 rounded-md border border-warn/50 bg-warn/15 px-4 py-3">{filedForReview} filed Monthly report{filedForReview > 1 ? "s still need" : " still needs"} review.</p>}
      <ul className="divide-y rounded-lg border bg-card">
        {items.map((i) => (
          <li key={i.metric} className="flex flex-wrap items-center gap-4 px-5 py-4">
            {i.src && !i.src.needsReview && i.src.printedStatus !== "NOT OK" ? <CheckCircle2 className="size-5 text-ok" /> : <CircleDashed className="size-5 text-muted-foreground" />}
            <span className="flex-1 text-lg">{i.label}</span>
            {i.src ? (
              <>
                {i.src.needsReview && <Pill tone="warn">Review needed</Pill>}
                {i.flagged > 0 && <Pill tone="bad">{i.flagged} out of limit</Pill>}
                <span className="font-mono text-sm text-muted-foreground">{i.src.fileName} · p.{i.page}</span>
              </>
            ) : <Pill tone="warn">Not found</Pill>}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">This shows tests found in filed reports. It does not replace the department's approved checklist or physicist review.</p>
      </div>
    </div>
  );
}
