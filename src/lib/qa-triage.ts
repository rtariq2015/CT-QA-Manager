import { isOutOfLimit, type Report } from "./qa-data";

/** Why a report needs a person, or null when it can be filed automatically. */
export function reviewReason(r: Report): string | null {
  if (r.printedStatus === "NOT OK") return "Printed NOT OK — acknowledge before filing";
  if (r.measurements.some(isOutOfLimit)) return "A reading is outside its printed limit";
  if (r.suggested === "Other" && r.printedStatus === "OK" && r.measurements.length > 0)
    return "Not a routine Daily or Monthly report";
  return null;
}

/** Clean routine reports are filed as their suggested type; unreadable ones go to Other. */
export function triage(r: Report): Report {
  if (!r.needsReview) return r;
  if (reviewReason(r)) return r;
  const unreadable = r.printedStatus !== "OK" || r.measurements.length === 0;
  return { ...r, type: unreadable ? "Other" : r.suggested, needsReview: false, autoFiled: true };
}

/** Plain next step for the person reviewing, matched to the reason. */
export function reviewAction(r: Report): string {
  if (r.printedStatus === "NOT OK") return "Look at the red NOT OK test below. Tell your physicist or Siemens service if needed, then file it as the report type. The NOT OK stays on record.";
  if (r.measurements.some(isOutOfLimit)) return "Check the red reading below against the original PDF. Tell your physicist if it is real, then file it.";
  if (r.suggested === "Other") return "Open the original PDF to see what test this is (for example acceptance or service). File it as Other unless it is a Daily or Monthly.";
  return "The app could not read this one. Open the original PDF, decide if it is a Daily, Monthly or Other, and file it.";
}
