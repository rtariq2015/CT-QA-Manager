import { parseSiemensPages, type PdfTextPage } from "./qa-parser";
import { log } from "./qa-logger";
import type { Report } from "./qa-data";
import { desktop } from "./qa-desktop";
import { saveArchivedReport } from "./qa-library";

/** Import through the same filing and archive path for folders and individual PDFs. */
export async function importQaPdf(file: File, addReport: (report: Report) => Report) {
  const report = await readQaPdf(file);
  report.originalUrl = URL.createObjectURL(file);
  const bytes = desktop() ? new Uint8Array(await file.arrayBuffer()) : undefined;
  const filed = addReport(report);
  if (!bytes) return { report: filed, saved: false };

  try {
    const saved = await saveArchivedReport(filed, bytes);
    return { report: filed, saved };
  } catch (err) {
    const archiveError = err instanceof Error ? err.message : String(err);
    log("error", "folder", `Could not save a copy of ${file.name}: ${archiveError}`);
    return { report: filed, saved: false, archiveError };
  }
}

// Browser-only entry point: load PDF.js after a user selects a local file.
export async function readQaPdf(file: File) {
  const t0 = performance.now();
  try {
    const r = await readInner(file);
    const ms = Math.round(performance.now() - t0);
    log(r.printedStatus === "NOT OK" ? "warning" : "success", "file", `Read ${file.name}: ${r.scanner}${r.software && r.software !== "Not available" ? ` (${r.software})` : ""}, looks like ${r.suggested}, ${r.measurements.length} readings, printed ${r.printedStatus ?? "n/a"}, ${ms} ms`);
    if (r.extractionNotes?.length) log("warning", "file", `Partly read ${file.name}: ${r.extractionNotes.join("; ")}`);
    return r;
  } catch (e) {
    log("error", "file", `Could not read ${file.name}: ${(e as Error).message}`);
    throw e;
  }
}

async function readInner(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await task.promise;
  const pages: PdfTextPage[] = [];
  try {
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      const rows: { y: number; parts: { x: number; text: string }[] }[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5] ?? 0; const x = item.transform[4] ?? 0;
        let row = rows.find(r => Math.abs(r.y - y) < 2);
        if (!row) { row = { y, parts: [] }; rows.push(row); }
        row.parts.push({ x, text: item.str });
      }
      pages.push({ page: n, lines: rows.sort((a, b) => b.y - a.y).map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(" ")) });
    }
    return parseSiemensPages(pages, file.name, Math.round(file.size / 1024));
  } finally { await task.destroy(); }
}
