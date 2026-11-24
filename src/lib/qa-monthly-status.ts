import { isOutOfLimit, MONTHLY_CHECKLIST, type MetricId, type Report } from "./qa-data";
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

export function monthlyChecklistRows(reports: Report[]) {
  return MONTHLY_CHECKLIST.map(({ metric, label }) => {
    let latest: { report: Report; page: number } | undefined;
    let issue: { report: Report; alert: QaAlert; page: number } | undefined;
    let flagged = 0;
    for (const report of reports) {
      const measurements = report.measurements.filter((reading) => reading.metric === metric || (metric === "mtf50" && reading.metric === "mtf10"));
      const sections = report.printedSections?.filter((section) => monthlyTestNames[metric]?.test(section.label.trim().replace(/^Reference\s+/i, "")));
      const fails = sections?.find((section) => section.status === "NOT OK");
      const aborted = sections?.find((section) => section.status === "Aborted");
      const outside = measurements.filter(isOutOfLimit);
      flagged += outside.length;
      const first = measurements.find((reading) => reading.metric === metric);
      if (first) latest ??= { report, page: first.page };
      const alert = fails ? "not-ok" : outside.length ? "out-of-limit" : aborted ? "aborted" : undefined;
      const page = fails?.page ?? outside[0]?.page ?? aborted?.page;
      if (alert && page !== undefined && (!issue || QA_ALERTS[alert].rank > QA_ALERTS[issue.alert].rank)) issue = { report, alert, page };
    }
    return { metric, label, latest, issue, flagged };
  });
}
