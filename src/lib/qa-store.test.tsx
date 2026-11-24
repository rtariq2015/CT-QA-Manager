import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { type ReactNode } from "react";
import { QaProvider, useQa } from "./qa-store";
import { parseSiemensPages } from "./qa-parser";
import { matchingReviewReports, reviewMatchKey } from "./qa-review-matching";
import { DEFAULT, SETTINGS_KEY } from "./qa-settings";

const wrapper = ({ children }: { children: ReactNode }) => <QaProvider>{children}</QaProvider>;

it("filing and undo change classification without clearing printed NOT OK", () => {
  const { result } = renderHook(() => useQa(), { wrapper });
  const addReport = result.current.addReport;
  const report = parseSiemensPages([
    { page: 1, lines: ["Product Name SOMATOM Drive", "2026-11-02 07:49:14"] },
    { page: 2, lines: ["5. Quality IEC Constancy Homogeneity / Water NOT OK................7"] },
  ], "filing-check.pdf", 98);
  act(() => result.current.addReport(report));
  act(() => { void result.current.file(report.id, "Monthly"); });
  expect(result.current.reports.find(r => r.id === report.id)).toMatchObject({ type: "Monthly", needsReview: false, printedStatus: "NOT OK" });
  expect(result.current.pending.some(r => r.id === report.id)).toBe(false);
  act(() => {
    expect(addReport(report)).toMatchObject({ type: "Monthly", needsReview: false, printedStatus: "NOT OK" });
  });
  act(() => { result.current.undo(); });
  expect(result.current.reports.find(r => r.id === report.id)).toMatchObject({ type: "Other", needsReview: true, printedStatus: "NOT OK" });
  expect(result.current.pending.some(r => r.id === report.id)).toBe(true);
});

it("starts with an empty library and preserves real filings from older backups", () => {
  const { result } = renderHook(() => useQa(), { wrapper });
  expect(result.current.reports).toEqual([]);

  const report = parseSiemensPages([
    { page: 1, lines: ["Product Name SOMATOM Drive", "2026-11-02 07:49:14"] },
  ], "backup-check.pdf", 98);
  act(() => result.current.restoreFilings({ r42: "Daily", [report.id]: "Monthly" }));
  act(() => { result.current.addReport(report); });
  expect(result.current.reports).toHaveLength(1);
  expect(result.current.reports[0]).toMatchObject({ id: report.id, type: "Monthly" });
  expect(result.current.overrides).toEqual({ [report.id]: "Monthly" });
  act(() => result.current.restoreFilings({}));
});

it("uses the current local day and saved QA schedule in live mode", () => {
  vi.setSystemTime(new Date(2027, 0, 31, 23, 30));
  try {
    const { result } = renderHook(() => useQa(), { wrapper });
    expect(result.current.today).toBe("2027-01-31");
    act(() => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT, dueDay: 17, days: "weekdays" }));
      window.dispatchEvent(new Event("ctqa:settings"));
    });
    expect(result.current.schedule).toMatchObject({ dueDay: 17, days: "weekdays" });
  } finally {
    localStorage.removeItem(SETTINGS_KEY);
    vi.useRealTimers();
  }
});

it("keeps failed imports in their own inbox and suppresses repeats after review", async () => {
  const { result } = renderHook(() => useQa(), { wrapper });
  const failure = {
    id: "example", fileName: "unrecognized.pdf", at: "2026-11-23T12:00:00Z",
    code: "scanner-unrecognized" as const, archived: false,
  };
  act(() => {
    result.current.addFailedImport(failure);
    result.current.addFailedImport(failure);
  });
  expect(result.current.failedImports).toEqual([failure]);
  expect(result.current.reports).toEqual([]);
  await act(async () => result.current.markFailedImportReviewed(failure));
  act(() => result.current.addFailedImport(failure));
  expect(result.current.failedImports).toEqual([]);
});

it("only files confirmed matching reports and undoes the group without losing flags", async () => {
  const { result } = renderHook(() => useQa(), { wrapper });
  const report = {
    ...parseSiemensPages([
      { page: 1, lines: ["Product Name SOMATOM Drive", "Software Version syngo CT VB30A", "2026-11-02 07:49:14"] },
      { page: 2, lines: ["1. Quality IEC Constancy Noise OK........3"] },
      { page: 3, lines: ["1. Quality IEC Constancy Noise", "Voltage 120 kV", "Results for System A", "Slice 1 3.8 HU", "Tolerance 2.5 ... 4.4 HU"] },
    ], "batch-a.pdf", 20), originalUrl: "blob:batch",
  };
  const copy = { ...report, id: "batch-copy", fileName: "batch-b.pdf" };
  const otherScanner = { ...report, id: "batch-edge", scanner: "edge" as const };
  const failed = { ...report, id: "batch-not-ok", printedStatus: "NOT OK" as const };
  const incomplete = { ...report, id: "batch-partial", extractionIncomplete: true };
  const changedLayout = { ...report, id: "batch-layout", pages: 4 };
  const outOfLimit = {
    ...report, id: "batch-limits", measurements: report.measurements.map((m) => ({ ...m, value: m.upper + 1 })),
  };

  act(() => {
    for (const item of [report, copy, otherScanner, failed, incomplete, changedLayout, outOfLimit]) {
      result.current.addReport(item);
    }
  });
  expect(matchingReviewReports(report, result.current.pending).map(({ id }) => id).sort()).toEqual([report.id, copy.id].sort());
  const key = reviewMatchKey(report);
  expect(key).toBeTruthy();
  await act(async () => {
    await expect(result.current.fileMatching([report.id, copy.id, failed.id], key!, "Daily")).resolves.toEqual({ filed: 0, stopped: true });
    await expect(result.current.fileMatching([report.id, copy.id], key!, "Daily")).resolves.toMatchObject({ filed: 2, stopped: false, batchId: expect.any(Number) });
  });
  expect(result.current.pending.map(({ id }) => id)).toEqual(expect.arrayContaining([failed.id, incomplete.id, otherScanner.id, changedLayout.id, outOfLimit.id]));
  expect(result.current.reports.find(({ id }) => id === failed.id)?.printedStatus).toBe("NOT OK");
  await act(async () => { await result.current.undo(); });
  expect(result.current.pending).toHaveLength(7);
  expect(result.current.overrides).toEqual({});
});
