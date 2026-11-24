import { triage } from "./qa-triage";
import { describe, expect, it } from "vitest";
import { parseSiemensPages, type PdfTextPage } from "./qa-parser";
import { isOutOfLimit, SCANNERS } from "./qa-data";
import { hasOnlyContentsAndPageNumbers } from "./qa-pdf-content";
import { needsParserRefresh, refreshParsedReport, REPORT_PARSER_REVISION } from "./qa-parser-upgrade";

const identity: PdfTextPage = { page: 1, lines: ["Product Name SOMATOM Drive", "Software Version syngo CT VB30A_SP10", "2026-11-11 07:05:14"] };
const summary: PdfTextPage = { page: 2, lines: ["1. Quality Daily Noise OK................ 3", "2. Quality Daily Homogeneity NOT OK................ 6"] };
const read = (lines: string[]) => parseSiemensPages([identity, summary, { page: 3, lines }], "sample.pdf", 54);

it("files a standalone table-position check and retains its separate printed movement limits", () => {
  const report = parseSiemensPages([identity, { page: 2, lines: [
    "Quality IEC Constancy Table Position", "Test Results NOT OK", "Continuous Move Stepwise Move",
    "Position 1 -10.0 mm -8.0 mm", "Tolerance -11.0 ... -9.0 mm -10.5 ... -9.5 mm",
  ] }], "check.pdf", 20);
  expect(triage(report)).toMatchObject({ type: "Monthly", autoFiled: true, needsReview: true, printedStatus: "NOT OK" });
  expect(report.measurements).toMatchObject([
    { context: "Position 1 · Continuous", value: -10, lower: -11, upper: -9 },
    { context: "Position 1 · Stepwise", value: -8, lower: -10.5, upper: -9.5 },
  ]);
});

it("reads the reference marker tolerance without classifying the reference-only run as routine", () => {
  const report = parseSiemensPages([identity, { page: 2, lines: [
    "Quality IEC Constancy Reference External Lightm.", "Test Results OK", "Result [mm]", "0.50", "Tolerance", "-1.00 ... 1.00",
  ] }], "monthly.pdf", 20);
  expect(triage(report)).toMatchObject({ type: "Other", needsReview: false, printedStatus: "OK" });
  expect(report.measurements[0]).toMatchObject({ metric: "externalmarker", value: 0.5, lower: -1, upper: 1 });
});

it("does not infer an OK result from one readable mode alongside an unreadable one", () => {
  const report = parseSiemensPages([identity, { page: 2, lines: [
    "Quality IEC Constancy MTF", "Test Parameters Test Results OK", "Test Parameters Test Results —",
  ] }], "check.pdf", 20);
  expect(report).toMatchObject({ printedStatus: "Not available", needsReview: true });
});

it("distinguishes an outline-only PDF from one with text or inconsistent page markers", () => {
  const cover = { page: 1, lines: ["Table of Contents", "2026-07-01 01:00:00 Page: 1 / 2"] };
  const last = { page: 2, lines: ["2026-07-01 01:00:00 Page: 2 / 2"] };
  expect(hasOnlyContentsAndPageNumbers([cover, last])).toBe(true);
  expect(hasOnlyContentsAndPageNumbers([cover, { ...last, lines: ["An unreadable-looking report", ...last.lines] }])).toBe(false);
  expect(hasOnlyContentsAndPageNumbers([cover, { ...last, lines: ["2026-07-02 01:00:00 Page: 2 / 2"] }])).toBe(false);
});

it("keeps a saved NOT OK and its readings during the one-time catalog recheck", () => {
  const saved = { ...read(["1. Quality Daily Noise", "Results for System A", "Slice 1 6.1 HU 2.5 ... 4.4 HU"]), originalUrl: "ctqa://app/saved-report/sample.pdf" };
  const parsed = parseSiemensPages([identity, { page: 2, lines: ["1. Quality Daily Homogeneity OK................ 6"] }], "sample.pdf", 54);
  expect(needsParserRefresh(saved)).toBe(true);
  const upgraded = refreshParsedReport(saved, parsed);
  expect(upgraded).toMatchObject({ printedStatus: "NOT OK", parserRevision: REPORT_PARSER_REVISION, measurements: saved.measurements });
  expect(upgraded.printedSections?.find(({ label }) => label === "Homogeneity")?.status).toBe("NOT OK");
  expect(needsParserRefresh(upgraded)).toBe(false);
});

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
  it("does not reuse a later slice's printed limits for a missing band", () => {
    const report = read([
      "1. Quality Daily Noise",
      "Results for System A",
      "Slice 1 6.1 HU",
      "Slice 2 3.1 HU 2.5 ... 4.4 HU",
    ]);
    expect(report.extractionIncomplete).toBe(true);
    expect(report.measurements).toHaveLength(1);
    expect(report.measurements[0]).toMatchObject({ slice: 2, value: 3.1, lower: 2.5, upper: 4.4 });
  });
  it("does not turn printed NOT OK into OK when filing a report", () => {
    const report = read([]);
    const filed = { ...report, type: "Daily", needsReview: false };
    expect(report.printedStatus).toBe("NOT OK");
    expect(filed.printedStatus).toBe("NOT OK");
    expect(filed.needsReview).toBe(false);
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


it("rejects an impossible printed date", () => {
  expect(() => parseSiemensPages([{ page: 1, lines: ["Product Name SOMATOM Drive", "2026-02-31 08:00:00"] }], "invalid.pdf", 1)).toThrow("Report date");
});

it("keeps a conflicting duplicate reading so it can still be flagged", () => {
  const report = read(["1. Quality Daily Noise", "Results for System A", "Slice 1 3.1 HU 2.5 ... 4.4 HU", "Slice 1 6.1 HU 2.5 ... 4.4 HU"]);
  expect(report.measurements.map((m) => m.value)).toEqual([3.1, 6.1]);
  expect(report.measurements.some(isOutOfLimit)).toBe(true);
});

it("reads Siemens VB labels and summary rows with PDF spacing and dot-leader variations", () => {
  const result = parseSiemensPages([
    { ...identity, lines: ["Product  Name:  SOMATOM Drive", ...identity.lines.slice(1)] },
    { page: 2, lines: ["1. Quality\u00a0 Daily Noise Not   OK … 3"] },
  ], "spaced.pdf", 10);
  expect(result.scanner).toBe("drive");
  expect(result.printedSections).toEqual([{ label: "Noise", status: "NOT OK", page: 3 }]);
  expect(result.printedStatus).toBe("NOT OK");
});

it("files explicitly printed IEC Constancy MTF as Monthly while keeping its printed exception in Review", () => {
  const report = parseSiemensPages([
    { page: 1, lines: ["Product Name SOMATOM Definition Flash", "2026-08-03 09:41:43", "Quality IEC Constancy"] },
    { page: 2, lines: ["1. Quality IEC Constancy Lightmarker OK........3", "2. Quality IEC Constancy MTF NOT OK........4"] },
  ], "test-monthly.pdf", 20);
  expect(triage(report)).toMatchObject({ type: "Monthly", needsReview: true, printedStatus: "NOT OK", autoFiled: true });
});

it("keeps IEC Acceptance with the same test labels in Other", () => {
  const report = parseSiemensPages([
    { page: 1, lines: ["Product Name SOMATOM Definition Flash", "2026-08-03 09:41:43", "Quality IEC Acceptance"] },
    { page: 2, lines: ["1. Quality IEC Acceptance Lightmarker OK........3", "2. Quality IEC Acceptance MTF NOT OK........4"] },
  ], "test-acceptance.pdf", 20);
  expect(triage(report)).toMatchObject({ type: "Other", needsReview: true, printedStatus: "NOT OK" });
});
