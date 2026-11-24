import { isOutOfLimit, MONTHLY_CHECKLIST, type Measurement, type MetricId, type Report, type ScannerId } from "./qa-data";
import type { PrintedSection } from "./qa-parser";
import { isReferenceTest, normalizeTestLabel } from "./qa-parser-validation";
import { QA_ALERTS } from "./qa-report-status";

const monthlyTestNames: Partial<Record<MetricId, RegExp>> = {
  lightmarker: /^light\s*marker$/i,
  sagcor: /^sag.*light\s*m/i,
  topogram: /^topogram\b/i,
  slice: /^slice(?: thickness)?$/i,
  mtf50: /^mtf\b/i,
  table: /^table position/i,
  externalmarker: /^external light\s*m/i,
  contrast: /^contrast(?: scale)?$/i,
};

export const MONTHLY_RESULTS = {
  "not-ok": QA_ALERTS["not-ok"],
  "out-of-limit": QA_ALERTS["out-of-limit"],
  aborted: QA_ALERTS.aborted,
  unassigned: { label: "Reading needs review", tone: "warn", rank: 1 },
  unavailable: { label: "Result unavailable", tone: "warn", rank: 1 },
  readings: { label: "Readings only", tone: "muted", rank: 0 },
  ok: { label: "Printed OK", tone: "ok", rank: -1 },
} as const;

type ResultStatus = keyof typeof MONTHLY_RESULTS;
type MonthlyRun = { report: Report; page: number; status: ResultStatus; reference: boolean; recorded: boolean; outside: number };

const reportTime = ({ date, time }: Report) => `${date} ${time.padEnd(8, ":00")}`;

export function monthlyResultAlert(status: ResultStatus) {
  return status === "not-ok" || status === "out-of-limit" || status === "aborted" || status === "unassigned";
}

function metricReadings(report: Report, metric: MetricId) {
  return report.measurements.filter((reading) => reading.metric === metric || (metric === "mtf50" && reading.metric === "mtf10"));
}

function testSections(report: Report, metric: MetricId) {
  return report.printedSections?.filter(({ label }) => monthlyTestNames[metric]?.test(normalizeTestLabel(label).replace(/^Reference /i, ""))) ?? [];
}

export function hasUnassignedMonthlyReadings(report: Report) {
  return report.type === "Monthly" && MONTHLY_CHECKLIST.some(({ metric }) => {
    const sections = testSections(report, metric);
    return sections.some(({ label }) => isReferenceTest(label)) && sections.some(({ label }) => !isReferenceTest(label)) &&
      metricReadings(report, metric).some(({ referenceTest }) => referenceTest === undefined);
  });
}

function testRun(report: Report, sections: PrintedSection[], measurements: Measurement[], reference: boolean, unassigned?: Measurement): MonthlyRun | undefined {
  const failed = sections.find(({ status }) => status === "NOT OK");
  const aborted = sections.find(({ status }) => status === "Aborted");
  const passed = sections.find(({ status }) => status === "OK");
  const outside = measurements.filter(isOutOfLimit);
  const reading = !aborted && report.printedStatus !== "Aborted" ? measurements[0] : undefined;
  const unreadable = sections.find(({ status }) => status === "Not available");
  // Agreement with the printed limits matters even when this test's summary prints OK.
  const evidence = failed ?? aborted ?? outside[0] ?? unassigned ?? passed ?? reading ?? unreadable;
  if (!evidence) return undefined;
  const status = failed ? "not-ok" : aborted ? "aborted" : outside.length ? "out-of-limit" : unassigned ? "unassigned" : passed ? "ok" : reading ? "readings" : "unavailable";
  return { report, page: evidence.page, status, reference, recorded: Boolean(failed || passed || reading), outside: outside.length };
}

function testRuns(report: Report, metric: MetricId) {
  const measurements = metricReadings(report, metric);
  const sections = testSections(report, metric);
  const routineSections = sections.filter(({ label }) => !isReferenceTest(label));
  const referenceSections = sections.filter(({ label }) => isReferenceTest(label));
  const referenceOnlyReport = Boolean(report.printedSections?.length && report.printedSections.every(({ label }) => isReferenceTest(label)));
  const hasReference = Boolean(referenceSections.length || measurements.some(({ referenceTest }) => referenceTest === true) || referenceOnlyReport);
  const hasRoutine = Boolean(routineSections.length || measurements.some(({ referenceTest }) => referenceTest === false));
  const routineReadings: Measurement[] = [];
  const referenceReadings: Measurement[] = [];
  let unassigned: Measurement | undefined;
  for (const measurement of measurements) {
    // Older readings can be assigned only when the report identifies a single kind of run for this test.
    const reference = measurement.referenceTest ?? (hasReference && hasRoutine ? undefined : hasReference);
    if (reference === true) referenceReadings.push(measurement);
    else if (reference === false) routineReadings.push(measurement);
    else if (!unassigned && isOutOfLimit(measurement)) unassigned = measurement;
  }
  return [testRun(report, routineSections, routineReadings, false, unassigned), testRun(report, referenceSections, referenceReadings, true)]
    .filter((run): run is MonthlyRun => run !== undefined);
}

export function monthlyChecklistRows(reports: Report[]) {
  return MONTHLY_CHECKLIST.map(({ metric, label }) => {
    const runs = reports.flatMap((report) => testRuns(report, metric)).sort((a, b) => reportTime(b.report).localeCompare(reportTime(a.report)) ||
      MONTHLY_RESULTS[b.status].rank - MONTHLY_RESULTS[a.status].rank);
    // Establishing a reference is separate evidence from a routine constancy retest.
    const current = runs.find(({ reference }) => !reference) ?? runs[0];
    return { metric, label, current, history: runs.filter((run) => run !== current), recorded: runs.some((run) => run.recorded) };
  });
}

/** Use the same evidence for Today, the checklist and the printable summary. */
export function monthlyCoverage(reports: Report[], scanner: ScannerId, month: string) {
  const filed = reports.filter((report) => report.scanner === scanner && report.date.startsWith(month) && report.type === "Monthly");
  const items = monthlyChecklistRows(filed);
  const done = items.filter(({ recorded }) => recorded).length;
  const passed = items.filter(({ current }) => current?.status === "ok" && !current.reference).length;
  const missing = items.filter(({ current }) => !current);
  const exceptions = items.filter(({ current }) => current && monthlyResultAlert(current.status)).length;
  const flagged = filed.reduce((n, report) => n + report.measurements.filter(isOutOfLimit).length, 0);
  const last = filed.reduce<string | null>((date, report) => date && date > report.date ? date : report.date, null);
  return { filed, items, done, passed, missing, exceptions, flagged, last, count: filed.length };
}

/** Tests that have evidence in unfiled Monthly candidates for this scanner and month. */
export function monthlyWaiting(reports: Report[], scanner: ScannerId, month: string) {
  const filed = monthlyCoverage(reports, scanner, month);
  const waiting = reports.filter((report) => report.scanner === scanner && report.date.startsWith(month) &&
    report.type !== "Monthly" && report.needsReview && report.suggested === "Monthly");
  const missing = new Set(filed.missing.map(({ metric }) => metric));
  return monthlyChecklistRows(waiting).filter(({ metric, current }) =>
    missing.has(metric) && current).map(({ label }) => label);
}
