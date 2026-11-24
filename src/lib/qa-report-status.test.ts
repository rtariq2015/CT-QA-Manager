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

it("shows the passing Monthly retest and preserves the earlier flagged PDF", () => {
  const clean: Report = { ...sample, measurements: [mtf], printedSections: [{ label: "MTF", status: "OK", page: 2 }] };
  const flagged: Report = {
    ...clean, id: "test-earlier", date: "2026-07-02", printedStatus: "NOT OK",
    measurements: [{ ...mtf, value: 13, page: 3 }], printedSections: [{ label: "MTF", status: "NOT OK", page: 3 }],
  };
  const coverage = monthlyCoverage([flagged, clean], "flash", "2026-07");
  const result = coverage.items.find((row) => row.metric === "mtf50");
  expect(result).toMatchObject({ current: { report: clean, page: 2, status: "ok" }, history: [{ report: flagged, status: "not-ok", page: 3, outside: 1 }] });
  expect(coverage).toMatchObject({ done: 1, passed: 1, exceptions: 0 });
});

it("does not apply another printed test's failure to an in-limit measurement", () => {
  const unrelatedFailure: Report = {
    ...sample, printedStatus: "NOT OK", measurements: [mtf], printedSections: [{ label: "Lightmarker", status: "NOT OK", page: 1 }],
  };
  const checked = monthlyChecklistRows([unrelatedFailure]);
  expect(checked.find((row) => row.metric === "mtf50")?.current?.status).toBe("readings");
  expect(checked.find((row) => row.metric === "lightmarker")?.current).toMatchObject({ status: "not-ok", page: 1 });
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
  expect(coverage.items.find(({ metric }) => metric === "slice")?.current).toMatchObject({ report: printed, page: 2, status: "ok" });
  expect(coverage.items.find(({ metric }) => metric === "sagcor")?.current).toMatchObject({ report: printed, page: 3, status: "not-ok" });
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
  expect(coverage.items.find(({ metric }) => metric === "mtf50")).toMatchObject({ current: { status: "aborted", page: 2 } });
  expect(coverage.items.find(({ metric }) => metric === "table")).toMatchObject({ current: { status: "unavailable", page: 3 } });
});

it("does not turn a report-level OK into a test-level checkmark", () => {
  const report = { ...sample, measurements: [{ ...mtf, metric: "mtf10" as const }] };
  const coverage = monthlyCoverage([report], "flash", "2026-07");
  expect(coverage.done).toBe(1);
  expect(coverage.items.find(({ metric }) => metric === "mtf50")?.current?.status).toBe("readings");
});

it("flags an out-of-limit retest even when the same summary prints OK", () => {
  const mismatch: Report = { ...sample, measurements: [{ ...mtf, value: 13, page: 3 }], printedSections: [{ label: "MTF", status: "OK", page: 2 }] };
  const coverage = monthlyCoverage([mismatch], "flash", "2026-07");
  expect(coverage).toMatchObject({ passed: 0, done: 1, exceptions: 1 });
  expect(coverage.items.find(({ metric }) => metric === "mtf50")?.current).toMatchObject({ status: "out-of-limit", page: 3 });
});

it("shows the later abort, retaining the prior result in test history", () => {
  const clean: Report = { ...sample, printedSections: [{ label: "MTF", status: "OK", page: 2 }] };
  const aborted: Report = { ...clean, id: "test-abort-retest", time: "09:00:00", printedStatus: "Aborted", printedSections: [{ label: "MTF", status: "Aborted", page: 1 }] };
  const coverage = monthlyCoverage([clean, aborted], "flash", "2026-07");
  expect(coverage).toMatchObject({ passed: 0, done: 1, exceptions: 1 });
  expect(coverage.items.find(({ metric }) => metric === "mtf50")).toMatchObject({ current: { status: "aborted" }, history: [{ status: "ok" }] });
});

it("keeps reference results separate from the latest routine result", () => {
  const routine: Report = { ...sample, printedStatus: "NOT OK", printedSections: [{ label: "MTF", status: "NOT OK", page: 2 }] };
  const reference: Report = { ...sample, id: "test-reference", date: "2026-07-08", printedSections: [{ label: "Reference MTF", status: "OK", page: 3 }] };
  const coverage = monthlyCoverage([reference, routine], "flash", "2026-07");
  expect(coverage).toMatchObject({ passed: 0, done: 1, exceptions: 1 });
  expect(coverage.items.find(({ metric }) => metric === "mtf50")).toMatchObject({ current: { report: routine, status: "not-ok" }, history: [{ report: reference, status: "ok", reference: true }] });
});

it("retains the warning when two results share a timestamp", () => {
  const good: Report = { ...sample, printedSections: [{ label: "MTF", status: "OK", page: 2 }] };
  const bad: Report = { ...good, id: "test-tie", time: "08:00", printedSections: [{ label: "MTF", status: "NOT OK", page: 3 }] };
  const row = monthlyChecklistRows([good, bad]).find(({ metric }) => metric === "mtf50");
  expect(row?.current).toMatchObject({ status: "not-ok", report: bad });
});
