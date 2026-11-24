import { isOutOfLimit, MONTHLY_CHECKLIST, type MetricId, type Report, type ScannerId } from "./qa-data";
import { QA_ALERTS, type QaAlert } from "./qa-report-status";

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

type TestEvidence = { report: Report; page: number };
type TestResult = TestEvidence & { source: "printed-ok" | "printed-not-ok" | "readings" };
type TestIssue = TestEvidence & { alert: QaAlert };

const newer = (first: Report, second: Report) => `${first.date} ${first.time}` > `${second.date} ${second.time}`;

export function monthlyChecklistRows(reports: Report[]) {
  return MONTHLY_CHECKLIST.map(({ metric, label }) => {
    let latest: TestResult | undefined;
    let issue: TestIssue | undefined;
    let unavailable: TestEvidence | undefined;
    let flagged = 0;
    for (const report of reports) {
      const measurements = report.measurements.filter((reading) => reading.metric === metric || (metric === "mtf50" && reading.metric === "mtf10"));
      const sections = report.printedSections?.filter((section) => monthlyTestNames[metric]?.test(section.label.trim().replace(/^Reference\s+/i, "")));
      const fails = sections?.find((section) => section.status === "NOT OK");
      const passes = sections?.find((section) => section.status === "OK");
      const aborted = sections?.find((section) => section.status === "Aborted");
      const unreadable = sections?.find((section) => section.status === "Not available");
      const outside = measurements.filter(isOutOfLimit);
      flagged += outside.length;
      // Printed outcomes can document a test even when the numeric table is unsupported.
      const result = fails ?? passes;
      const reading = measurements[0];
      if (!latest || newer(report, latest.report)) {
        if (result) latest = { report, page: result.page, source: fails ? "printed-not-ok" : "printed-ok" };
        else if (reading && !aborted && report.printedStatus !== "Aborted") latest = { report, page: reading.page, source: "readings" };
      }
      if (unreadable && (!unavailable || newer(report, unavailable.report))) unavailable = { report, page: unreadable.page };
      const alert = fails ? "not-ok" : aborted ? "aborted" : outside.length ? "out-of-limit" : undefined;
      const page = fails?.page ?? aborted?.page ?? outside[0]?.page;
      if (alert && page !== undefined && (!issue || QA_ALERTS[alert].rank > QA_ALERTS[issue.alert].rank ||
        (alert === issue.alert && newer(report, issue.report)))) issue = { report, alert, page };
    }
    return { metric, label, latest, issue, unavailable, flagged };
  });
}

/** Use the same evidence for Today, the checklist and the printable summary. */
export function monthlyCoverage(reports: Report[], scanner: ScannerId, month: string) {
  const filed = reports.filter((report) => report.scanner === scanner && report.date.startsWith(month) && report.type === "Monthly");
  const items = monthlyChecklistRows(filed);
  const done = items.filter(({ latest }) => latest).length;
  const missing = items.filter(({ latest, issue, unavailable }) => !latest && !issue && !unavailable);
  const exceptions = items.filter(({ issue }) => issue).length;
  const flagged = filed.reduce((n, report) => n + report.measurements.filter(isOutOfLimit).length, 0);
  const last = filed.reduce<string | null>((date, report) => date && date > report.date ? date : report.date, null);
  return { filed, items, done, missing, exceptions, flagged, last, count: filed.length };
}

/** Tests that have evidence in unfiled Monthly candidates for this scanner and month. */
export function monthlyWaiting(reports: Report[], scanner: ScannerId, month: string) {
  const filed = monthlyCoverage(reports, scanner, month);
  const waiting = reports.filter((report) => report.scanner === scanner && report.date.startsWith(month) &&
    report.type !== "Monthly" && report.needsReview && report.suggested === "Monthly");
  const missing = new Set(filed.missing.map(({ metric }) => metric));
  return monthlyChecklistRows(waiting).filter(({ metric, latest, issue, unavailable }) =>
    missing.has(metric) && (latest || issue || unavailable)).map(({ label }) => label);
}
