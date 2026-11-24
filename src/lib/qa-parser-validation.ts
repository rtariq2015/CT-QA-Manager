import type { Measurement } from "./qa-data";

export const normalizeTestLabel = (label: string) => label.replace(/\s+/g, " ").trim();
export const isReferenceTest = (label: string) => /^Reference\s+/i.test(label.trim());

export function validReportTimestamp(date: string, time: string): boolean {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Preserve any distinct result or limit even when the printed context repeats. */
export function distinctMeasurements(measurements: Measurement[], acrossPages = false): Measurement[] {
  const keys = measurements.map((measurement) => {
    const { metric, context, value, lower, upper, baseline, unit, referenceDate, page } = measurement;
    return JSON.stringify([metric, normalizeTestLabel(context), value, lower, upper, baseline, unit, referenceDate, acrossPages ? null : page]);
  });
  const attributed = new Set(keys.filter((_, index) => measurements[index]?.referenceTest !== undefined));
  const seen = new Set<string>();
  return measurements.filter(({ referenceTest }, index) => {
    const key = keys[index]!;
    // A reread can identify the test for a reading already saved by an older parser.
    if (referenceTest === undefined && attributed.has(key)) return false;
    const runKey = `${key}:${referenceTest}`;
    if (seen.has(runKey)) return false;
    seen.add(runKey);
    return true;
  });
}
