import { beforeEach, describe, expect, it } from "vitest";
import { _reset, exportText, getConnection, getLog, log, markFolderOpened, MAX_LINES, redact } from "./qa-logger";

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
