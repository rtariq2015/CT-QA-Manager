import { describe, expect, it } from "vitest";
import { triage, reviewReason } from "./qa-triage";
import type { Report } from "./qa-data";

const base = { id: "x", scanner: "drive", date: "2026-11-20", time: "07:00", fileName: "a.pdf", sizeKb: 1, type: "Other", suggested: "Daily", confidence: "uncertain", needsReview: true, pages: 2, printedStatus: "OK",
  measurements: [{ metric: "noise", value: 4, lower: 3, upper: 5 }] } as unknown as Report;

describe("auto-filing", () => {
  it("files a clean Daily automatically", () => {
    const r = triage(base);
    expect(r.type).toBe("Daily"); expect(r.needsReview).toBe(false); expect(r.autoFiled).toBe(true);
  });
  it("keeps printed NOT OK in review", () => {
    const r = triage({ ...base, printedStatus: "NOT OK" });
    expect(r.needsReview).toBe(true); expect(r.printedStatus).toBe("NOT OK");
  });
  it("keeps Other-suggested reports in review", () => {
    expect(triage({ ...base, suggested: "Other" }).needsReview).toBe(true);
  });
  it("keeps reports without readings in review", () => {
    const r = triage({ ...base, measurements: [] });
    expect(r).toMatchObject({ type: "Other", needsReview: true });
    expect(r.autoFiled).toBeUndefined();
    expect(reviewReason(r)).toMatch(/measurements/i);
  });
  it("keeps reports with no printed result in review", () => {
    const r = triage({ ...base, printedStatus: "Not available" });
    expect(r).toMatchObject({ type: "Other", needsReview: true });
    expect(r.autoFiled).toBeUndefined();
    expect(reviewReason(r)).toMatch(/printed summary/i);
  });
  it("keeps reports with an incomplete supported measurement table in review", () => {
    const r = triage({ ...base, extractionIncomplete: true });
    expect(r.needsReview).toBe(true);
    expect(reviewReason(r)).toMatch(/Some measurements/i);
  });
  it("still reviews a readable non-routine report", () => {
    expect(reviewReason({ ...base, suggested: "Other" })).not.toBeNull();
  });
});
