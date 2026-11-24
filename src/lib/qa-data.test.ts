import { describe, expect, it } from "vitest";
import { driftRatio, isOutOfLimit, MONTHLY_CHECKLIST, type Measurement, type MetricId, type Report } from "./qa-data";
import { monthlyCoverage } from "./qa-monthly-status";

describe("measurement limits", () => {
  it("flags a water value of 4.5 HU outside the ±4 HU band", () => {
    expect(isOutOfLimit({ value: 4.5, lower: -4, upper: 4 })).toBe(true);
  });
  it("keeps a value exactly on the limit in tolerance", () => {
    expect(isOutOfLimit({ value: 4, lower: -4, upper: 4 })).toBe(false);
  });
  it("reports drift of 3 HU on a ±4 band as 75% of tolerance", () => {
    expect(driftRatio({ value: 3, lower: -4, upper: 4, baseline: 0 })).toBe(0.75);
  });
});

const meas = (metric: MetricId): Measurement =>
  ({ metric, context: "120 kV", value: 0, unit: "mm", lower: -2, upper: 2, baseline: 0, page: 1 });

const monthlyReport = (scanner: Report["scanner"], date: string, metrics: MetricId[]): Report => ({
  id: `${scanner}-${date}`,
  scanner,
  date,
  time: "07:40",
  fileName: `Quality_Constancy_${date.replaceAll("-", "")}.pdf`,
  sizeKb: 90,
  type: "Monthly",
  suggested: "Monthly",
  confidence: "certain",
  needsReview: false,
  pages: 8,
  measurements: metrics.map(meas),
});

const ALL_MONTHLY: MetricId[] = MONTHLY_CHECKLIST.map((c) => c.metric);

describe("monthly coverage", () => {
  it("counts all 8 checklist tests when a filed Monthly report contains them", () => {
    const c = monthlyCoverage([monthlyReport("flash", "2026-11-03", ALL_MONTHLY)], "flash", "2026-11");
    expect(c.done).toBe(8);
    expect(c.missing).toHaveLength(0);
    expect(c.last).toBe("2026-11-03");
  });

  it("lists the checklist tests a Monthly report did not measure", () => {
    const c = monthlyCoverage(
      [monthlyReport("drive", "2026-11-04", ALL_MONTHLY.filter((m) => m !== "mtf50" && m !== "contrast"))],
      "drive",
      "2026-11",
    );
    expect(c.done).toBe(6);
    expect(c.missing.map((x) => x.label)).toEqual(["MTF (spatial resolution)", "Contrast scale"]);
  });

  it("ignores Daily reports, other scanners and other months", () => {
    const daily: Report = { ...monthlyReport("flash", "2026-11-03", ALL_MONTHLY), type: "Daily", suggested: "Daily" };
    const c = monthlyCoverage(
      [daily, monthlyReport("edge", "2026-11-03", ALL_MONTHLY), monthlyReport("flash", "2026-10-02", ALL_MONTHLY)],
      "flash",
      "2026-11",
    );
    expect(c.done).toBe(0);
    expect(c.count).toBe(0);
    expect(c.last).toBeNull();
  });

  it("counts readings outside their printed limits", () => {
    const r = monthlyReport("edge", "2026-11-03", ALL_MONTHLY);
    r.measurements = r.measurements.map((m) => (m.metric === "lightmarker" ? { ...m, value: 3, lower: -2, upper: 2 } : m));
    const c = monthlyCoverage([r], "edge", "2026-11");
    expect(c.flagged).toBe(1);
  });
});
