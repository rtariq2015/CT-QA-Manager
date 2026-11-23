import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { type ReactNode } from "react";
import { QaProvider, useQa } from "./qa-store";
import { parseSiemensPages } from "./qa-parser";
import { TODAY } from "./qa-data";
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

it("keeps demo records and demo filings out of the live QA catalog and backup", () => {
  const { result } = renderHook(() => useQa(), { wrapper });
  expect(result.current.reports).toEqual([]);

  act(() => result.current.setMode("demo"));
  const sample = result.current.reports[0]!;
  expect(sample.source).toBe("demo");
  expect(result.current.reports.every((report) => report.source === "demo")).toBe(true);
  act(() => { void result.current.file(sample.id, "Monthly"); });
  expect(result.current.reports.find((report) => report.id === sample.id)?.type).toBe("Monthly");
  expect(result.current.overrides).not.toHaveProperty(sample.id);

  const imported = { ...sample, id: "local-example", source: "uploaded" as const };
  act(() => result.current.addReport(imported));
  expect(result.current.mode).toBe("live");
  expect(result.current.reports.map((report) => report.id)).toEqual([imported.id]);
  expect(result.current.lastFiling).toBeUndefined();
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
    act(() => result.current.setMode("demo"));
    expect(result.current.today).toBe(TODAY);
    expect(result.current.schedule).toMatchObject({ dueDay: DEFAULT.dueDay, days: DEFAULT.days });
  } finally {
    localStorage.removeItem(SETTINGS_KEY);
    vi.useRealTimers();
  }
});
