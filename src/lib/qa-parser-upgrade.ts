import type { Report } from "./qa-data";
import { hasUnassignedMonthlyReadings } from "./qa-monthly-status";
import { distinctMeasurements, isReferenceTest, normalizeTestLabel } from "./qa-parser-validation";

export const REPORT_PARSER_REVISION = 2;

export function needsParserRefresh(report: Report, manuallyFiled = false) {
  const revision = report.parserRevision ?? 0;
  if (revision >= REPORT_PARSER_REVISION || !report.originalUrl) return false;
  if (hasUnassignedMonthlyReadings(report)) return true;
  if (revision >= 1 || manuallyFiled) return false;
  if (report.needsReview) return true;
  if (report.scanner === "xcite") return false;
  const sections = report.printedSections ?? [];
  return sections.some(({ label }) => /^(?:Reference\s+)?(?:Lightmarker|External Lightm\.|Sag\.\/Cor\. Lightm\.|Topogram Pos\.|Table Position)$/i.test(label)) ||
    (report.type === "Monthly" && sections.length > 0 && sections.every(({ label }) => isReferenceTest(label)));
}

export function refreshParsedReport(saved: Report, parsed: Report): Report {
  const printedStatus = saved.printedStatus === "NOT OK" || parsed.printedStatus === "NOT OK" ? "NOT OK"
    : saved.printedStatus === "Aborted" || parsed.printedStatus === "Aborted" ? "Aborted"
    : saved.printedStatus === "OK" || parsed.printedStatus === "OK" ? "OK" : "Not available";
  const printedSections = [...(parsed.printedSections ?? [])];
  for (const section of saved.printedSections ?? []) {
    const label = normalizeTestLabel(section.label);
    const index = printedSections.findIndex((item) => item.label === label && item.page === section.page);
    if (index < 0) printedSections.push({ ...section, label });
    else if (section.status === "NOT OK" || (section.status === "Aborted" && printedSections[index]?.status !== "NOT OK")) printedSections[index] = { ...section, label };
  }
  return {
    ...saved,
    needsReview: true,
    program: parsed.program === "unknown" ? (saved.program ?? "unknown") : (parsed.program ?? saved.program ?? "unknown"),
    parserRevision: REPORT_PARSER_REVISION,
    printedStatus,
    printedSections,
    measurements: distinctMeasurements([...saved.measurements, ...parsed.measurements]),
    extractionIncomplete: Boolean(saved.extractionIncomplete || parsed.extractionIncomplete),
    ...(parsed.extractionNotes ? { extractionNotes: parsed.extractionNotes } : {}),
  };
}
