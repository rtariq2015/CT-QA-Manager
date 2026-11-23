import { beforeEach, describe, expect, it } from "vitest";
import { _reset, exportDiagnostic, exportText, getConnection, getLog, log, markFolderOpened, MAX_LINES, redact } from "./qa-logger";
import { clearScanHistory, getScanHistory, startScan } from "./qa-scan-log";
import { PdfReadError } from "./qa-read-error";
import { parseSiemensPages } from "./qa-parser";

describe("activity log", () => {
  beforeEach(() => _reset());
  it("keeps only the last 2000 lines", () => {
    for (let i = 0; i < MAX_LINES + 5; i++) log("info", "app", `line ${i}`);
    expect(getLog()).toHaveLength(2000);
    expect(getLog()[0]?.message).toBe("line 5");
  });
  it("never stores a password", () => {
    log("info", "settings", "login password=Hosp1tal!");
    expect(getLog()[0]?.message).not.toContain("Hosp1tal");
    expect(redact("pwd: abc")).toBe("pwd=[hidden]");
  });
  it("exports one readable line per event", () => {
    log("error", "file", "Could not read a.pdf");
    expect(exportText()).toContain("ERROR");
    expect(exportText()).toContain("Could not read a.pdf");
  });
  it("remembers each folder opened so its status can be shown", () => {
    markFolderOpened("EXCITE-ED", "local", 8);
    markFolderOpened("CT Edge", "network", 3);
    markFolderOpened("EXCITE-ED", "local", 12);
    const opened = getConnection().opened;
    expect(opened.map((o) => o.name)).toEqual(["CT Edge", "EXCITE-ED"]);
    expect(opened.find((o) => o.name === "EXCITE-ED")?.count).toBe(12);
    expect(getConnection().state).toBe("ready");
  });
});

describe("support diagnostics", () => {
  beforeEach(() => { _reset(); clearScanHistory(); });

  it("retains scan totals after detailed entries roll off and excludes raw messages", () => {
    const scan = startScan("network", 480, 2);
    const report = parseSiemensPages([
      { page: 1, lines: ["Product Name SOMATOM Drive", "2026-11-02 07:49:14"] },
    ], "private-name.pdf", 1);
    scan.recordRead({ report, cached: false, readMs: 76, saved: true });
    scan.recordRead({ report, cached: true, readMs: 1, saved: false, archiveError: "private local path" });
    scan.recordFailure(new PdfReadError("scanner-unrecognized", "private error"));
    scan.finish(3);
    log("error", "file", "private-name.pdf");
    for (let i = 0; i < MAX_LINES; i++) log("info", "app", "private local path");

    const text = exportDiagnostic({ reports: 2, waitingInReview: 2, app: "desktop" });
    expect(text).not.toContain("private");
    expect(JSON.parse(text)).toMatchObject({
      schemaVersion: 2,
      scans: [{
        source: "network", configuredFolder: 2, sourceReadMs: 480, found: 3, read: 2,
        cached: 1, failed: 1, saved: 1, archiveFailed: 1, queuedForReview: 2,
        reportsByScanner: { drive: 2 }, readTimingMs: { median: 76, p95: 76 },
        readErrors: { "scanner-unrecognized": 1 }, reviewReasons: { "missing-printed-summary": 2 },
      }],
    });
  });

  it("retains the cause of a connection error even when no PDFs arrive", () => {
    startScan("network", 233).finish(0, { code: "credential-conflict", nativeCode: 1219 });
    expect(getScanHistory()[0]).toMatchObject({
      sourceReadMs: 233, found: 0, sourceError: { code: "credential-conflict", nativeCode: 1219 },
    });
  });
});
