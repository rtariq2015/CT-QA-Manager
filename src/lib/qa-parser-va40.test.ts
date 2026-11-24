import { describe, expect, it } from "vitest";
import { parseSiemensPages, type PdfTextPage } from "./qa-parser";
import { triage } from "./qa-triage";

const footer = "Example Imaging Center | SOMATOM X.cite | Serial Number: 123456 | Customer ID: 7890";
const cover: PdfTextPage = { page: 1, lines: ["SOMATOM X.cite", "Daily QA", footer] };
const dailySummary: PdfTextPage = { page: 3, lines: ["Summary", "Function Start Time Result", "Homogeneity (IEC Constancy) 08/01/2025 6:16:19 AM", " OK", "Noise (IEC Constancy) 08/01/2025 6:17:02 AM", " OK", footer] };

describe("SOMATOM X.cite (VA40A) reports", () => {
  it("reads the US date, single tube noise and suggests Daily", () => {
    const r = parseSiemensPages([cover, dailySummary, { page: 17, lines: ["2 Noise (IEC Constancy)", "Voltage 100 kV", "Kernel Br40d", "Result", "Slice Results for System A [HU] Status", "Tolerance: 6.83 … 9.25", "6 8.21 In Tol.", "7 8.29 In Tol.", footer] }], "x.pdf", 10);
    expect(r.scanner).toBe("xcite");
    expect(r.date).toBe("2025-08-01");
    expect(r.time).toBe("06:16:19");
    expect(r.suggested).toBe("Daily");
    expect(r.measurements).toHaveLength(2);
    expect(r.measurements[0]).toMatchObject({ metric: "noise", value: 8.21, lower: 6.83, upper: 9.25, tube: "A", kv: 100 });
    expect(triage(r).autoFiled).toBe(true);
  });
  it("keeps the printed Not OK sagittal light marker 4.00 mm and holds it for review", () => {
    const summary: PdfTextPage = { page: 3, lines: ["Summary", "Calibration 03/03/2024 6:19:58 AM", " OK", "Lightmarker (IEC Constancy) 03/03/2024 6:24:01 AM", " OK", "Sagittal/Coronal Lightmarker (IEC Constancy) 03/03/2024 6:24:30 AM", " Not OK", "Topogram Positioning (IEC Constancy) 03/03/2024 6:25:43 AM", " OK"] };
    const page: PdfTextPage = { page: 8, lines: ["3 Sagittal/Coronal Lightmarker (IEC", "Constancy)", "Result", "Mode Description Sagittal Lightmarker[mm] Coronal Lightmarker[mm] Status", "Tolerance: -2.00 … 2.00 Tolerance: -2.00 … 2.00", "120kV; FFS2x2;", "32x0.6mm; Adult Body;", "Aa", "  S_t_a_t_u_s.NotOkError.9.S_t_a_t_u_s 4.00 -1.00", "   S_t_a_t_u_s.NotOkError.9.S_t_a_t_u_s Out Tol.", footer] };
    const r = parseSiemensPages([{ page: 1, lines: ["SOMATOM X.cite", "IEC Constancy", footer] }, summary, page], "m.pdf", 10);
    expect(r.suggested).toBe("Monthly");
    expect(r.printedStatus).toBe("NOT OK");
    expect(r.printedSections?.find(s => s.label === "Sagittal/Coronal Lightmarker")?.status).toBe("NOT OK");
    expect(r.measurements.map(m => m.value)).toEqual([4, -1]);
    expect(triage(r).needsReview).toBe(true);
  });
  it("keeps a printed exception on a later summary page", () => {
    const continuation: PdfTextPage = {
      page: 4,
      lines: ["Summary", "Lightmarker (IEC Constancy) 08/01/2025 6:17:42 AM Not OK"],
    };
    const noise: PdfTextPage = {
      page: 5,
      lines: ["2 Noise (IEC Constancy)", "Slice Results for System A [HU] Status", "Tolerance: 6.83 … 9.25", "6 8.21 In Tol."],
    };
    const r = parseSiemensPages([cover, dailySummary, continuation, noise], "continued.pdf", 10);
    expect(r.printedSections).toContainEqual({ label: "Lightmarker", status: "NOT OK", page: 4 });
    expect(r.printedStatus).toBe("NOT OK");
    expect(triage(r).needsReview).toBe(true);
  });
  it("reads complete numbers with four or more digits", () => {
    const page: PdfTextPage = {
      page: 4,
      lines: ["2 Noise (IEC Constancy)", "Slice Results for System A [HU] Status", "Tolerance: 1000 … 2,000", "6 1500 In Tol."],
    };
    const r = parseSiemensPages([cover, dailySummary, page], "numbers.pdf", 10);
    expect(r.measurements).toHaveLength(1);
    expect(r.measurements[0]).toMatchObject({ value: 1500, lower: 1000, upper: 2000 });
  });
  it("retains the printed MTF reference values", () => {
    const page: PdfTextPage = {
      page: 4,
      lines: ["2 MTF (IEC Constancy)", "Slice 50% [lp/cm] 10% [lp/cm]", "Tolerance: 10 … 20 Tolerance: 20 … 30", "6 12.9 12.2 24.5 24.7 In Tol."],
    };
    const r = parseSiemensPages([cover, dailySummary, page], "reference.pdf", 10);
    expect(r.measurements).toMatchObject([
      { metric: "mtf50", value: 12.9, baseline: 12.2 },
      { metric: "mtf10", value: 24.5, baseline: 24.7 },
    ]);
  });
});

it("keeps a printed exception from a summary explicitly marked continued", () => {
  const result = parseSiemensPages([cover, dailySummary, {
    page: 4,
    lines: ["Summary (continued)", "Noise (IEC Constancy) 08/01/2025 6:20:00 AM Not   OK"],
  }], "summary-continued.pdf", 10);
  expect(result.printedSections).toContainEqual({ label: "Noise", status: "NOT OK", page: 4 });
  expect(triage(result).needsReview).toBe(true);
});

it("keeps an aborted X.cite Daily report in the exception queue", () => {
  const result = parseSiemensPages([cover, {
    page: 2, lines: ["Summary", "Phantom Position Check 07/01/2026 6:00:00 AM Aborted"],
  }], "aborted.pdf", 5);
  expect(triage(result)).toMatchObject({ type: "Daily", autoFiled: true, needsReview: true, printedStatus: "Aborted" });
  expect(result.printedSections).toEqual([{ label: "Phantom Position Check", status: "Aborted", page: 2 }]);
});
