import type { Measurement } from "./qa-data";

export function validReportTimestamp(date: string, time: string): boolean {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Preserve any distinct result or limit even when the printed context repeats. */
export function distinctMeasurements(measurements: Measurement[], acrossPages = false): Measurement[] {
  const seen = new Set<string>();
  return measurements.filter((measurement) => {
    const { metric, context, value, lower, upper, baseline, unit, referenceDate, page } = measurement;
    const key = JSON.stringify([metric, context, value, lower, upper, baseline, unit, referenceDate, acrossPages ? null : page]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
