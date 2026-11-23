import type { ReportType } from "./qa-data";

export interface QaBackup { kind: "ctqa-backup"; version: 1; createdAt: string; filings: Record<string, ReportType>; settings: unknown }
const TYPES: ReportType[] = ["Daily", "Monthly", "Other"];

export function makeBackup(filings: Record<string, ReportType>, settings: unknown, createdAt = new Date().toISOString()): QaBackup {
  return { kind: "ctqa-backup", version: 1, createdAt, filings, settings };
}

/** Returns a valid backup or throws a readable reason; never partially accepts a file. */
export function parseBackup(text: string): QaBackup {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("This file is not a CT QA backup."); }
  const b = data as Partial<QaBackup>;
  if (!b || b.kind !== "ctqa-backup" || b.version !== 1) throw new Error("This file is not a CT QA backup.");
  if (!b.filings || typeof b.filings !== "object" || Array.isArray(b.filings)) throw new Error("The backup has no filing decisions.");
  for (const [id, t] of Object.entries(b.filings)) {
    if (typeof id !== "string" || !TYPES.includes(t as ReportType)) throw new Error("The backup contains an unknown filing type.");
  }
  return { kind: "ctqa-backup", version: 1, createdAt: String(b.createdAt ?? ""), filings: b.filings, settings: b.settings ?? null };
}
