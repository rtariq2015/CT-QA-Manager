import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { type ReactNode } from "react";
import { QaProvider, useQa } from "./qa-store";
import { parseSiemensPages } from "./qa-parser";

it("filing and undo change classification without clearing printed NOT OK", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QaProvider>{children}</QaProvider>;
  const { result } = renderHook(() => useQa(), { wrapper });
  const report = parseSiemensPages([
    { page: 1, lines: ["Product Name SOMATOM Drive", "2026-11-02 07:49:14"] },
    { page: 2, lines: ["5. Quality IEC Constancy Homogeneity / Water NOT OK................7"] },
  ], "filing-check.pdf", 98);
  act(() => result.current.addReport(report));
  act(() => result.current.file(report.id, "Monthly"));
  expect(result.current.reports.find(r => r.id === report.id)).toMatchObject({ type: "Monthly", needsReview: false, printedStatus: "NOT OK" });
  expect(result.current.pending.some(r => r.id === report.id)).toBe(false);
  act(() => { result.current.undo(); });
  expect(result.current.reports.find(r => r.id === report.id)).toMatchObject({ type: "Other", needsReview: true, printedStatus: "NOT OK" });
  expect(result.current.pending.some(r => r.id === report.id)).toBe(true);
});