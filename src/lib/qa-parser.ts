import { type Measurement, type MetricId, type Report, type ScannerId } from "./qa-data";
import { isVa40, parseVa40Pages } from "./qa-parser-va40";

export interface PdfTextPage { page: number; lines: string[] }
export type PrintedStatus = "OK" | "NOT OK" | "Not available";
export interface PrintedSection { label: string; status: PrintedStatus; page: number }

const NUMBER = "[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?";
const readings = new RegExp(`(${NUMBER})\\s*(HU|lp/cm|mm|mGy/100mAs|1/HUcm)(?:\\s*\\((${NUMBER})\\))?`, "g");
const limits = new RegExp(`(${NUMBER})\\s*(?:\\.\\.\\.|…|\\.\\.)\\s*(${NUMBER})\\s*(HU|lp/cm|mm|mGy/100mAs|1/HUcm)`, "g");

export function parseSiemensPages(pages: PdfTextPage[], filename: string, sizeKb: number): Report {
  const all = pages.flatMap(p => p.lines).join("\n").replaceAll("\u00a0", " ");
  if (isVa40(all)) return parseVa40Pages(pages, filename, sizeKb);
  const model = /Product Name\s+(SOMATOM[^\n]+)/.exec(all)?.[1]?.trim();
  const scanner: ScannerId | undefined = model?.includes("Drive") ? "drive" : model?.includes("Flash") ? "flash" : model?.includes("Edge") ? "edge" : model?.includes("X.cite") ? "xcite" : undefined;
  if (!scanner) throw new Error("Scanner identity could not be matched. This PDF needs manual review.");
  const stamp = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/.exec(all);
  if (!stamp?.[1] || !stamp[2]) throw new Error("Report date could not be read. This PDF needs manual review.");
  const sections: PrintedSection[] = [];
  for (const p of pages) for (const raw of p.lines) {
    const m = /^\s*\d+\.\s*Quality (?:Daily|IEC Constancy|IEC Acceptance)\s+(.+?)\s+(NOT\s+OK|OK)\s*[.\s]*(\d+)\s*$/.exec(raw);
    if (m?.[1] && m[2]) sections.push({ label: m[1].trim(), status: m[2].replace(/\s+/g, " ") as PrintedStatus, page: Number(m[3]) });
  }
  const measurements: Measurement[] = [];
  let metric: MetricId | undefined;
  let mode = ""; let kv = 120; let kernel = ""; let referenceDate: string | undefined;
  let columns: { metric: MetricId; tube: "A" | "B"; position?: string }[] = [];
  for (const p of pages) {
    const lines = p.lines.map(l => l.replaceAll("\u00a0", " ").trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const heading = /^\d+\.\s*Quality (?:Daily|IEC Constancy)\s+(.+)/.exec(line);
      if (heading?.[1] && !/\.{3}/.test(line)) {
        const label = heading[1];
        metric = /Noise/.test(label) ? "noise" : /Homogeneity/.test(label) ? "water" : /MTF/.test(label) ? "mtf50" : /Slice/.test(label) ? "slice" : /Contrast/.test(label) ? "contrast" : undefined;
        mode = ""; kernel = ""; columns = []; referenceDate = undefined;
      }
      const test = /^Test:\s*(.*)/.exec(line);
      if (test) { mode = test[1]?.replace(/System A and B$/, "").trim() || "Body mode"; columns = []; kernel = ""; }
      const voltage = /^Voltage\s+(\d+)\s*kV/.exec(line); if (voltage?.[1]) kv = Number(voltage[1]);
      const k = /^Kernel\s+(\S+)/.exec(line); if (k?.[1]) kernel = k[1];
      const ref = /Last IEC Constancy Reference measurement:\s*(\d{4}-\d{2}-\d{2})/.exec(line); if (ref?.[1]) referenceDate = ref[1];
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
      const slice = /^Slice (\d+)\b/.exec(line);
      if (!slice?.[1] || !metric || columns.length === 0) continue;
      let end = i + 1;
      while (end < lines.length && !/^(?:Slice \d+|Test:|\d+\. Quality|Results for|Water Value Results|Common Parameters)/.test(lines[end] ?? "")) end++;
      const block = lines.slice(i, end).join(" ");
      const ownLimits = [...block.matchAll(limits)];
      const valueText = block.replace(limits, "");
      const values = [...valueText.matchAll(readings)];
      // A trailing common tolerance belongs to all preceding slices in this table.
      const tableTail: string[] = [];
      for (let j = end; j < lines.length; j++) {
        const candidate = lines[j] ?? "";
        if (/^(?:Test:|\d+\. Quality|Results for|Water Value Results)/.test(candidate)) break;
        tableTail.push(candidate);
      }
      const common = [...tableTail.join(" ").matchAll(limits)];
      const bands = ownLimits.length ? ownLimits : common;
      values.forEach((v, c) => {
        const col = columns[c]; const band = bands[c] ?? (columns.length === 1 ? bands[0] : undefined);
        if (!col || !band || !v[1] || !v[2] || !band[1] || !band[2] || v[2] !== band[3]) return;
        const context = `${kv} kV · ${mode || "Body mode"} · Tube ${col.tube} · Slice ${slice[1]}${col.position ? ` · ${col.position}` : ""}${kernel ? ` · ${kernel}` : ""}`;
        measurements.push({ metric: col.metric, context, tube: col.tube, slice: Number(slice[1]), mode: mode || "Body mode", kv, kernel, value: Number(v[1]), unit: v[2], lower: Number(band[1]), upper: Number(band[2]), baseline: v[3] ? Number(v[3]) : null, page: p.page, limitSource: "printed", ...(referenceDate ? { referenceDate } : {}) });
      });
      i = end - 1;
    }
  }
  // Central water values are also present in the homogeneity table: retain one reading.
  const unique = measurements.filter((m, i, ms) => ms.findIndex(x => x.page === m.page && x.metric === m.metric && x.context === m.context) === i);
  const printedStatus: PrintedStatus = sections.some(s => s.status === "NOT OK") ? "NOT OK" : sections.length ? "OK" : "Not available";
  // Flash daily checks can be printed as IEC Constancy: identify the exact
  // noise + homogeneity/water summary, not the filename or archive folder.
  const dailyConstancy = sections.length === 2
    && sections.some(s => s.label === "Noise")
    && sections.some(s => s.label === "Homogeneity" || s.label === "Homogeneity / Water");
  const suggested = /Quality (?:IEC )?Acceptance/.test(all) ? "Other" : /Quality Daily/.test(all) || dailyConstancy ? "Daily" : sections.length > 2 ? "Monthly" : "Other";
  return { id: `local-${filename}-${stamp[1]}-${stamp[2]}`, scanner, date: stamp[1], time: stamp[2], fileName: filename, sizeKb, type: "Other", suggested, confidence: "uncertain", needsReview: true, measurements: unique, pages: pages.length, source: "uploaded", printedStatus, printedSections: sections, software: /Software Version\s+([^\n]+)/.exec(all)?.[1]?.trim() ?? "Not available", extractionNotes: ["Partial extraction: slice tables with explicit printed limits only. Check the original PDF for other tests.", ...(sections.length ? [] : ["Printed summary not available; no QA result inferred."]), ...(unique.length ? [] : ["No supported measurement tables found."])] };
}