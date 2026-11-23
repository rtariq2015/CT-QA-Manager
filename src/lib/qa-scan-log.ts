import type { PdfImportResult } from "./qa-pdf";
import type { ScannerId } from "./qa-data";
import type { FolderKind } from "./qa-settings";
import { pdfReadErrorCode } from "./qa-read-error";
import { reviewReasonCode } from "./qa-triage";

export const SCAN_HISTORY_KEY = "qa-scan-history";
const HISTORY_LIMIT = 60;

export interface ScanSummary {
  at: string;
  source: FolderKind | "selected-files";
  configuredFolder?: number;
  durationMs: number;
  sourceReadMs: number;
  found: number;
  read: number;
  failed: number;
  cached: number;
  queuedForReview: number;
  printedNotOk: number;
  saved: number;
  archiveFailed: number;
  readTimingMs: { median: number; p95: number } | null;
  readErrors: Record<string, number>;
  reviewReasons: Record<string, number>;
  reportsByScanner: Partial<Record<ScannerId, number>>;
  sourceError?: { code: string; nativeCode?: number };
}

const increment = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export function getScanHistory(): ScanSummary[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SCAN_HISTORY_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.slice(-HISTORY_LIMIT) as ScanSummary[] : [];
  } catch {
    return [];
  }
}

export function clearScanHistory() {
  try { localStorage.removeItem(SCAN_HISTORY_KEY); } catch { /* storage unavailable */ }
}

export function startScan(source: ScanSummary["source"], sourceReadMs = 0, configuredFolder?: number) {
  const start = performance.now();
  const timings: number[] = [];
  const summary: ScanSummary = {
    at: new Date().toISOString(), source, sourceReadMs, durationMs: 0, found: 0, read: 0,
    failed: 0, cached: 0, queuedForReview: 0, printedNotOk: 0, saved: 0, archiveFailed: 0,
    readTimingMs: null, readErrors: {}, reviewReasons: {}, reportsByScanner: {},
    ...(configuredFolder === undefined ? {} : { configuredFolder }),
  };
  return {
    recordRead({ report, cached, readMs, saved, archiveError }: PdfImportResult) {
      summary.read++;
      increment(summary.reportsByScanner, report.scanner);
      if (cached) summary.cached++;
      else timings.push(readMs);
      if (report.printedStatus === "NOT OK") summary.printedNotOk++;
      if (report.needsReview) {
        summary.queuedForReview++;
        increment(summary.reviewReasons, reviewReasonCode(report) ?? "review-required");
      }
      if (saved) summary.saved++;
      if (archiveError !== undefined) summary.archiveFailed++;
    },
    recordFailure(error: unknown) {
      summary.failed++;
      increment(summary.readErrors, pdfReadErrorCode(error));
    },
    finish(found: number, sourceError?: ScanSummary["sourceError"]) {
      summary.found = found;
      summary.durationMs = Math.round(performance.now() - start) + sourceReadMs;
      if (sourceError) summary.sourceError = sourceError;
      timings.sort((a, b) => a - b);
      if (timings.length) {
        summary.readTimingMs = {
          median: timings[Math.ceil(timings.length * 0.5) - 1]!,
          p95: timings[Math.ceil(timings.length * 0.95) - 1]!,
        };
      }
      try {
        localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify([...getScanHistory(), summary].slice(-HISTORY_LIMIT)));
      } catch { /* scan can finish without browser storage */ }
      return summary;
    },
  };
}
