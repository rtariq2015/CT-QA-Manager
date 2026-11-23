import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleDashed } from "lucide-react";
import { useMemo, useState } from "react";
import { MONTHLY_CHECKLIST, MONTHLY_DUE_DAY, SCANNERS, TODAY, isOutOfLimit, monthlyCoverage, monthlyWaiting, trendWarnings } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import ctRoom from "@/assets/ct-scanner-room.jpg";
import { Pill, ScannerDot, fmtDate, scanColor } from "@/components/qa/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — CT QA Manager Companion" },
      { name: "description", content: "Daily QA receipt, monthly progress and pending reviews for every CT scanner at a glance." },
      { property: "og:title", content: "Today — CT QA Manager Companion" },
      { property: "og:description", content: "Daily QA receipt, monthly progress and pending reviews for every CT scanner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Today,
});

function Today() {
  const { reports, pending } = useQa();
  const month = TODAY.slice(0, 7);
  const cards = useMemo(() => SCANNERS.map((s) => {
    const mine = reports.filter((r) => r.scanner === s.id);
    const daily = mine.find((r) => r.date === TODAY && r.type === "Daily");
    const flagged = daily?.measurements.filter(isOutOfLimit) ?? [];
    const monthlies = mine.filter((r) => r.date.startsWith(month) && r.type === "Monthly");
    const found = new Set(monthlies.flatMap((r) => r.measurements.map((m) => m.metric)));
    const done = MONTHLY_CHECKLIST.filter((c) => found.has(c.metric)).length;
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      return { iso, ok: mine.some((r) => r.date === iso && r.type === "Daily") };
    });
    return { s, daily, flagged, done, pending: pending.filter((p) => p.scanner === s.id).length, last7 };
  }), [reports, pending, month]);

  const monthly = useMemo(() => SCANNERS.map((s) => ({ s, ...monthlyCoverage(reports, s.id, month), waiting: monthlyWaiting(reports, s.id, month) })), [reports, month]);

  const received = cards.filter((c) => c.daily).length;
  const [open, setOpen] = useState<string | null>(null);
  const [showAttn, setShowAttn] = useState(false);
  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const dueIn = MONTHLY_DUE_DAY - Number(TODAY.slice(8, 10));
  const notOk = reports.filter((r) => r.printedStatus === "NOT OK" && r.date.startsWith(month));
  const attention = [
    ...cards.filter((c) => !c.daily).map((c) => ({ key: `miss-${c.s.id}`, tone: "warn" as const, text: `${c.s.name}: today's Daily QA not received`, to: "/reports" as const })),
    ...cards.filter((c) => c.daily?.printedStatus === "NOT OK").map((c) => ({ key: `bad-${c.s.id}`, tone: "bad" as const, text: `${c.s.name}: today's report prints NOT OK`, to: "/reports" as const })),
    ...monthly.filter((m) => m.done < MONTHLY_CHECKLIST.length && dueIn <= 3).map((m) => ({
      key: `due-${m.s.id}`,
      tone: (dueIn < 0 ? "bad" : "warn") as "bad" | "warn",
      text: dueIn < 0
        ? `${m.s.name}: ${MONTHLY_CHECKLIST.length - m.done} monthly test${MONTHLY_CHECKLIST.length - m.done === 1 ? "" : "s"} still missing, ${-dueIn} day${-dueIn === 1 ? "" : "s"} past the due day`
        : `${m.s.name}: monthly tests due in ${dueIn} day${dueIn === 1 ? "" : "s"}`,
      to: "/monthly" as const,
    })),
    ...reports.filter((r) => r.source === "uploaded" && r.extractionNotes?.length).slice(0, 3).map((r) => ({ key: `ex-${r.id}`, tone: "warn" as const, text: `${r.fileName}: only partly readable — check by eye`, to: "/reports" as const })),
    ...SCANNERS.flatMap((s) => trendWarnings(reports, s.id).slice(0, 2).map((w) => ({ key: `trend-${s.id}-${w.metric}-${w.context}`, tone: "warn" as const, text: `${s.name}: ${w.label.toLowerCase()} (${w.context}) ${w.direction} 3 reports in a row — still within limits`, to: "/trends" as const }))),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative mb-6 overflow-hidden rounded-xl border bg-card">
        <img src={ctRoom} alt="CT scanner in a scan room" width={1774} height={887} className="absolute inset-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/10" />
        <div className="relative flex min-h-44 flex-col justify-center gap-3 p-6 sm:min-h-52 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{fmtDate(TODAY)}</p>
          <h1 className="max-w-md text-2xl font-semibold sm:text-3xl">{received} of {SCANNERS.length} Daily reports in</h1>
          <div className="flex flex-wrap gap-2">
            {SCANNERS.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-sm"><ScannerDot id={s.id} />{s.name}</span>)}
          </div>
          {pending.length > 0 && (
            <Link to="/review" className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
              Review {pending.length} report{pending.length === 1 ? "" : "s"} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Daily reports today" value={`${received}/${SCANNERS.length}`} />
        <Summary label="Waiting to file" value={String(pending.length)} />
        <Summary label="Printed NOT OK this month" value={String(notOk.length)} tone={notOk.length ? "bad" : undefined} />
        <Summary label="Monthly due" value={dueIn >= 0 ? `in ${dueIn} days` : `day ${MONTHLY_DUE_DAY} passed`} />
      </div>

      <section className="mb-6 rounded-lg border bg-card">
        <button onClick={() => setShowAttn((v) => !v)} aria-expanded={showAttn} className="flex w-full items-center gap-2 p-4 text-left">
          <h2 className="font-semibold">Needs attention</h2>
          <span className={attention.length ? "rounded-full bg-destructive/15 px-2 text-sm font-medium text-destructive" : "rounded-full bg-muted px-2 text-sm text-muted-foreground"}>{attention.length}</span>
          <span className="ml-auto text-sm text-muted-foreground">{showAttn ? "Hide" : "Show"}</span>
          <ChevronDown className={showAttn ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
        </button>
        {showAttn && <div className="border-t px-4 pb-2">
        {attention.length === 0 ? <p className="py-3 text-muted-foreground">Nothing needs attention right now.</p> : (
          <ul className="divide-y">
            {attention.map((a) => (
              <li key={a.key}><Link to={a.to} className="flex items-center gap-3 py-2.5 hover:underline">
                <AlertTriangle className={a.tone === "bad" ? "size-4 shrink-0 text-destructive" : "size-4 shrink-0 text-warn"} />{a.text}
              </Link></li>
            ))}
          </ul>
        )}
        </div>}
      </section>

      <div role="tablist" className="mb-4 inline-flex rounded-lg border bg-muted p-1">
        {(["daily", "monthly"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={tab === t ? "rounded-md bg-background px-4 py-1.5 text-sm font-medium shadow-sm" : "rounded-md px-4 py-1.5 text-sm text-muted-foreground"}>
            {t === "daily" ? "Daily" : "Monthly"}
          </button>
        ))}
      </div>

      {tab === "daily" && (
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ s, daily, flagged, done, pending: p, last7 }) => (
          <article key={s.id} className="relative overflow-hidden rounded-lg border bg-card p-5">
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: scanColor[s.id] }} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold"><ScannerDot id={s.id} />{s.name} · {s.location}</h2>
                <p className="text-muted-foreground">{s.model} · {s.software}</p>
              </div>
              {daily ? (daily.printedStatus === "NOT OK" ? <Pill tone="bad"><AlertTriangle className="size-3.5" />Printed NOT OK · {flagged.length} readings</Pill> : <Pill tone="ok"><CheckCircle2 className="size-3.5" />Daily received</Pill>)
                : <Pill tone="warn"><CircleDashed className="size-3.5" />Daily missing</Pill>}
            </div>

            <button className="mt-4 text-sm text-primary underline-offset-4 hover:underline" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide details" : "Show details"}</button>
            {open === s.id && <>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Stat label="Daily at" value={daily ? daily.time : "—"} />
              <Stat label="Monthly tests" value={`${done}/${MONTHLY_CHECKLIST.length}`} sub={done < MONTHLY_CHECKLIST.length ? `due ${month.slice(5)}/${MONTHLY_DUE_DAY}` : "found"} />
              <Stat label="To review" value={String(p)} />
            </div>

            <div className="mt-5">
              <p className="mb-1.5 text-sm text-muted-foreground">Last 7 days</p>
              <div className="flex gap-1.5">
                {last7.map((d) => (
                  <div key={d.iso} title={`${d.iso}: ${d.ok ? "received" : "missing"}`}
                    className={d.ok ? "h-7 flex-1 rounded-sm bg-ok/70" : "h-7 flex-1 rounded-sm border-2 border-dashed border-warn"} />
                ))}
              </div>
            </div>
            </>}
          </article>
        ))}
      </div>
      )}

      {tab === "monthly" && (
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Monthly tests · {new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <Link to="/monthly" className="text-sm text-primary underline-offset-4 hover:underline">Open full checklist</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {monthly.map((m) => {
            const complete = m.done === MONTHLY_CHECKLIST.length;
            const missing = MONTHLY_CHECKLIST.length - m.done;
            const due = complete
              ? { tone: "ok" as const, text: "Complete" }
              : m.count === 0
                ? dueIn < 0
                  ? { tone: "bad" as const, text: `Overdue by ${-dueIn} day${-dueIn === 1 ? "" : "s"}` }
                  : { tone: dueIn <= 3 ? ("warn" as const) : ("muted" as const), text: `Due in ${dueIn} day${dueIn === 1 ? "" : "s"}` }
                : { tone: dueIn < 0 ? ("bad" as const) : ("warn" as const), text: `${missing} test${missing === 1 ? "" : "s"} missing` };
            return (
              <article key={m.s.id} className="relative overflow-hidden rounded-lg border bg-card p-4">
                <div className="absolute inset-y-0 left-0 w-1" style={{ background: scanColor[m.s.id] }} />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-medium"><ScannerDot id={m.s.id} />{m.s.name}</h3>
                  <Pill tone={due.tone}>{due.text}</Pill>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {m.count === 0 ? "No monthly report filed yet this month"
                    : `${m.count} monthly report${m.count > 1 ? "s" : ""}${m.last ? ` · last ${fmtDate(m.last)}` : ""}`}
                </p>
                <p className="mt-3 font-mono text-2xl font-medium">{m.done}/{MONTHLY_CHECKLIST.length} <span className="text-sm font-normal text-muted-foreground">tests found</span></p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${(m.done / MONTHLY_CHECKLIST.length) * 100}%`, background: scanColor[m.s.id] }} />
                </div>
                {m.missing.length > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Still missing: {m.missing.slice(0, 3).map((c) => c.label).join(", ")}
                    {m.missing.length > 3 ? ` +${m.missing.length - 3} more` : ""}
                  </p>
                )}
                {m.waiting.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Waiting to file in Review: {m.waiting.join(", ")}</p>}
                {m.flagged > 0 && <p className="mt-1 text-sm text-destructive">{m.flagged} reading{m.flagged > 1 ? "s" : ""} outside printed limits</p>}
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Counts come from filed Monthly reports only. Reports still waiting in Review are not counted yet.</p>
      </section>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "bad" | undefined }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={tone === "bad" ? "font-mono text-2xl font-medium text-destructive" : "font-mono text-2xl font-medium"}>{value}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-medium">{value}</p>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
