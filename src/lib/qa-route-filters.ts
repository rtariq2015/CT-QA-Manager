import { SCANNERS } from "./qa-data";
import { validReportTimestamp } from "./qa-parser-validation";

export const scannerFilter = (value: unknown) => SCANNERS.find(({ id }) => id === value)?.id;
export const monthFilter = (value: unknown) => typeof value === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) ? value : undefined;
export const dateFilter = (value: unknown) => typeof value === "string" && validReportTimestamp(value, "00:00") ? value : undefined;

// Report identities can contain filenames. Carry the target in local history state.
declare module "@tanstack/history" {
  interface HistoryState {
    qaReportId?: string;
    qaReportPage?: number;
    qaTrendContext?: string;
  }
}
