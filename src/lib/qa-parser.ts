import { printedProgram } from "./qa-filing-evidence";
import { PdfReadError } from "./qa-read-error";
import { distinctMeasurements, validReportTimestamp } from "./qa-parser-validation";
import { type Measurement, type MetricId, type Report, type ScannerId } from "./qa-data";
import { isVa40, parseVa40Pages } from "./qa-parser-va40";

export interface PdfTextPage { page: number; lines: string[] }
export type PrintedStatus = "OK" | "NOT OK" | "Aborted" | "Not available";
export interface PrintedSection { label: string; status: PrintedStatus; page: number }

const sliceHeading = /^Slice (\d+)\b/;
const procedure = "(?:Daily|Monthly|IEC\\s+Constancy|IEC\\s+Acceptance|DHHS\\s*Acceptance)";
const detailHeading = new RegExp(`^(?:\\d+\\.\\s*)?Quality\\s+${procedure}\\s+(.+)$`, "i");
const summaryRow = new RegExp(`^\\s*\\d+\\.\\s*Quality\\s+${procedure}\\s+(.+?)\\s+(NOT\\s+OK|OK)\\s*[.…\\s]*(\\d+)\\s*$`, "i");
const tableBoundary = /^(?:Test:|(?:\d+\.\s*)?Quality|Results for|Water Value Results|Common Parameters)/;

const NUMBER = "[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?";
const readings = new RegExp(`(${NUMBER})\\s*(HU|lp/cm|mm|mGy/100mAs|1/HUcm)(?:\\s*\\((${NUMBER})\\))?`, "g");
const limits = new RegExp(`(${NUMBER})\\s*(?:\\.\\.\\.|…|\\.\\.)\\s*(${NUMBER})\\s*(HU|lp/cm|mm|mGy/100mAs|1/HUcm)`, "g");
const positionValue = new RegExp(`^(${NUMBER})(?:\\s*\\((${NUMBER})\\))?$`);
const positionLimits = new RegExp(`^(${NUMBER})\\s*(?:\\.\\.\\.|…)\\s*(${NUMBER})$`);

function detailLabel(line: string) {
  return /\.{3}|…/.test(line) || summaryRow.test(line) ? undefined : detailHeading.exec(line)?.[1]?.trim();
}

function singleTestResult(pages: PdfTextPage[]): PrintedSection | undefined {
  if (pages.some(({ lines }) => lines.some((line) => /^\s*Table of Contents\s*$/i.test(line)))) return undefined;
  let heading: { label: string; page: number } | undefined;
  let status: PrintedStatus = "Not available";
  let unreadable = false;
  for (const { page, lines } of pages) {
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, " ").trim();
      const label = detailLabel(line);
      if (label) {
        if (heading && heading.label !== label) return undefined;
        heading ??= { label, page };
      }
      if (!heading || !/^(?:Test Parameters )?Test Results\b/i.test(line)) continue;
      if (/\bTest Results NOT OK$/i.test(line)) status = "NOT OK";
      else if (!/\bTest Results OK$/i.test(line)) unreadable = true;
      else if (status !== "NOT OK") status = "OK";
    }
  }
  if (!heading || status === "Not available" || (unreadable && status === "OK")) return undefined;
  return { ...heading, status };
}

function positionReadings(lines: string[], index: number, test: string, page: number, referenceDate?: string): Measurement[] | undefined {
  const label = test.replace(/^Reference\s+/i, "");
  const line = lines[index]?.replace(/\s+/g, " ");
  const next = lines[index + 1] ?? "";
  const measurements: Measurement[] = [];
  const add = (metric: MetricId, context: string, value: number, lower: number, upper: number, baseline: number | null) => {
    if (![value, lower, upper].every(Number.isFinite) || lower > upper || (baseline !== null && !Number.isFinite(baseline))) return;
    measurements.push({ metric, context, value, unit: "mm", lower, upper, baseline, page, limitSource: "printed", ...(referenceDate ? { referenceDate } : {}) });
  };
  if (line === "Result [mm]") {
    const metric = /^Lightmarker$/i.test(label) ? "lightmarker" : /^External Lightm\.$/i.test(label) ? "externalmarker" : /^Topogram Pos\.$/i.test(label) ? "topogram" : undefined;
    if (!metric) return undefined;
    const value = positionValue.exec(next);
    const band = lines[index + 2] === "Tolerance" ? positionLimits.exec(lines[index + 3] ?? "") : null;
    if (value && band) add(metric, test, Number(value[1]), Number(band[1]), Number(band[2]), value[2] ? Number(value[2]) : null);
    return measurements;
  }
  const position = label === "Table Position" && /^Position ([1-4])\b/.exec(line ?? "")?.[1];
  const pair = label === "Sag./Cor. Lightm." && line === "Sagittal Light Marker Coronal Light Marker";
  if (!position && !pair) return undefined;
  const valueRow = pair ? next : (line ?? "");
  const bandRow = pair ? (lines[index + 2] ?? "") : next;
  const values = [...valueRow.matchAll(readings)];
  const bands = [...bandRow.matchAll(limits)];
  if (!/^Tolerance\b/.test(bandRow) || values.length !== 2 || bands.length !== 2) return measurements;
  const prefix = pair ? /^Result\s*/ : /^Position [1-4]\s*/;
  if (!prefix.test(valueRow) || valueRow.replace(prefix, "").replace(readings, "").trim() || bandRow.replace(/^Tolerance\s*/, "").replace(limits, "").trim()) return measurements;
  for (const [j, value] of values.entries()) {
    const band = bands[j]!;
    if (value[2] !== "mm" || band[3] !== "mm") return [];
    const context = pair ? (j === 0 ? "Sagittal" : "Coronal") : `Position ${position} · ${j === 0 ? "Continuous" : "Stepwise"}`;
    add(pair ? "sagcor" : "table", context, Number(value[1]), Number(band[1]), Number(band[2]), value[3] ? Number(value[3]) : null);
  }
  return measurements;
}

export function parseSiemensPages(pages: PdfTextPage[], filename: string, sizeKb: number): Report {
  const all = pages.flatMap(p => p.lines).join("\n").replaceAll("\u00a0", " ");
  if (isVa40(all)) return parseVa40Pages(pages, filename, sizeKb);
  const model = /Product[ \t]+Name[ \t]*:?[ \t\n]+(SOMATOM[^\n]+)/.exec(all)?.[1]?.trim();
  const scanner: ScannerId | undefined = model?.includes("Drive") ? "drive" : model?.includes("Flash") ? "flash" : model?.includes("Edge") ? "edge" : model?.includes("X.cite") ? "xcite" : undefined;
  if (!scanner) throw new PdfReadError("scanner-unrecognized", "Scanner identity could not be matched. This PDF needs manual review.");
  const stamp = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/.exec(all);
  if (!stamp?.[1] || !stamp[2] || !validReportTimestamp(stamp[1], stamp[2])) throw new PdfReadError("invalid-report-date", "Report date could not be read. This PDF needs manual review.");
  const sections: PrintedSection[] = [];
  for (const p of pages) for (const raw of p.lines) {
    const m = summaryRow.exec(raw.replaceAll("\u00a0", " "));
    if (m?.[1] && m[2]) sections.push({ label: m[1].trim(), status: m[2].toUpperCase().replace(/\s+/g, " ") as PrintedStatus, page: Number(m[3]) });
  }
  const detailResult = sections.length ? undefined : singleTestResult(pages);
  if (detailResult) sections.push(detailResult);
  const measurements: Measurement[] = [];
  let extractionIncomplete = false;
  let metric: MetricId | undefined; let currentTest: string | undefined;
  let hasMovementColumns = false;
  let mode = ""; let kv = 120; let kernel = ""; let referenceDate: string | undefined;
  let columns: { metric: MetricId; tube: "A" | "B"; position?: string }[] = [];
  for (const p of pages) {
    const lines = p.lines.map(l => l.replaceAll("\u00a0", " ").trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const label = detailLabel(line);
      if (label) {
        currentTest = label;
        hasMovementColumns = false;
        metric = /Noise/.test(label) ? "noise" : /Homogeneity/.test(label) ? "water" : /MTF/.test(label) ? "mtf50" : /Slice/.test(label) ? "slice" : /Contrast/.test(label) ? "contrast" : undefined;
        if (/Low Contrast/i.test(label)) metric = undefined;
        mode = ""; kernel = ""; columns = []; referenceDate = undefined;
      }
      const test = /^Test:\s*(.*)/.exec(line);
      if (test) { mode = test[1]?.replace(/System A and B$/, "").trim() || "Body mode"; columns = []; kernel = ""; }
      const voltage = /^Voltage\s+(\d+)\s*kV/.exec(line); if (voltage?.[1]) kv = Number(voltage[1]);
      const k = /^Kernel\s+(\S+)/.exec(line); if (k?.[1]) kernel = k[1];
      const ref = /Last IEC Constancy Reference measurement:\s*(\d{4}-\d{2}-\d{2})/.exec(line); if (ref?.[1]) referenceDate = ref[1];
      if (/^Continuous Move\s+Stepwise Move$/.test(line)) hasMovementColumns = true;
      if (currentTest && (/^(?:Result \[mm\]|Sagittal Light Marker\b)/.test(line) || (hasMovementColumns && /^Position [1-4]\b/.test(line)))) {
        const positions = positionReadings(lines, i, currentTest, p.page, referenceDate);
        if (positions) {
          measurements.push(...positions);
          if (positions.length !== (/^Result \[mm\]/.test(line) ? 1 : 2)) extractionIncomplete = true;
        }
      }
      if (/Water Value Results for System/.test(line)) {
        columns = [{ metric: "water", tube: /System B/.test(line) && !/System A/.test(line) ? "B" : "A" }];
        if (/System A.*System B/.test(line)) columns.push({ metric: "water", tube: "B" });
      } else if (/Results for System/.test(line)) {
        const tube = /System B/.test(line) && !/System A/.test(line) ? "B" : "A";
        if (metric) columns = [{ metric, tube }];
        if (/System A.*System B/.test(line) && metric) columns.push({ metric, tube: "B" });
      }
      if (/Center\s+Diff\.?3\s+Diff\.?6\s+Diff\.?9\s+Diff\.?12/.test(line)) {
        const tube = columns[0]?.tube ?? "A";
        columns = [{ metric: "water", tube }, ...["3", "6", "9", "12"].map(position => ({ metric: "homogeneity" as const, tube, position: `${position} o'clock` }))];
      }
      if (/50%\s+10%/.test(line)) {
        const tube = columns[0]?.tube ?? "A"; columns = [{ metric: "mtf50", tube }, { metric: "mtf10", tube }];
      }
      if (/Water\s+CT Air\s+Contrast scale/.test(line)) {
        const tube = columns[0]?.tube ?? "A"; columns = [{ metric: "water", tube }, { metric: "air", tube }, { metric: "contrast", tube }];
      }
      if (!sliceHeading.test(line) || !metric || columns.length === 0) continue;
      const rowStarts = [i];
      let end = i + 1;
      while (end < lines.length && !tableBoundary.test(lines[end] ?? "")) {
        if (sliceHeading.test(lines[end] ?? "")) rowStarts.push(end);
        end++;
      }
      const rows = rowStarts.map((start, index) => {
        const rowLines = lines.slice(start, rowStarts[index + 1] ?? end);
        const text = rowLines.join(" ");
        return {
          slice: sliceHeading.exec(rowLines[0] ?? "")?.[1],
          lines: rowLines,
          bands: [...text.matchAll(limits)],
          values: [...text.replace(limits, "").matchAll(readings)],
        };
      });
      const lastRow = rows.at(-1);
      let commonBands: RegExpMatchArray[] = [];
      // A table-wide tolerance follows the last reading in a separate footer.
      const footerIndex = lastRow?.lines.findIndex((s) => /^Tolerance\b/.test(s)) ?? -1;
      if (lastRow && footerIndex > 0 && rows.slice(0, -1).every((r) => !r.bands.length && !r.lines.some((s) => /^Tolerance\b/.test(s)))) {
        const beforeFooter = lastRow.lines.slice(0, footerIndex).join(" ");
        const footer = lastRow.lines.slice(footerIndex).join(" ");
        const footerBands = [...footer.matchAll(limits)];
        if (footerBands.length === columns.length && ![...beforeFooter.matchAll(limits)].length && ![...footer.replace(limits, "").matchAll(readings)].length) {
          commonBands = footerBands;
        }
      }
      for (const row of rows) {
        const bands = row.bands.length ? row.bands : commonBands;
        if (!row.slice || row.values.length !== columns.length || bands.length !== columns.length) {
          extractionIncomplete = true;
          continue;
        }
        columns.forEach((col, index) => {
          const v = row.values[index];
          const band = bands[index];
          if (!v?.[1] || !v[2] || !band?.[1] || !band[2] || v[2] !== band[3]) {
            extractionIncomplete = true;
            return;
          }
          const value = Number(v[1]);
          const lower = Number(band[1]);
          const upper = Number(band[2]);
          if (![value, lower, upper].every(Number.isFinite) || lower > upper) {
            extractionIncomplete = true;
            return;
          }
          const context = `${kv} kV · ${mode || "Body mode"} · Tube ${col.tube} · Slice ${row.slice}${col.position ? ` · ${col.position}` : ""}${kernel ? ` · ${kernel}` : ""}`;
          measurements.push({ metric: col.metric, context, tube: col.tube, slice: Number(row.slice), mode: mode || "Body mode", kv, kernel, value, unit: v[2], lower, upper, baseline: v[3] ? Number(v[3]) : null, page: p.page, limitSource: "printed", ...(referenceDate ? { referenceDate } : {}) });
        });
      }
      i = end - 1;
    }
  }
  // Central water values are also present in the homogeneity table: retain one reading.
  const unique = distinctMeasurements(measurements);
  const printedStatus: PrintedStatus = sections.some(s => s.status === "NOT OK") ? "NOT OK" : sections.length ? "OK" : "Not available";
  // Flash daily checks can be printed as IEC Constancy: identify the exact
  // noise + homogeneity/water summary, not the filename or archive folder.
  const dailyConstancy = sections.length === 2
    && sections.some(s => s.label === "Noise")
    && sections.some(s => s.label === "Homogeneity" || s.label === "Homogeneity / Water");
  const suggested = /Quality\s+(?:IEC\s+)?Acceptance/.test(all) ? "Other" : /Quality\s+Daily/.test(all) || dailyConstancy ? "Daily" : sections.length > 2 ? "Monthly" : "Other";
  return { id: `local-${filename}-${stamp[1]}-${stamp[2]}`, scanner, date: stamp[1], time: stamp[2], fileName: filename, sizeKb, type: "Other", suggested, program: printedProgram(all), confidence: "uncertain", needsReview: true, measurements: unique, pages: pages.length, source: "uploaded", printedStatus, printedSections: sections, software: /Software Version\s+([^\n]+)/.exec(all)?.[1]?.trim() ?? "Not available", extractionIncomplete, extractionNotes: ["Readings are extracted from supported tables with printed limits. See the original PDF for the complete report.", ...(detailResult ? ["Printed result read from the test details."] : []), ...(sections.length ? [] : ["Printed summary not available; no QA result inferred."]), ...(unique.length ? [] : ["No supported measurement tables found."]), ...(extractionIncomplete ? ["Some rows do not have readable measurements and matching printed limits."] : [])] };
}
