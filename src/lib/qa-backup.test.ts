import { describe, expect, it } from "vitest";
import { makeBackup, parseBackup } from "./qa-backup";
import { DEFAULT } from "./qa-settings";

describe("backup", () => {
  it("round-trips filing decisions and settings", () => {
    const b = makeBackup({ r1: "Monthly", r2: "Daily" }, DEFAULT, "2026-11-22");
    const back = parseBackup(JSON.stringify(b));
    expect(back.filings).toEqual({ r1: "Monthly", r2: "Daily" });
    expect(back.settings).toEqual(DEFAULT);
  });
  it("accepts filings-only backups and a valid empty folder list", () => {
    expect(parseBackup(JSON.stringify(makeBackup({ r1: "Daily" }, null))).settings).toBeNull();
    expect(parseBackup(JSON.stringify({ ...makeBackup({}, null), settings: undefined })).settings).toBeNull();
    const settings = { ...DEFAULT, sources: [] };
    expect(parseBackup(JSON.stringify(makeBackup({}, settings))).settings).toEqual(settings);
  });
  it("rejects the whole backup when a scanner folder or schedule is invalid", () => {
    const backup = makeBackup({ r1: "Daily" }, DEFAULT);
    const invalidSources = { ...DEFAULT, sources: [DEFAULT.sources[0], null] };
    expect(() => parseBackup(JSON.stringify({ ...backup, settings: invalidSources }))).toThrow("invalid scanner folder");
    expect(() => parseBackup(JSON.stringify({ ...backup, settings: { ...DEFAULT, dueDay: 31 } }))).toThrow("invalid QA schedule");
    expect(() => parseBackup(JSON.stringify({ ...backup, settings: [] }))).toThrow("scanner folder list");
  });
  it("accepts old scanner folders without a folder type and numeric sync minutes", () => {
    const settings = { ...DEFAULT, sources: [{ name: "Flash", path: "C:\\QA" }], sync: 30 };
    const backup = parseBackup(JSON.stringify({ ...makeBackup({}, null), settings }));
    expect(backup.settings).toEqual({ ...settings, sync: "30" });
  });
  it("rejects files that are not backups", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("not json")).toThrow();
  });
  it("rejects unknown filing types such as Approved", () => {
    expect(() => parseBackup(JSON.stringify({ kind: "ctqa-backup", version: 1, filings: { r1: "Approved" } }))).toThrow();
  });
});
