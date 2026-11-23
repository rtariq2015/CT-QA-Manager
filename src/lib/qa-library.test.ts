import { describe, expect, it } from "vitest";
import { buildCsv, buildTree, folderParts, savedPaths, tidyFileName } from "./qa-library";
import type { Report } from "./qa-data";

const r = (o: Partial<Report>): Report => ({ id: "1", scanner: "drive", date: "2026-03-04", time: "07:00", fileName: "a.pdf", sizeKb: 1, type: "Daily", suggested: "Daily", confidence: "certain", needsReview: false, measurements: [], pages: 1, ...o });

describe("library layout", () => {
  it("files by scanner, year, month, type", () => {
    expect(folderParts(r({})).join("/")).toBe("MDP Building/2026/03-March/Daily_QA");
  });
  it("tree counts printed NOT OK", () => {
    const t = buildTree([r({}), r({ id: "2", printedStatus: "NOT OK", type: "Monthly" })]);
    expect(t.count).toBe(2); expect(t.notOk).toBe(1);
  });
  it("CSV keeps printed NOT OK and says Filed as", () => {
    const csv = buildCsv([r({ printedStatus: "NOT OK", type: "Monthly" })]);
    expect(csv).toContain("Filed as Monthly"); expect(csv).toContain("NOT OK");
  });
});

describe("tidy saved file names", () => {
  const base = { id: "a", scanner: "xcite", date: "2026-11-23", time: "05:54:49", fileName: "serviceReport_6c631fba.pdf", type: "Daily" } as unknown as Report;
  it("names an X.cite Daily like the department's own files", () => {
    expect(tidyFileName(base)).toBe("CT_EXCITE_QA_11-23-2026.pdf");
    expect(tidyFileName({ ...base, type: "Monthly" })).toBe("CT_EXCITE_MONTHLY_QA_11-23-2026.pdf");
  });
  it("adds the time when two reports share a day", () => {
    const paths = savedPaths([base, { ...base, id: "b", time: "14:02:00" }]);
    expect(paths.get("a")).toBe("CT Xcite/2026/11-November/Daily_QA/CT_EXCITE_QA_11-23-2026.pdf");
    expect(paths.get("b")).toBe("CT Xcite/2026/11-November/Daily_QA/CT_EXCITE_QA_11-23-2026_1402.pdf");
  });
});
