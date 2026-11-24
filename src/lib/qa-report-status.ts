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
