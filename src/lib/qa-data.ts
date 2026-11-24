import type { PrintedProgram } from "./qa-filing-evidence";
import type { PrintedSection, PrintedStatus } from "./qa-parser";

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
  /** Whether the printed test heading identifies a reference run. Older readings may lack this detail. */
  referenceTest?: boolean;
  limitSource?: "printed";
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
  program?: PrintedProgram;
  parserRevision?: number;
  confidence: "certain" | "likely" | "uncertain";
  needsReview: boolean;
  autoFiled?: boolean;
  measurements: Measurement[];
  pages: number;
  source?: "uploaded";
  printedStatus?: PrintedStatus;
  printedSections?: PrintedSection[];
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
