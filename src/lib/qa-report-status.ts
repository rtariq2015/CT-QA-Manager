import { isOutOfLimit, type Report } from "./qa-data";

export const QA_ALERTS = {
  "not-ok": { label: "Printed NOT OK", tone: "bad", rank: 4 },
  "out-of-limit": { label: "Outside printed limits", tone: "bad", rank: 3 },
  aborted: { label: "Aborted", tone: "warn", rank: 2 },
  review: { label: "Review needed", tone: "warn", rank: 1 },
} as const;

export type QaAlert = keyof typeof QA_ALERTS;

export function reportAlert(report: Report): QaAlert | undefined {
  if (report.printedStatus === "NOT OK") return "not-ok";
  if (report.printedStatus === "Aborted") return "aborted";
  if (report.measurements.some(isOutOfLimit)) return "out-of-limit";
  if (report.needsReview) return "review";
  return undefined;
}

export function strongestReportAlert(reports: Report[]) {
  let strongest: { report: Report; alert: QaAlert } | undefined;
  for (const report of reports) {
    const alert = reportAlert(report);
    if (alert && (!strongest || QA_ALERTS[alert].rank > QA_ALERTS[strongest.alert].rank)) strongest = { report, alert };
  }
  return strongest;
}

export function reportResult(report: Report) {
  const alert = reportAlert(report);
  if (alert) return QA_ALERTS[alert];
  if (report.printedStatus === "OK") return { label: "Printed OK", tone: "ok", rank: -1 } as const;
  return { label: "Result unavailable", tone: report.type === "Daily" ? "warn" : "muted", rank: 0 } as const;
}

/** Reports for one scanner on one calendar date. */
export function calendarDayResults(reports: Report[]) {
  let latestDaily: { report: Report; result: ReturnType<typeof reportResult>; time: string } | undefined;
  for (const report of reports) {
    if (report.type !== "Daily") continue;
    const time = report.time.padEnd(8, ":00");
    const result = reportResult(report);
    if (!latestDaily || time > latestDaily.time || (time === latestDaily.time && result.rank > latestDaily.result.rank)) {
      latestDaily = { report, result, time };
    }
  }
  const otherAlert = strongestReportAlert(reports.filter((report) => report !== latestDaily?.report));
  return { latestDaily, otherAlert };
}
