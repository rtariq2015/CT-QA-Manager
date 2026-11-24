import { inferRoutineFiling } from "./qa-filing-evidence";
import { isOutOfLimit, type Report } from "./qa-data";

const reviewLabels = {
  "printed-not-ok": "Printed NOT OK — review the original",
  "printed-aborted": "Scanner marked the test Aborted",
  "outside-printed-limit": "A reading is outside its printed limit",
  "missing-printed-summary": "The printed summary could not be read",
  "no-supported-readings": "No supported measurements with printed limits could be read",
  "incomplete-readings": "Some measurements or printed limits could not be read",
  "non-routine-report": "Not a routine Daily or Monthly report",
} as const;

export function reviewReasonCode(r: Report): keyof typeof reviewLabels | null {
  if (r.printedStatus === "NOT OK") return "printed-not-ok";
  if (r.printedStatus === "Aborted") return "printed-aborted";
  if (r.measurements.some(isOutOfLimit)) return "outside-printed-limit";
  if (r.printedStatus !== "OK") return "missing-printed-summary";
  if (!r.measurements.length) return "no-supported-readings";
  if (r.extractionIncomplete) return "incomplete-readings";
  if (r.suggested === "Other") return "non-routine-report";
  return null;
}

export function reviewReason(r: Report): string | null {
  const code = reviewReasonCode(r);
  return code ? reviewLabels[code] : null;
}

export function reportReviewLane(report: Report) {
  return reviewReasonCode(report) === "non-routine-report" ? "filing" : "exceptions";
}

/** A filing category and a review flag describe different things. */
export function triage(r: Report): Report {
  if (!r.needsReview) return r;
  const routine = inferRoutineFiling(r) ?? (r.program === "other" ? ("Other" as const) : undefined);
  if (routine) {
    const filed = { ...r, suggested: routine, type: routine, confidence: "likely" as const, autoFiled: true };
    const reason = reviewReasonCode(filed);
    return { ...filed, needsReview: reason !== null && reason !== "non-routine-report" };
  }
  if (r.program !== undefined) return { ...r, suggested: "Other" };
  // Existing catalog entries were filed using the rules active when they were imported.
  if (reviewReason(r)) return r;
  return { ...r, type: r.suggested, needsReview: false, autoFiled: true };
}

export function filingLabel(report: Report) {
  if (!report.needsReview) return `Filed as ${report.type}`;
  return report.autoFiled ? `Filed as ${report.type} · review needed` : "Filing pending";
}

/** Plain next step for the person reviewing, matched to the reason. */
export function reviewAction(r: Report): string {
  if (r.printedStatus === "NOT OK") return "Look at the red NOT OK test below. Tell your physicist or Siemens service if needed, and acknowledge it after checking the source.";
  if (r.printedStatus === "Aborted") return "Open the original PDF to see where the QA test stopped.";
  if (r.measurements.some(isOutOfLimit)) return "Check the red reading below against the original PDF. Tell your physicist if it is confirmed.";
  if (r.printedStatus !== "OK" || !r.measurements.length || r.extractionIncomplete) return "Check the printed summary and readings in the original PDF before filing.";
  return "Open the original PDF to see what test this is (for example acceptance or service). File it as Other unless it is a Daily or Monthly.";
}
