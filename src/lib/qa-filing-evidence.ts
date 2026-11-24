import type { Report, ReportType } from "./qa-data";

export type PrintedProgram = "daily" | "monthly" | "constancy" | "other" | "unknown";

export function printedProgram(text: string): PrintedProgram {
  if (/\b(?:IEC\s+)?Acceptance\b|(?:^|\n)\s*(?:Service|Calibration|Reference)\s+(?:report|QA|tests?)\b/i.test(text)) return "other";
  const daily = /\b(?:Quality\s+Daily|Daily\s+QA)\b/i.test(text);
  const monthly = /\b(?:Quality\s+Monthly|Monthly\s+QA)\b/i.test(text);
  if (daily && monthly) return "unknown";
  if (monthly) return "monthly";
  if (daily) return "daily";
  return /\bIEC\s+Constancy\b/i.test(text) ? "constancy" : "unknown";
}

export function inferRoutineFiling(report: Report): Exclude<ReportType, "Other"> | undefined {
  if (report.program === "daily") return "Daily";
  if (report.program === "monthly") return "Monthly";
  if (report.program !== "constancy") return undefined;

  const tests = report.printedSections?.map(({ label }) => label.toLowerCase().trim().replace(/\s+/g, " ")) ?? [];
  const advanced = /\b(?:mtf|light\s*marker|topogram|slice thickness|table position(?:ing)?|contrast scale)\b/;
  if (tests.some((label) => advanced.test(label)) ||
      report.measurements.some(({ metric }) => ["mtf50", "mtf10", "sagcor", "lightmarker", "externalmarker", "topogram", "table", "slice"].includes(metric))) return "Monthly";
  if (tests.length === 2 && tests.includes("noise") &&
      tests.some((label) => /^(?:homogeneity(?:\s*\/\s*water)?|water ct)$/.test(label))) return "Daily";
  return undefined;
}
