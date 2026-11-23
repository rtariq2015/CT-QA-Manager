import { describe, expect, it } from "vitest";
import { makeBackup, parseBackup } from "./qa-backup";

describe("backup", () => {
  it("round-trips filing decisions and settings", () => {
    const b = makeBackup({ r1: "Monthly", r2: "Daily" }, { dueDay: 10 }, "2026-11-22");
    const back = parseBackup(JSON.stringify(b));
    expect(back.filings).toEqual({ r1: "Monthly", r2: "Daily" });
    expect(back.settings).toEqual({ dueDay: 10 });
  });
  it("rejects files that are not backups", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("not json")).toThrow();
  });
  it("rejects unknown filing types such as Approved", () => {
    expect(() => parseBackup(JSON.stringify({ kind: "ctqa-backup", version: 1, filings: { r1: "Approved" } }))).toThrow();
  });
});
