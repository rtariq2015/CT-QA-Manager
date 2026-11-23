import type { Report } from "./qa-data";
import { reviewReasonCode } from "./qa-triage";

const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Match the printed layout and measurement contexts. The operator still chooses a filing category. */
export function reviewMatchKey(report: Report) {
  if (!report.needsReview || !report.originalUrl || reviewReasonCode(report) !== "non-routine-report") return null;
  if (!report.software || report.software === "Not available" ||
      !report.printedSections?.length || report.printedSections.some(({ status, label }) => status !== "OK" || !label.trim())) return null;
  if (report.measurements.some((m) => m.limitSource !== "printed" ||
      ![m.value, m.lower, m.upper].every(Number.isFinite) || m.lower > m.upper)) return null;

  return JSON.stringify([
    report.scanner, normalize(report.software), report.pages,
    report.printedSections.map(({ label, page }) => [normalize(label), page]),
    report.measurements.map(({ metric, context, unit, tube, slice, kv, kernel, page }) =>
      JSON.stringify([metric, normalize(context), unit, tube, slice, kv, kernel, page])).sort(),
  ]);
}

export function matchingReviewReports(anchor: Report, pending: Report[]) {
  const key = reviewMatchKey(anchor);
  return key ? pending.filter((report) => reviewMatchKey(report) === key) : [];
}
