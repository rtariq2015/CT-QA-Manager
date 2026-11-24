import { expect, it } from "vitest";
import type { Measurement, Report } from "./qa-data";
import { monthlyChecklistRows, monthlyCoverage } from "./qa-monthly-status";
import { reportAlert, strongestReportAlert } from "./qa-report-status";

const sample: Report = {
  id: "test-clean", date: "2026-07-05", time: "08:00:00", fileName: "example.pdf",
  scanner: "flash", type: "Monthly", suggested: "Monthly", confidence: "likely", pages: 3,
  sizeKb: 16, measurements: [], needsReview: false, printedStatus: "OK",
};
const mtf: Measurement = { metric: "mtf50", unit: "lp/cm", value: 10, lower: 9, upper: 12, baseline: 10, context: "Body mode", page: 2 };

it("retains a same-day exception after acknowledgement and a later printed OK", () => {
  const aborted: Report = { ...sample, id: "test-aborted", time: "07:00:00", printedStatus: "Aborted", needsReview: false };
  const failed: Report = { ...sample, id: "test-failed", time: "06:00:00", printedStatus: "NOT OK", needsReview: false };
  expect(reportAlert(aborted)).toBe("aborted");
  expect(strongestReportAlert([sample, aborted])).toEqual({ report: aborted, alert: "aborted" });
  expect(strongestReportAlert([sample, aborted, failed])).toEqual({ report: failed, alert: "not-ok" });
});

it("links a Monthly test to an earlier flagged PDF after a clean retest", () => {
  const clean = { ...sample, measurements: [mtf] };
  const flagged: Report = {
    ...clean, id: "test-earlier", date: "2026-07-02", printedStatus: "NOT OK",
    measurements: [{ ...mtf, value: 13, page: 3 }], printedSections: [{ label: "MTF", status: "NOT OK", page: 3 }],
  };
  const result = monthlyChecklistRows([clean, flagged]).find((row) => row.metric === "mtf50");
  expect(result).toMatchObject({ latest: { report: clean, page: 2 }, issue: { report: flagged, alert: "not-ok", page: 3 }, flagged: 1 });
});

it("does not apply another printed test's failure to an in-limit measurement", () => {
  const unrelatedFailure: Report = {
    ...sample, printedStatus: "NOT OK", measurements: [mtf], printedSections: [{ label: "Lightmarker", status: "NOT OK", page: 1 }],
  };
  const checked = monthlyChecklistRows([unrelatedFailure]);
  expect(checked.find((row) => row.metric === "mtf50")?.issue).toBeUndefined();
  expect(checked.find((row) => row.metric === "lightmarker")?.issue).toMatchObject({ alert: "not-ok", page: 1 });
});

it("counts named printed results without numeric readings and links to their pages", () => {
  const printed: Report = { ...sample, printedSections: [
    { label: "Slice", status: "OK", page: 2 },
    { label: "Sag./Cor. Lightm.", status: "NOT OK", page: 3 },
    { label: "Low Contrast", status: "OK", page: 1 },
  ] };
  const coverage = monthlyCoverage([printed], "flash", "2026-07");
  expect(coverage.done).toBe(2);
  expect(coverage.exceptions).toBe(1);
  expect(coverage.items.find(({ metric }) => metric === "slice")?.latest).toEqual({ report: printed, page: 2, source: "printed-ok" });
  expect(coverage.items.find(({ metric }) => metric === "sagcor")?.issue).toEqual({ report: printed, page: 3, alert: "not-ok" });
  expect(coverage.missing.map(({ metric }) => metric)).toContain("contrast");
});

it("keeps aborted and unreadable outcomes visible without counting them as results", () => {
  const partial: Report = { ...sample, printedStatus: "Aborted", measurements: [mtf], printedSections: [
    { label: "MTF", status: "Aborted", page: 2 },
    { label: "Table Positioning", status: "Not available", page: 3 },
  ] };
  const coverage = monthlyCoverage([partial], "flash", "2026-07");
  expect(coverage.done).toBe(0);
  expect(coverage.missing).toHaveLength(6);
  expect(coverage.items.find(({ metric }) => metric === "mtf50")).toMatchObject({ issue: { alert: "aborted", page: 2 } });
  expect(coverage.items.find(({ metric }) => metric === "table")).toMatchObject({ unavailable: { page: 3 } });
});

it("does not turn a report-level OK into a test-level checkmark", () => {
  const report = { ...sample, measurements: [{ ...mtf, metric: "mtf10" as const }] };
  const coverage = monthlyCoverage([report], "flash", "2026-07");
  expect(coverage.done).toBe(1);
  expect(coverage.items.find(({ metric }) => metric === "mtf50")?.latest?.source).toBe("readings");
});
