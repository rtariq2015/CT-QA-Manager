import { Button } from "@/components/ui/button";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { METRICS, SCANNERS, driftRatio, isOutOfLimit, type MetricId, type Report, type ScannerId } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { PageHeader, Pill } from "@/components/qa/ui";
import { scannerFilter } from "@/lib/qa-route-filters";
import { ReportPreview } from "@/components/qa/ReportPreview";
import { cn } from "@/lib/utils";

type TrendSearch = { scanner?: ScannerId | undefined; metric?: MetricId | undefined };

export const Route = createFileRoute("/trends")({
  validateSearch: (search): TrendSearch => ({ scanner: scannerFilter(search["scanner"]), metric: METRICS.find(({ id }) => id === search["metric"])?.id }),
  head: () => ({
    meta: [
      { title: "Trends — CT QA Manager Companion" },
      { name: "description", content: "Chart water CT value, noise, MTF, CTDI Air and every Siemens constancy test with limits and baseline drift." },
      { property: "og:title", content: "Trends — CT QA Manager Companion" },
      { property: "og:description", content: "Every Siemens CT constancy measurement charted with limits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Trends,
});

const RANGES = [{ l: "3 months", d: 90 }, { l: "1 year", d: 365 }, { l: "2 years", d: 730 }];

function Trends() {
  const { reports } = useQa();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const scanner = search.scanner ?? "flash";
  const metric = search.metric ?? "noise";
  const linkedContext = useLocation({ select: ({ state }) => state.qaTrendContext });
  const [range, setRange] = useState(365);
  const [picked, setPicked] = useState<{ r: Report; page: number } | null>(null);

  const contexts = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) if (r.scanner === scanner) for (const m of r.measurements) if (m.metric === metric) set.add(m.context);
    return [...set];
  }, [reports, scanner, metric]);
  const [ctxPick, setCtx] = useState<string>();
  const preferredContext = ctxPick ?? linkedContext;
  const context = preferredContext && contexts.includes(preferredContext) ? preferredContext : (contexts.find((c) => c.startsWith("120")) ?? contexts[0] ?? "");
  const choose = (next: TrendSearch) => {
    setCtx(undefined);
    setPicked(null);
    void navigate({ search: (previous) => ({ ...previous, ...next }), state: {}, replace: true });
  };

  const points = useMemo(() => {
    const filed = reports.filter((r) => r.scanner === scanner && r.type !== "Other");
    const newest = filed[0];
    const since = newest ? new Date(new Date(newest.date).getTime() - range * 864e5).toISOString().slice(0, 10) : "";
    return filed.filter((r) => r.date >= since)
      .flatMap((r) => r.measurements.filter((m) => m.metric === metric && m.context === context).map((m) => ({ ...m, date: r.date, r })))
      .reverse();
  }, [reports, scanner, metric, context, range]);

  const last = points.at(-1);
  const out = points.filter(isOutOfLimit);
  const recent = points.slice(-10).filter(p => p.baseline !== null);
  const drift = recent.length ? recent.reduce((a, p) => a + driftRatio(p), 0) / recent.length : 0;
  const info = METRICS.find((m) => m.id === metric);
  if (!info) return null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow={`Trends · ${info.frequency}`} title={info.label}>
        <div className="flex gap-1">{RANGES.map((x) => (
          <Button variant="outline" key={x.d} aria-pressed={range === x.d} onClick={() => { setRange(x.d); setPicked(null); }} className={cn("rounded-md border px-3 py-1.5 text-sm", range === x.d ? "border-primary bg-accent" : "bg-card hover:bg-muted")}>{x.l}</Button>
        ))}</div>
      </PageHeader>

        <section className="min-w-0 space-y-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(6rem,1fr)_minmax(8rem,1.5fr)_minmax(10rem,2fr)]">
            <select aria-label="Scanner" value={scanner} onChange={(e) => choose({ scanner: scannerFilter(e.target.value) })} className="h-10 min-w-0 rounded-md border bg-card px-2 text-sm">
              {SCANNERS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select aria-label="Measurement" value={metric} onChange={(e) => choose({ metric: METRICS.find(({ id }) => id === e.target.value)?.id })} className="h-10 min-w-0 rounded-md border bg-card px-2 text-sm">
              {(["Daily", "Monthly"] as const).map((frequency) => <optgroup key={frequency} label={frequency}>
                {METRICS.filter((item) => item.frequency === frequency).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </optgroup>)}
            </select>
            <select aria-label="Measurement context" value={context} disabled={!contexts.length} onChange={(e) => { setCtx(e.target.value); setPicked(null); }} className="h-10 min-w-0 rounded-md border bg-card px-2 text-sm">
              {contexts.length === 0 && <option value="">No measurement contexts</option>}
              {contexts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Latest" value={last ? `${last.value} ${last.unit}` : "—"} />
            <Card label="Limits" value={last ? `${last.lower} … ${last.upper}` : "—"} />
            <Card label="Out of limit" value={String(out.length)} tone={out.length ? "bad" : undefined} />
            <Card label="Drift (last 10)" value={recent.length ? `${Math.round(drift * 100)}% of band` : "No reference"} tone={drift > 0.5 ? "warn" : undefined} />
          </div>
          <div className="h-[380px] rounded-lg border bg-card p-3">
            {points.length === 0 ? <div className="grid h-full place-items-center text-muted-foreground">No readings for this test on this scanner</div> : (
              <ResponsiveContainer>
                <LineChart data={points} onClick={(e) => { const p = points[e?.activeTooltipIndex ?? -1]; if (p) setPicked({ r: p.r, page: p.page }); }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} minTickGap={40} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} domain={["auto", "auto"]} width={56} />
                  {last && last.baseline !== null && <ReferenceLine y={last.baseline} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "baseline", fill: "var(--muted-foreground)", fontSize: 11, position: "insideTopRight" }} />}
                  <Line dataKey="upper" name="Upper limit" stroke="var(--destructive)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  <Line dataKey="lower" name="Lower limit" stroke="var(--destructive)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6 }} formatter={(v: number) => [`${v} ${info.unit}`, info.label]} />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={1.5} isAnimationActive={false}
                    dot={(p: { cx?: number; cy?: number; index?: number; payload?: { value: number; lower: number; upper: number } }) => {
                      const bad = p.payload && isOutOfLimit(p.payload);
                      return <circle key={p.index} cx={p.cx} cy={p.cy} r={bad ? 5 : points.length > 120 ? 0 : 2.5} fill={bad ? "var(--destructive)" : "var(--primary)"} />;
                    }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{info.note}.</p>
          {picked && (
            <div>
              <div className="mb-2 flex items-center gap-2"><Pill tone="muted">{picked.r.fileName}</Pill><span className="text-sm text-muted-foreground">page {picked.page}</span></div>
              <ReportPreview key={picked.r.id} report={picked.r} highlightPage={picked.page} />
            </div>
          )}
        </section>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" | undefined }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone === "bad" && "border-destructive/40", tone === "warn" && "border-warn/60")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-xl", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
}
