import { expect, it } from "vitest";
import type { Measurement, Report } from "./qa-data";
import { monthlyChecklistRows, monthlyCoverage } from "./qa-monthly-status";
import { calendarDayResults, reportAlert, strongestReportAlert } from "./qa-report-status";

const sample: Report = {
  id: "test-clean", date: "2026-07-05", time: "08:00:00", fileName: "example.pdf",
  scanner: "flash", type: "Monthly", suggested: "Monthly", confidence: "likely", pages: 3,
  sizeKb: 16, measurements: [], needsReview: false, printedStatus: "OK",
};
const mtf: Measurement = { metric: "mtf50", unit: "lp/cm", value: 10, lower: 9, upper: 12, baseline: 10, context: "Body mode", page: 2 };
const daily: Report = { ...sample, id: "daily-ok", type: "Daily", suggested: "Daily" };

it.each(["Monthly", "Other"] as const)("shows a passing Daily separately from a failed %s report", (type) => {
  const flagged: Report = { ...sample, type, time: "09:00:00", printedStatus: "NOT OK" };
  expect(calendarDayResults([flagged, daily])).toMatchObject({
    latestDaily: { report: daily, result: { tone: "ok", label: "Printed OK" } },
    otherAlert: { report: flagged, alert: "not-ok" },
  });
  expect(calendarDayResults([flagged])).toEqual({ latestDaily: undefined, otherAlert: { report: flagged, alert: "not-ok" } });
});

it("shows the latest Daily run and keeps a failed earlier run visible", () => {
  const earlier: Report = { ...daily, id: "daily-failed", time: "07:45", printedStatus: "NOT OK" };
  expect(calendarDayResults([earlier, daily])).toMatchObject({
    latestDaily: { report: daily, result: { tone: "ok" } },
    otherAlert: { report: earlier, alert: "not-ok" },
  });
  const later = { ...earlier, time: "08:15:00" };
  expect(calendarDayResults([daily, later])).toMatchObject({
    latestDaily: { report: later, result: { tone: "bad", label: "Printed NOT OK" } },
    otherAlert: undefined,
  });
});

it("keeps the Daily date flagged when reports share a timestamp and disagree", () => {
  const outsideLimit: Report = { ...daily, id: "daily-outside", time: "08:00", measurements: [{ ...mtf, value: 13 }] };
  for (const reports of [[daily, outsideLimit], [outsideLimit, daily]]) {
    expect(calendarDayResults(reports).latestDaily).toMatchObject({
      report: outsideLimit, result: { tone: "bad", label: "Outside printed limits" },
    });
  }
});

it("keeps aborted or unreadable latest Daily runs from showing a pass", () => {
  const retest = { ...daily, id: "daily-retest", time: "08:00:01" };
  const aborted = { ...retest, printedStatus: "Aborted" as const };
  const unavailable = { ...retest, printedStatus: "Not available" as const };
  expect(calendarDayResults([daily, aborted]).latestDaily?.result).toMatchObject({ label: "Aborted", tone: "warn" });
  expect(calendarDayResults([daily, unavailable]).latestDaily?.result).toMatchObject({ label: "Result unavailable", tone: "warn" });
});

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

it("retains a printed Monthly failure when its test name has extra white space", () => {
  const report: Report = { ...sample, measurements: [{ ...mtf, metric: "slice" }], printedSections: [{ label: "  Slice\u00a0 thickness  ", status: "NOT OK", page: 2 }] };
  const coverage = monthlyCoverage([report], "flash", "2026-07");
  expect(coverage.items.find(({ metric }) => metric === "slice")?.current?.status).toBe("not-ok");
  expect(coverage.exceptions).toBe(1);
});

it("keeps an out-of-limit reference reading in the history of a passing Monthly retest from the same PDF", () => {
  const report: Report = { ...sample, measurements: [{ ...mtf, page: 3, value: 13, referenceTest: true }, { ...mtf, referenceTest: false }], printedSections: [
    { label: "Reference MTF", status: "OK", page: 3 },
    { label: "MTF", status: "OK", page: 2 },
  ] };
  const coverage = monthlyCoverage([report], "flash", "2026-07");
  expect(coverage.items.find(({ metric }) => metric === "mtf50")).toMatchObject({
    current: { report, status: "ok", page: 2, reference: false, outside: 0 },
    history: [{ report, status: "out-of-limit", page: 3, reference: true, outside: 1 }],
  });
  expect(coverage).toMatchObject({ done: 1, passed: 1, exceptions: 0, flagged: 1 });
});

it("flags an older out-of-limit reading that cannot be assigned to the routine or reference test", () => {
  const report: Report = { ...sample, measurements: [{ ...mtf, value: 13 }], printedSections: [
    { label: "Reference MTF", status: "OK", page: 2 },
    { label: "MTF", status: "OK", page: 2 },
  ] };
  const coverage = monthlyCoverage([report], "flash", "2026-07");
  expect(coverage.items.find(({ metric }) => metric === "mtf50")).toMatchObject({
    current: { status: "unassigned", reference: false },
    history: [{ status: "ok", reference: true }],
  });
  expect(coverage).toMatchObject({ passed: 0, exceptions: 1, flagged: 1 });
});

it("retains the warning when two results share a timestamp", () => {
  const good: Report = { ...sample, printedSections: [{ label: "MTF", status: "OK", page: 2 }] };
  const bad: Report = { ...good, id: "test-tie", time: "08:00", printedSections: [{ label: "MTF", status: "NOT OK", page: 3 }] };
  const row = monthlyChecklistRows([good, bad]).find(({ metric }) => metric === "mtf50");
  expect(row?.current).toMatchObject({ status: "not-ok", report: bad });
});
