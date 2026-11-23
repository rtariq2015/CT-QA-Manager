import { describe, expect, it } from "vitest";
import { parseSiemensPages, type PdfTextPage } from "./qa-parser";
import { getReports, isOutOfLimit, SCANNERS } from "./qa-data";

const identity: PdfTextPage = { page: 1, lines: ["Product Name SOMATOM Drive", "Software Version syngo CT VB30A_SP10", "2026-11-11 07:05:14"] };
const summary: PdfTextPage = { page: 2, lines: ["1. Quality Daily Noise OK................ 3", "2. Quality Daily Homogeneity NOT OK................ 6"] };
const read = (lines: string[]) => parseSiemensPages([identity, summary, { page: 3, lines }], "sample.pdf", 54);

describe("Siemens printed report rules", () => {
  it("preserves the Drive acceptance exception without suggesting Monthly", () => {
    const report = parseSiemensPages([
      { page: 1, lines: ["Product Name SOMATOM Drive", "Quality Acceptance", "2025-11-13 11:28:55"] },
      { page: 2, lines: ["1. Quality IEC Acceptance Lightmarker OK........3", "2. Quality IEC Acceptance Sag./Cor. Lightm. NOT OK........3", "3. Quality IEC Acceptance Topogram Pos. OK........3"] },
    ], "acceptance.pdf", 90);
    expect(report.printedStatus).toBe("NOT OK");
    expect(report.printedSections?.find(s => s.label === "Sag./Cor. Lightm.")?.status).toBe("NOT OK");
    expect(report.suggested).toBe("Other");
  });
  it("identifies the confirmed MDP scanner as SOMATOM Drive", () => {
    const scanner = SCANNERS.find(s => s.location === "MDP Building");
    expect(scanner?.model).toBe("SOMATOM Drive");
    expect(read([]).scanner).toBe("drive");
  });
  it("keeps tube A and B readings separate with their own printed limits", () => {
    const report = read(["1. Quality Daily Noise", "Test: Typical body mode with dual tube", "Voltage 120 kV", "Kernel Or37f", "Results for System A Results for System B", "Slice 1 4.74 HU 4.85 HU", "Slice 2 4.73 HU 4.76 HU", "Tolerance 4.25 ... 5.19 HU 4.25 ... 5.19 HU"]);
    expect(report.measurements).toHaveLength(4);
    expect(report.measurements.find(m => m.slice === 1 && m.tube === "A")).toMatchObject({ value: 4.74, lower: 4.25, upper: 5.19, baseline: null });
    expect(report.measurements.find(m => m.slice === 1 && m.tube === "B")).toMatchObject({ value: 4.85, lower: 4.25, upper: 5.19 });
  });
  it("reads asymmetric per-slice water limits and parenthesized references", () => {
    const report = read(["2. Quality IEC Constancy Homogeneity / Water", "Test: Typical body mode", "Water Value Results for System A", "Slice 1", "Tolerance", "0.58 HU (0.85)", "-3.15 ... 4.00 HU", "Slice 2", "Tolerance", "0.42 HU (1.02)", "-2.98 ... 4.00 HU"]);
    expect(report.measurements[0]).toMatchObject({ value: 0.58, baseline: 0.85, lower: -3.15, upper: 4 });
    expect(report.measurements[1]).toMatchObject({ value: 0.42, baseline: 1.02, lower: -2.98, upper: 4 });
  });
  it("preserves MTF 50 and 10 columns and the real out-of-limit example", () => {
    const report = read(["8. Quality IEC Constancy MTF", "Test: Sharpest mode with UHR", "Results for System A", "50% 10%", "Slice 1", "Tolerance", "16.69 lp/cm (17.33)", "16.82 ... 19.93 lp/cm", "22.34 lp/cm (22.14)", "20.96 ... 25.46 lp/cm"]);
    expect(report.measurements[0]).toMatchObject({ metric: "mtf50", value: 16.69, lower: 16.82, upper: 19.93 });
    expect(report.measurements[1]).toMatchObject({ metric: "mtf10", value: 22.34, lower: 20.96, upper: 25.46 });
    const value = report.measurements[0];
    expect(value && isOutOfLimit(value)).toBe(true);
  });
  it("reads contrast scale in scientific notation rather than low-contrast object size", () => {
    const report = read(["9. Quality IEC Constancy Contrast", "Test: Typical body mode", "Results for System A", "Water CT Air Contrast scale", "Slice 1 0.11 HU -1000.33 HU 1.92e-04 1/HUcm", "Tolerance -4.00 ... 4.00 HU -1004.00 ... -996.00 HU 1.89e-04 ... 1.95e-04 1/HUcm"]);
    expect(report.measurements.find(m => m.metric === "contrast")).toMatchObject({ value: 0.000192, unit: "1/HUcm", lower: 0.000189, upper: 0.000195 });
  });
  it("does not manufacture limits for a table without printed tolerances", () => {
    expect(read(["1. Quality Daily Noise", "Results for System A", "Slice 1 3.28 HU"]).measurements).toHaveLength(0);
  });
  it("does not turn printed NOT OK into OK when filing a report", () => {
    const report = read([]);
    const filed = { ...report, type: "Daily", needsReview: false };
    expect(report.printedStatus).toBe("NOT OK");
    expect(filed.printedStatus).toBe("NOT OK");
    expect(filed.needsReview).toBe(false);
  });
  it("generates deterministic Drive readings for both tubes", () => {
    const reports = getReports();
    const drive = reports.find(r => r.scanner === "drive" && r.suggested === "Daily");
    expect(drive?.measurements.some(m => m.tube === "A")).toBe(true);
    expect(drive?.measurements.some(m => m.tube === "B")).toBe(true);
    expect(getReports()).toEqual(reports);
  });
  it("suggests Daily for the supplied Flash noise and water IEC Constancy summary", () => {
    const report = parseSiemensPages([
      { page: 1, lines: ["Product Name SOMATOM Definition Flash", "2026-11-11 06:32:56"] },
      { page: 2, lines: ["1. Quality IEC Constancy Homogeneity / Water OK........3", "2. Quality IEC Constancy Noise OK........8"] },
    ], "Quality_Constancy.pdf", 80);
    expect(report.scanner).toBe("flash");
    expect(report.suggested).toBe("Daily");
    expect(report.needsReview).toBe(true);
  });
  it("leaves incomplete Flash constancy checks uncertain rather than assuming Daily", () => {
    const report = parseSiemensPages([
      { page: 1, lines: ["Product Name SOMATOM Definition Flash", "2026-09-17 22:59:28"] },
      { page: 2, lines: ["1. Quality IEC Constancy Homogeneity / Water NOT OK........3", "2. Quality IEC Constancy Reference Image Inspection OK........3"] },
    ], "Daily.pdf", 20);
    expect(report.suggested).toBe("Other");
    expect(report.printedStatus).toBe("NOT OK");
  });
  it("retains the Flash daily tube B noise value and its printed tolerance", () => {
    const report = parseSiemensPages([
      { page: 1, lines: ["Product Name SOMATOM Definition Flash", "2026-11-08 07:44:41"] },
      { page: 5, lines: ["1. Quality Daily Noise", "Test: Typical body mode with dual tube System A and B", "Voltage 120 kV", "Kernel Br38f", "Results for System A Results for System B", "Slice 1 3.89 HU 3.97 HU", "Tolerance 3.54 ... 4.32 HU 3.54 ... 4.32 HU"] },
    ], "Flash-Daily.pdf", 80);
    expect(report.measurements.find(m => m.tube === "B")).toMatchObject({ metric: "noise", value: 3.97, lower: 3.54, upper: 4.32, kernel: "Br38f", baseline: null });
  });
});