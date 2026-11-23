import { parseSiemensPages, type PdfTextPage } from "./qa-parser";
import { log } from "./qa-logger";
import type { FailedImport } from "./qa-import-failure";
import { pdfReadErrorCode } from "./qa-read-error";
import type { Report } from "./qa-data";
import { desktop } from "./qa-desktop";
import { saveArchivedReport } from "./qa-library";

const sourceUrls = new WeakMap<Report, string>();

export interface PdfImportResult {
  report: Report;
  cached: boolean;
  readMs: number;
  saved: boolean;
  archiveError?: string;
}

/** Import through the same filing and archive path for folders and individual PDFs. */
export async function importQaPdf(
  file: File,
  addReport: (report: Report) => Report,
  addFailedImport: (failure: FailedImport) => void,
  sourceKey?: string,
): Promise<PdfImportResult> {
  const start = performance.now();
  const bridge = desktop();
  let bytes: ArrayBuffer | undefined;
  let parsed: Report;
  let cached: boolean;
  try {
    bytes = await file.arrayBuffer();
    ({ report: parsed, cached } = await readQaPdf(file, bytes, !!bridge));
  } catch (error) {
    const code = pdfReadErrorCode(error);
    if (bridge && bytes) {
      try {
        const entry = await bridge.saveFailedImport(file.name, code, new Uint8Array(bytes));
        if (entry) addFailedImport(entry);
      } catch {
        log("error", "folder", "Could not save the failed PDF to the Review Inbox");
        addFailedImport(await sessionFailure(file, code));
      }
    } else {
      addFailedImport(await sessionFailure(file, code));
    }
    throw error;
  }
  const originalUrl = sourceUrls.get(parsed) ?? URL.createObjectURL(file);
  sourceUrls.set(parsed, originalUrl);
  const report = { ...parsed, originalUrl };
  const filed = addReport(report);
  const result = { report: filed, cached, readMs: Math.round(performance.now() - start) };
  if (!bridge) return { ...result, saved: false };

  try {
    const saved = await saveArchivedReport(filed, new Uint8Array(bytes), parsed, sourceKey);
    return { ...result, saved };
  } catch (err) {
    const archiveError = err instanceof Error ? err.message : String(err);
    log("error", "folder", `Could not save a copy of ${file.name}: ${archiveError}`);
    return { ...result, saved: false, archiveError };
  }
}

async function sessionFailure(file: File, code: FailedImport["code"]): Promise<FailedImport> {
  let id = JSON.stringify([file.name, file.size, file.lastModified]);
  try {
    const hash = await globalThis.crypto?.subtle?.digest("SHA-256", await file.arrayBuffer());
    if (hash) id = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch { /* preserve the queue entry even when the PDF bytes cannot be opened */ }
  return { id, fileName: file.name, code, archived: false, original: file, at: new Date().toISOString() };
}

// Cache parsed readings for identical PDFs within this app session.
const parsedReports = new Map<string, Report>();
const CACHE_LIMIT = 512;

async function readQaPdf(file: File, bytes: ArrayBuffer, preserveBytes: boolean) {
  const t0 = performance.now();
  try {
    const digest = await globalThis.crypto?.subtle?.digest("SHA-256", bytes);
    const hash = digest && Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const key = hash && `${hash}:${file.name}`;
    const previous = key ? parsedReports.get(key) : undefined;
    if (previous) return { report: previous, cached: true };
    // PDF.js transfers its input buffer to the worker.
    const r = await readInner(file.name, preserveBytes ? bytes.slice(0) : bytes);
    if (key) {
      if (parsedReports.size >= CACHE_LIMIT) {
        const first = parsedReports.keys().next().value;
        if (first) parsedReports.delete(first);
      }
      parsedReports.set(key, r);
    }
    const ms = Math.round(performance.now() - t0);
    log(r.printedStatus === "NOT OK" ? "warning" : "success", "file", `Read ${file.name}: ${r.scanner}${r.software && r.software !== "Not available" ? ` (${r.software})` : ""}, looks like ${r.suggested}, ${r.measurements.length} readings, printed ${r.printedStatus ?? "n/a"}, ${ms} ms`);
    return { report: r, cached: false };
  } catch (e) {
    log("error", "file", `Could not read ${file.name}: ${(e as Error).message}`);
    throw e;
  }
}

async function readInner(filename: string, bytes: ArrayBuffer) {
  const sizeKb = Math.round(bytes.byteLength / 1024);
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pages: PdfTextPage[] = [];
  try {
    const document = await task.promise;
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      type Row = { y: number; order: number; parts: { x: number; text: string }[] };
      const rows: Row[] = [];
      const byBand = new Map<number, Row[]>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5] ?? 0;
        const x = item.transform[4] ?? 0;
        const band = Math.floor(y / 2);
        let row: Row | undefined;
        for (let i = band - 1; i <= band + 1; i++) {
          for (const candidate of byBand.get(i) ?? []) {
            if (Math.abs(candidate.y - y) < 2 && (!row || candidate.order < row.order)) row = candidate;
          }
        }
        if (!row) {
          row = { y, order: rows.length, parts: [] };
          rows.push(row);
          const bucket = byBand.get(band);
          if (bucket) bucket.push(row);
          else byBand.set(band, [row]);
        }
        row.parts.push({ x, text: item.str });
      }
      pages.push({ page: n, lines: rows.sort((a, b) => b.y - a.y).map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(" ")) });
    }
    return parseSiemensPages(pages, filename, sizeKb);
  } finally { await task.destroy(); }
}
