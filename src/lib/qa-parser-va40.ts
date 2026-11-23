import { PdfReadError } from "./qa-read-error";
import { distinctMeasurements, validReportTimestamp } from "./qa-parser-validation";
import { type Measurement, type MetricId, type Report } from "./qa-data";
import type { PdfTextPage, PrintedSection, PrintedStatus } from "./qa-parser";

// syngo CT VA40 layout (SOMATOM X.cite): MM/DD/YYYY dates, a summary table of
// "Test (IEC Constancy)  date time  OK|Not OK", single tube (System A) tables
// with a "Tolerance: a … b" header line. Only printed values and limits are read.

const NUM = "[-+]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:[eE][-+]?\\d+)?";
const RANGE = new RegExp(`(${NUM})\\s*(?:…|\\.\\.\\.)\\s*(${NUM})`, "g");
const num = (s: string) => Number(s.replaceAll(",", ""));
const ranges = (s: string) => [...s.matchAll(RANGE)].map(m => [num(m[1] ?? ""), num(m[2] ?? "")] as [number, number]);

export const isVa40 = (all: string) => /\|\s*SOMATOM X\.cite\s*\|/.test(all) || /Product\s+Name\s+SOMATOM\s+X\.cite/.test(all);

function iso(m: string, d: string, y: string) { return `${y}-${m}-${d}`; }
function time24(h: string, mi: string, s: string, ap: string) {
  if (Number(h) < 1 || Number(h) > 12) return "";
  let n = Number(h) % 12; if (ap === "PM") n += 12;
  return `${String(n).padStart(2, "0")}:${mi}:${s}`;
}

function metricFor(test: string): MetricId | undefined {
  if (/Sagittal/.test(test)) return "sagcor";
  if (/^Lightmarker/.test(test)) return "lightmarker";
  if (/Topogram/.test(test)) return "topogram";
  if (/^Slice/.test(test)) return "slice";
  if (/Homogeneity/.test(test)) return "water";
  if (/Noise/.test(test)) return "noise";
  if (/MTF/.test(test)) return "mtf50";
  if (/Contrast/.test(test)) return "contrast";
  if (/Table/.test(test)) return "table";
  return undefined;
}

const UNIT: Record<MetricId, string> = { water: "HU", noise: "HU", homogeneity: "HU", slice: "mm", mtf50: "lp/cm", mtf10: "lp/cm", ctdi: "mGy/100mAs", lightmarker: "mm", externalmarker: "mm", sagcor: "mm", topogram: "mm", table: "mm", lowcontrast: "mm", contrast: "1/HUcm", air: "HU" };

export function parseVa40Pages(pages: PdfTextPage[], filename: string, sizeKb: number): Report {
  const all = pages.flatMap(p => p.lines).join("\n").replaceAll("\u00a0", " ");
  // Summary rows; the OK/Not OK may sit on the following line.
  const sections: PrintedSection[] = [];
  let stamp: { date: string; time: string } | undefined;
  const summaryPages = pages.filter(p => p.lines.some(l => /^\s*Summary\s*$/.test(l)));
  for (const summaryPage of summaryPages) {
    const text = summaryPage.lines.join("\n").replaceAll("\u00a0", " ");
    const row = /([A-Z][A-Za-z/ ]+?)(?:\s*\(IEC Constancy\))?\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)\s*\n?\s*(Not OK|NOT OK|OK)\b/g;
    for (const m of text.matchAll(row)) {
      const label = (m[1] ?? "").replace(/^(?:Function Start Time Result|Result)\s*/, "").trim();
      sections.push({ label, status: /not/i.test(m[9] ?? "") ? "NOT OK" : "OK", page: summaryPage.page });
      if (!stamp) stamp = { date: iso(m[2]!, m[3]!, m[4]!), time: time24(m[5]!, m[6]!, m[7]!, m[8]!) };
    }
  }
  if (!stamp) {
    const f = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)/.exec(all);
    if (!f) throw new PdfReadError("invalid-report-date", "Report date could not be read. This PDF needs manual review.");
    stamp = { date: iso(f[1]!, f[2]!, f[3]!), time: time24(f[4]!, f[5]!, f[6]!, f[7]!) };
  }

  if (!validReportTimestamp(stamp.date, stamp.time)) throw new PdfReadError("invalid-report-date", "Report date or time could not be read. This PDF needs manual review.");

  const measurements: Measurement[] = [];
  let extractionIncomplete = false;
  let test = ""; let metric: MetricId | undefined; let mode = ""; let kv = 120; let kernel = "";
  type Col = { metric: MetricId; band: [number, number]; position?: string; skipRef?: boolean };
  let cols: Col[] = []; let kind: "rows" | "slice" | "marker" | "table" | "" = "";
  let pending: MetricId[] = []; let pendingPos: (string | undefined)[] = []; let pendingRef = false; let markerBuf: string[] = [];
  const push = (m: MetricId, value: number, band: [number, number], page: number, extra: Partial<Measurement> & { where: string }) => {
    if (![value, ...band].every(Number.isFinite) || band[0] > band[1]) {
      extractionIncomplete = true;
      return;
    }
    const { where, ...rest } = extra;
    measurements.push({ metric: m, context: `${kv} kV · ${mode || test} · Tube A · ${where}${kernel ? ` · ${kernel}` : ""}`, tube: "A", mode: mode || test, kv, kernel, value, unit: UNIT[m], lower: band[0], upper: band[1], baseline: null, page, limitSource: "printed", ...rest });
  };

  for (const p of pages) {
    if (p.lines.some(l => /Table of Contents/.test(l))) continue;
    const lines = p.lines.map(l => l.replaceAll("\u00a0", " ").replace(/S_t_a_t_u_s\S*/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (/^(?:Maimonides|©)|\| SOMATOM/.test(line)) continue;
      const h = /^(\d{1,2})\s*([A-Z][A-Za-z/ ]+?)(?:\s*\(IEC.*)?$/.exec(line);
      if (h?.[2] && !/\d+\.\d/.test(line) && metricFor(h[2].trim()) && /\(IEC/.test(line + (lines[i + 1] ?? ""))) {
        test = h[2].trim(); metric = metricFor(test); mode = ""; kernel = ""; cols = []; kind = ""; pending = [];
        continue;
      }
      const sub = /^\d+\.\d+\.\d+(?:\.\d+)?\s+(.+)$/.exec(line); if (sub?.[1] && !/Single Source/.test(sub[1])) { mode = sub[1].replace(/^Typical\s+/, "").replace(/^./, c => c.toUpperCase()); cols = []; kind = ""; }
      const v = /^Voltage\s+(\d+)\s*kV/.exec(line); if (v?.[1]) kv = Number(v[1]);
      const k = /^Kernel\s+(\S+)/.exec(line); if (k?.[1]) kernel = k[1];
      if (!metric) continue;

      // Table headers
      if (/^Slice Water Value Results for System A/.test(line)) { pending = ["water"]; pendingPos = [undefined]; pendingRef = false; kind = "rows"; cols = []; continue; }
      if (/^Slice Center \[HU\] Diff\.3/.test(line)) { pending = ["water", "homogeneity", "homogeneity", "homogeneity", "homogeneity"]; pendingPos = [undefined, "3 o'clock", "6 o'clock", "9 o'clock", "12 o'clock"]; pendingRef = false; kind = "rows"; cols = []; continue; }
      if (/^Slice Results for System A \[HU\]/.test(line) && metric === "noise") { pending = ["noise"]; pendingPos = [undefined]; pendingRef = false; kind = "rows"; cols = []; continue; }
      if (/^Slice 50% \[lp\/cm\] 10%/.test(line)) { pending = ["mtf50", "mtf10"]; pendingPos = [undefined, undefined]; pendingRef = true; kind = "rows"; cols = []; continue; }
      if (/^Slice Water \[HU\] CT Air \[HU\] Contrast Scale/.test(line)) { pending = ["water", "air", "contrast"]; pendingPos = [undefined, undefined, undefined]; pendingRef = false; kind = "rows"; cols = []; continue; }
      if (/^Slice System A \[mm\]/.test(line)) { kind = "slice"; cols = []; continue; }
      if (/^Mode Description (?:Result \[mm\]|Sagittal Lightmarker)/.test(line)) { pending = metric === "sagcor" ? ["sagcor", "sagcor"] : [metric]; pendingPos = metric === "sagcor" ? ["Sagittal", "Coronal"] : [undefined]; kind = "marker"; cols = []; markerBuf = []; pendingRef = false; continue; }
      if (/^Position Continuous Move/.test(line)) { kind = "table"; continue; }

      // Collect tolerance bands for the pending header (may span several lines).
      if (pending.length && cols.length < pending.length) {
        for (const b of ranges(line)) if (cols.length < pending.length) cols.push({ metric: pending[cols.length]!, band: b, ...(pendingPos[cols.length] ? { position: pendingPos[cols.length]! } : {}), skipRef: pendingRef });
        if (/Tolerance/.test(line) || ranges(line).length) continue;
      }

      if (kind === "rows") {
        const r = new RegExp(`^(\\d+)\\s+((?:(?:${NUM})\\s*)+)`).exec(line);
        if (!r?.[1] || !r[2]) continue;
        const vals = (r[2].match(new RegExp(NUM, "g")) ?? []).map(num);
        const stride = pendingRef ? 2 : 1;
        if (cols.length !== pending.length || vals.length !== cols.length * stride) {
          extractionIncomplete = true;
          continue;
        }
        cols.forEach((c, j) => {
          const value = vals[j * stride];
          const baseline = c.skipRef ? (vals[j * stride + 1] ?? null) : null;
          if (value === undefined) return;
          push(c.metric, value, c.band, p.page, { slice: Number(r[1]), baseline, where: `Slice ${r[1]}${c.position ? ` · ${c.position}` : ""}` });
        });
      } else if (kind === "slice") {
        const r = new RegExp(`^(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*(?:…|\\.\\.\\.)\\s*(${NUM})`).exec(line);
        if (r) push("slice", num(r[2]!), [num(r[4]!), num(r[5]!)], p.page, { slice: Number(r[1]), baseline: num(r[3]!), where: `Slice ${r[1]}` });
      } else if (kind === "marker" && cols.length === pending.length) {
        // Values precede OK / Out Tol. / In Tol. on the mode description line(s).
        markerBuf.push(line);
        const block = markerBuf.join(" ");
        if (!/\b(?:OK|In Tol\.|Out Tol\.|Not OK)/.test(block)) continue;
        markerBuf = [];
        const head = block.split(/\b(?:OK|In Tol\.|Out Tol\.|Not OK)/)[0] ?? "";
        const vals = (head.replace(/\d+kV|\d+x\d+(?:\.\d+)?mm|FFS\d+x\d+/g, "").match(new RegExp(`(?:^|\\s)(${NUM})(?=\\s|$)`, "g")) ?? []).map(s => num(s.trim()));
        const tail = vals.slice(-cols.length);
        if (tail.length === cols.length) { cols.forEach((c, j) => push(c.metric, tail[j]!, c.band, p.page, { where: c.position ?? "Result" })); kind = ""; }
      } else if (kind === "table") {
        const r = new RegExp(`^Position (\\d)\\s+(${NUM})\\s+(${NUM})\\s*…\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*…\\s*(${NUM})`).exec(line);
        if (r) {
          push("table", num(r[2]!), [num(r[3]!), num(r[4]!)], p.page, { where: `Position ${r[1]} · Continuous` });
          push("table", num(r[5]!), [num(r[6]!), num(r[7]!)], p.page, { where: `Position ${r[1]} · Stepwise` });
        }
      }
    }
  }
  // Centre water values repeat in the homogeneity table: keep one per mode/slice.
  const unique = distinctMeasurements(measurements, true);
  const printedStatus: PrintedStatus = sections.some(s => s.status === "NOT OK") ? "NOT OK" : sections.length ? "OK" : "Not available";
  const labels = sections.map(s => s.label);
  const daily = sections.length === 2 && labels.includes("Noise") && labels.includes("Homogeneity");
  const suggested = /Acceptance/.test(all.slice(0, 400)) ? "Other" : daily ? "Daily" : sections.length > 2 && /IEC Constancy/.test(all.slice(0, 400)) ? "Monthly" : "Other";
  return {
    id: `local-${filename}-${stamp.date}-${stamp.time}`, scanner: "xcite", date: stamp.date, time: stamp.time, fileName: filename, sizeKb,
    type: "Other", suggested, confidence: "uncertain", needsReview: true, measurements: unique, pages: pages.length, source: "uploaded",
    printedStatus, printedSections: sections, software: /Software\s+Version\s+(\S+)/.exec(all)?.[1] ?? "Not available",
    extractionIncomplete,
    extractionNotes: ["Partial extraction: tables with printed limits only. Check the original PDF for other tests.", ...(sections.length ? [] : ["Printed summary not available; no QA result inferred."]), ...(unique.length ? [] : ["No supported measurement tables found."]), ...(extractionIncomplete ? ["Some rows do not have readable measurements and matching printed limits."] : [])],
  };
}
