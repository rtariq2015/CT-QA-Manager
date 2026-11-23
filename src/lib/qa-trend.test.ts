import { describe, expect, it } from "vitest";
import { monthlyWaiting, trendWarnings, type Report } from "./qa-data";

const m = (value: number) => ({ metric: "noise" as const, context: "120 kV", value, unit: "HU", lower: 0, upper: 10, baseline: 5, page: 1 });
const rep = (date: string, value: number, extra: Partial<Report> = {}) => ({ id: date, scanner: "flash", date, time: "07:00", type: "Daily", measurements: [m(value)], ...extra }) as unknown as Report;

describe("trendWarnings", () => {
  it("warns when a reading rises 3 reports in a row toward its limit", () => {
    const w = trendWarnings([rep("2026-11-01", 5), rep("2026-11-02", 6), rep("2026-11-03", 7), rep("2026-11-04", 8)], "flash");
    expect(w).toHaveLength(1);
    expect(w[0]?.direction).toBe("rising");
  });
  it("does not warn after only 2 rises", () => {
    expect(trendWarnings([rep("2026-11-01", 7), rep("2026-11-02", 5), rep("2026-11-03", 6), rep("2026-11-04", 8)], "flash")).toHaveLength(0);
  });
  it("does not warn when rising back toward the middle", () => {
    expect(trendWarnings([rep("2026-11-01", 1), rep("2026-11-02", 2), rep("2026-11-03", 3), rep("2026-11-04", 4)], "flash")).toHaveLength(0);
  });
});

describe("monthlyWaiting", () => {
  const slice = (extra: Partial<Report>) => ({ id: String(Math.random()), scanner: "flash", date: "2026-11-05", time: "08:00", measurements: [{ ...m(1), metric: "slice" }], ...extra }) as unknown as Report;
  it("lists tests found only in Monthly reports still in Review", () => {
    expect(monthlyWaiting([slice({ type: "Other", needsReview: true, suggested: "Monthly" })], "flash", "2026-11")).toEqual(["Slice thickness"]);
  });
  it("ignores tests already filed", () => {
    expect(monthlyWaiting([slice({ type: "Monthly" }), slice({ type: "Other", needsReview: true, suggested: "Monthly" })], "flash", "2026-11")).toEqual([]);
  });
});
