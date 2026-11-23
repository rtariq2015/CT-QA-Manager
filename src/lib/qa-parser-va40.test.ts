import { describe, expect, it } from "vitest";
import { parseSiemensPages, type PdfTextPage } from "./qa-parser";
import { triage } from "./qa-triage";

const footer = "Maimonides Medical Center | SOMATOM X.cite | Serial Number: 123193 | Customer ID: 7645";
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
});
