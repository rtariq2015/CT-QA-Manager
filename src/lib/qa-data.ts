// Demo data generator. Deterministic (seeded) so server and browser render identical data.
// Shapes mirror the Windows CT QA Manager records: scanner, date, type, measurements with
// printed units, limits and source pages. All values are synthetic.

export type ReportType = "Daily" | "Monthly" | "Other";
export type ScannerId = "xcite" | "flash" | "edge" | "drive";

export interface Scanner {
  id: ScannerId;
  name: string;
  model: string;
  location: string;
  software: string;
  kvs: number[];
}

export const ALL_SCANNERS: Scanner[] = [
  { id: "xcite", name: "X.cite", model: "SOMATOM X.cite", location: "CT Xcite", software: "syngo CT VA40A", kvs: [70, 80, 100, 120, 140] },
  { id: "flash", name: "Flash", model: "SOMATOM Definition Flash", location: "CT Flash", software: "syngo CT VB20", kvs: [80, 100, 120, 140] },
  { id: "edge", name: "Edge", model: "SOMATOM Definition Edge", location: "CT Edge", software: "syngo CT VB20", kvs: [80, 100, 120, 140] },
  { id: "drive", name: "Drive", model: "SOMATOM Drive", location: "MDP Building", software: "syngo CT VB30A_SP10", kvs: [80, 100, 120, 140] },
];

// Active fleet: all four scanners now have real reports (X.cite added with syngo CT VA40A).
export const SCANNERS: Scanner[] = ALL_SCANNERS;

export interface Measurement {
  metric: MetricId;
  context: string; // e.g. "120 kV", "12 o'clock", "Position 2"
  value: number;
  unit: string;
  lower: number;
  upper: number;
  baseline: number | null;
  tube?: "A" | "B";
  slice?: number;
  mode?: string;
  kv?: number;
  kernel?: string;
  referenceDate?: string;
  limitSource?: "printed" | "demo";
  page: number;
}

export interface Report {
  id: string;
  scanner: ScannerId;
  date: string; // YYYY-MM-DD
  time: string;
  fileName: string;
  sizeKb: number;
  type: ReportType;
  suggested: ReportType;
  confidence: "certain" | "likely" | "uncertain";
  needsReview: boolean;
  autoFiled?: boolean;
  measurements: Measurement[];
  pages: number;
  source?: "demo" | "uploaded";
  printedStatus?: "OK" | "NOT OK" | "Not available";
  printedSections?: { label: string; status: "OK" | "NOT OK" | "Not available"; page: number }[];
  software?: string;
  extractionNotes?: string[];
  extractionIncomplete?: boolean;
  originalUrl?: string;
}

export type MetricId =
  | "water" | "noise" | "homogeneity" | "slice" | "mtf50" | "mtf10" | "ctdi"
  | "lightmarker" | "externalmarker" | "sagcor" | "topogram" | "table" | "lowcontrast" | "contrast" | "air";

export interface MetricInfo { id: MetricId; label: string; unit: string; frequency: "Daily" | "Monthly"; note: string; isNew?: boolean }

export const METRICS: MetricInfo[] = [
  { id: "water", label: "Water CT value", unit: "HU", frequency: "Daily", note: "Mean CT number of water, per kV" },
  { id: "noise", label: "Pixel noise", unit: "HU", frequency: "Daily", note: "Standard deviation in water, per kV" },
  { id: "homogeneity", label: "Homogeneity", unit: "HU", frequency: "Daily", note: "Edge minus centre at 12/3/6/9 o'clock", isNew: true },
  { id: "slice", label: "Slice thickness", unit: "mm", frequency: "Monthly", note: "Measured FWHM" },
  { id: "mtf50", label: "MTF 50%", unit: "lp/cm", frequency: "Monthly", note: "Spatial resolution at 50% modulation", isNew: true },
  { id: "mtf10", label: "MTF 10%", unit: "lp/cm", frequency: "Monthly", note: "Spatial resolution at 10% modulation", isNew: true },
  { id: "ctdi", label: "CTDI Air", unit: "mGy/100mAs", frequency: "Monthly", note: "Dose free-in-air, per kV", isNew: true },
  { id: "lightmarker", label: "Light marker", unit: "mm", frequency: "Monthly", note: "Laser vs. scan plane" },
  { id: "sagcor", label: "Sag/Cor light marker", unit: "mm", frequency: "Monthly", note: "Sagittal and coronal" },
  { id: "topogram", label: "Topogram position", unit: "mm", frequency: "Monthly", note: "Preview image positioning" },
  { id: "table", label: "Table position", unit: "mm", frequency: "Monthly", note: "Continuous / Stepwise, positions 1–4" },
  { id: "externalmarker", label: "External light marker", unit: "mm", frequency: "Monthly", note: "External laser vs. scan plane" },
  { id: "air", label: "CT air value", unit: "HU", frequency: "Monthly", note: "Air CT number in contrast-scale test" },
  { id: "contrast", label: "Contrast scale", unit: "1/HUcm", frequency: "Monthly", note: "Water/air attenuation contrast scale, not low-contrast object visibility" },
  { id: "lowcontrast", label: "Low contrast", unit: "mm", frequency: "Monthly", note: "Smallest visible object", isNew: true },
];

// Fixed "today" keeps the demo deterministic.
export const TODAY = "2026-11-22";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function localDate(when = new Date()): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isScheduledQaDay(iso: string, days: "every" | "weekdays"): boolean {
  const day = new Date(iso + "T00:00:00Z").getUTCDay();
  return days === "every" || (day >= 1 && day <= 5);
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function isOutOfLimit(m: Pick<Measurement, "value" | "lower" | "upper">): boolean {
  return m.value < m.lower || m.value > m.upper;
}

/** Drift from baseline as a fraction of the half-width of the tolerance band (0 = on baseline, 1 = at the limit). */
export function driftRatio(m: Pick<Measurement, "value" | "lower" | "upper" | "baseline">): number {
  if (m.baseline === null) return 0;
  const half = (m.upper - m.lower) / 2;
  if (half <= 0) return 0;
  return Math.abs(m.value - m.baseline) / half;
}

function buildData(): Report[] {
  const rand = mulberry32(42);
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
  const reports: Report[] = [];
  const start = addDays(TODAY, -729);
  let seq = 0;
  SCANNERS.forEach((s, si) => {
    const noiseBase = 4.6 + si * 0.25;
    for (let i = 0; i < 730; i++) {
      const date = addDays(start, i);
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      const drift = s.id === "flash" ? i / 730 : 0; // Flash slowly drifts (noise rising)
      // Daily: skip some Sundays and a few random misses; today may be missing for one scanner
      const missDaily = (dow === 0 && rand() < 0.5) || rand() < 0.03 || (date === TODAY && s.id === "edge");
      if (!missDaily) {
        const ms: Measurement[] = [];
        s.kvs.forEach((kv, k) => {
          const wv = round(gauss() * 1.2 + (s.id === "drive" && i > 700 ? 3.2 : 0));
          ms.push({ metric: "water", context: `${kv} kV`, value: wv, unit: "HU", lower: -4, upper: 4, baseline: 0, page: 1 + k });
          const nb = noiseBase * (120 / kv) ** 0.9;
          ms.push({ metric: "noise", context: `${kv} kV`, value: round(nb * (1 + gauss() * 0.025 + drift * 0.08), 2), unit: "HU", lower: round(nb * 0.9, 2), upper: round(nb * 1.1, 2), baseline: round(nb, 2), page: 1 + k });
          if (kv === 120) {
            ["12 o'clock", "3 o'clock", "6 o'clock", "9 o'clock"].forEach((pos) =>
              ms.push({ metric: "homogeneity", context: pos, value: round(gauss() * 1.1), unit: "HU", lower: -4, upper: 4, baseline: 0, page: 1 + k }));
          }
        });
        if (s.id === "drive") {
          ms.length = 0;
          const modes = [
            { mode: "Head", tube: "A" as const, kernel: "Hr38s", count: 3, base: 3.23, lower: 2.9, upper: 3.54 },
            { mode: "Body", tube: "A" as const, kernel: "Br38f", count: 7, base: 4.75, lower: 4.28, upper: 5.23 },
            { mode: "Dual-source body", tube: "A" as const, kernel: "Or37f", count: 7, base: 4.72, lower: 4.25, upper: 5.19 },
            { mode: "Dual-source body", tube: "B" as const, kernel: "Or37f", count: 7, base: 4.76, lower: 4.25, upper: 5.19 },
          ];
          modes.forEach((test, index) => {
            for (let slice = 1; slice <= test.count; slice++) {
              const context = `120 kV · ${test.mode} · Tube ${test.tube} · Slice ${slice} · ${test.kernel}`;
              ms.push({ metric: "noise", context, value: round(test.base + gauss() * 0.06, 2), unit: "HU", lower: test.lower, upper: test.upper, baseline: null, page: index < 1 ? 3 : 4, tube: test.tube, slice, mode: test.mode, kv: 120, kernel: test.kernel, limitSource: "printed" });
              if (test.mode === "Head") continue;
              const band = test.mode === "Body" ? 4 : 6;
              ms.push({ metric: "water", context, value: round(gauss() * 0.8, 2), unit: "HU", lower: -band, upper: band, baseline: null, page: index === 1 ? 6 : test.tube === "A" ? 7 : 8, tube: test.tube, slice, mode: test.mode, kv: 120, kernel: test.kernel, limitSource: "printed" });
              [3, 6, 9, 12].forEach(position => ms.push({ metric: "homogeneity", context: `${context} · ${position} o'clock`, value: round(gauss() * 0.9, 2), unit: "HU", lower: -band, upper: band, baseline: null, page: index === 1 ? 6 : test.tube === "A" ? 7 : 8, tube: test.tube, slice, mode: test.mode, kv: 120, kernel: test.kernel, limitSource: "printed" }));
            }
          });
          if (date === TODAY) {
            const example = ms.find(m => m.metric === "homogeneity" && m.tube === "A" && m.slice === 6 && m.mode === "Body" && m.context.includes("12 o'clock"));
            if (example) example.value = 4.35;
          }
        }
        const needsReview = rand() < 0.012 || (i > 715 && rand() < 0.25);
        reports.push({
          id: `r${++seq}`, scanner: s.id, date, time: `0${6 + Math.floor(rand() * 3)}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`,
          fileName: `QualityDaily_${date.replaceAll("-", "")}.pdf`, sizeKb: Math.round(62 + rand() * 12),
          type: needsReview ? "Other" : "Daily", suggested: "Daily", confidence: needsReview ? "likely" : "certain",
          needsReview, measurements: ms, pages: s.kvs.length + 1,
        });
      }
      // Monthly constancy: first weekday after the 1st, occasionally late
      const day = Number(date.slice(8));
      if (day === (si % 3) + 2) {
        const ms: Measurement[] = [];
        const push = (metric: MetricId, context: string, base: number, tol: number, sd: number, unit: string, page: number) =>
          ms.push({ metric, context, value: round(base + gauss() * sd, 2), unit, lower: round(base - tol, 2), upper: round(base + tol, 2), baseline: base, page });
        ["1.0 mm", "5.0 mm"].forEach((c, k) => push("slice", c, Number(c.split(" ")[0]), k ? 1 : 0.5, k ? 0.2 : 0.08, "mm", 3));
        push("mtf50", "Body kernel", 3.6, 0.36, 0.08, "lp/cm", 4);
        push("mtf10", "Body kernel", 6.1, 0.61, 0.12, "lp/cm", 4);
        s.kvs.forEach((kv) => push("ctdi", `${kv} kV`, round(0.012 * kv ** 1.6, 2), round(0.012 * kv ** 1.6 * 0.2, 2), round(0.012 * kv ** 1.6 * 0.03, 3), "mGy/100mAs", 5));
        push("lightmarker", "Internal", 0, 2, 0.5, "mm", 2);
        push("sagcor", "Sagittal", 0, 2, 0.5, "mm", 2);
        push("sagcor", "Coronal", 0, 2, 0.5, "mm", 2);
        push("topogram", "Preview", 0, 2, 0.6, "mm", 2);
        ["Continuous", "Stepwise"].forEach((mode) => [1, 2, 3, 4].forEach((p) => push("table", `${mode} · Pos ${p}`, 0, 1, 0.25, "mm", 6)));
        push("externalmarker", "External", 0, 2, 0.5, "mm", 2);
        ms.push({ metric: "contrast", context: "120 kV · Body · Tube A · Slice 1 · Br38f", value: 0.000192, unit: "1/HUcm", lower: 0.000189, upper: 0.000195, baseline: 0.000192, page: 7, tube: "A", slice: 1, mode: "Body", kv: 120, kernel: "Br38f", limitSource: "printed" });
        if (s.id === "drive") ms.push({ metric: "contrast", context: "120 kV · Dual-source body · Tube B · Slice 1 · Br38f", value: 0.000192, unit: "1/HUcm", lower: 0.000189, upper: 0.000195, baseline: 0.000192, page: 7, tube: "B", slice: 1, mode: "Dual-source body", kv: 120, kernel: "Br38f", limitSource: "printed" });
        // Demo variation: this month's constancy run on Drive skipped MTF and the
        // contrast scale; on Edge the external light marker was not measured.
        const thisMonth = date.slice(0, 7) === TODAY.slice(0, 7);
        const skipped: MetricId[] = thisMonth && s.id === "drive"
          ? ["mtf50", "mtf10", "contrast"]
          : thisMonth && s.id === "edge" ? ["externalmarker"] : [];
        const kept = skipped.length ? ms.filter((m) => !skipped.includes(m.metric)) : ms;
        const uncertain = rand() < 0.12 || (i > 715);
        reports.push({
          id: `r${++seq}`, scanner: s.id, date, time: "07:40",
          fileName: `Quality_Constancy_${date.replaceAll("-", "")}.pdf`, sizeKb: Math.round(84 + rand() * 30),
          type: uncertain ? "Other" : "Monthly", suggested: "Monthly", confidence: uncertain ? "uncertain" : "certain",
          needsReview: uncertain, measurements: kept, pages: 8,
        });
      }
    }
  });
  for (const report of reports) {
    report.source = "demo";
    report.printedStatus = report.measurements.some(isOutOfLimit) ? "NOT OK" : "OK";
    report.printedSections = [...new Set(report.measurements.map(m => m.metric))].map(metric => ({ label: METRICS.find(m => m.id === metric)?.label ?? metric, status: report.measurements.some(m => m.metric === metric && isOutOfLimit(m)) ? "NOT OK" : "OK", page: report.measurements.find(m => m.metric === metric)?.page ?? 1 }));
    report.pages = Math.max(report.pages, ...report.measurements.map(m => m.page));
  }
  return reports.sort((a, b) => (a.date === b.date ? a.scanner.localeCompare(b.scanner) : b.date.localeCompare(a.date)));
}

let cache: Report[] | null = null;
export function getReports(): Report[] {
  return (cache ??= buildData());
}

export const scannerById = (id: ScannerId): Scanner => {
  const scanner = ALL_SCANNERS.find(s => s.id === id);
  if (!scanner) throw new Error(`Unknown scanner: ${id}`);
  return scanner;
};

// Default monthly checklist (department-configurable in the real app).
export const MONTHLY_CHECKLIST: { metric: MetricId; label: string }[] = [
  { metric: "lightmarker", label: "Light marker" },
  { metric: "sagcor", label: "Sag/Cor light marker" },
  { metric: "topogram", label: "Topogram position" },
  { metric: "slice", label: "Slice thickness" },
  { metric: "mtf50", label: "MTF (spatial resolution)" },
  { metric: "table", label: "Table position" },

  { metric: "externalmarker", label: "External light marker" },
  { metric: "contrast", label: "Contrast scale" },
];
// Which monthly checklist tests were found in a scanner's filed Monthly reports for a month.
export function monthlyCoverage(reports: Report[], scanner: ScannerId, month: string) {
  const mine = reports.filter((r) => r.scanner === scanner && r.date.startsWith(month) && r.type === "Monthly");
  const found = new Set(mine.flatMap((r) => r.measurements.map((m) => m.metric)));
  const missing = MONTHLY_CHECKLIST.filter((c) => !found.has(c.metric));
  const flagged = mine.reduce((n, r) => n + r.measurements.filter((m) => isOutOfLimit(m)).length, 0);
  const last = mine.map((r) => r.date).sort().pop() ?? null;
  return { done: MONTHLY_CHECKLIST.length - missing.length, missing, flagged, last, count: mine.length };
}

/** Monthly tests found only in reports still waiting in Review (not yet filed). */
export function monthlyWaiting(reports: Report[], scanner: ScannerId, month: string): string[] {
  const filed = new Set(reports.filter((r) => r.scanner === scanner && r.date.startsWith(month) && r.type === "Monthly").flatMap((r) => r.measurements.map((m) => m.metric)));
  const waiting = new Set(reports.filter((r) => r.scanner === scanner && r.date.startsWith(month) && r.needsReview && r.suggested === "Monthly").flatMap((r) => r.measurements.map((m) => m.metric)));
  return MONTHLY_CHECKLIST.filter((c) => waiting.has(c.metric) && !filed.has(c.metric)).map((c) => c.label);
}

export interface TrendWarning { scanner: ScannerId; metric: MetricId; label: string; context: string; direction: "rising" | "falling" }

/** Heads-up when a Daily reading moved toward its limit on each of the last 3 reports (4 values), still inside limits. */
export function trendWarnings(reports: Report[], scanner: ScannerId): TrendWarning[] {
  const daily = reports.filter((r) => r.scanner === scanner && r.type === "Daily").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const series = new Map<string, Measurement[]>();
  for (const r of daily) for (const m of r.measurements) {
    const k = `${m.metric}|${m.context}|${m.tube ?? ""}`;
    (series.get(k) ?? series.set(k, []).get(k)!).push(m);
  }
  const out: TrendWarning[] = [];
  for (const ms of series.values()) {
    const last = ms.slice(-4);
    if (last.length < 4) continue;
    const end = last[3]!;
    if (isOutOfLimit(end)) continue;
    const mid = (end.lower + end.upper) / 2;
    const up = last.every((m, i) => i === 0 || m.value > last[i - 1]!.value);
    const down = last.every((m, i) => i === 0 || m.value < last[i - 1]!.value);
    const toward = (up && end.value > mid) || (down && end.value < mid);
    if (!toward) continue;
    out.push({ scanner, metric: end.metric, label: METRICS.find((x) => x.id === end.metric)?.label ?? end.metric, context: end.tube ? `tube ${end.tube}, ${end.context}` : end.context, direction: up ? "rising" : "falling" });
  }
  return out;
}
