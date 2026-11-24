import { describe, expect, it } from "vitest";
import { usbFiles } from "./qa-portable";
import { DEFAULT } from "./qa-settings";

describe("USB package", () => {
  const f = usbFiles(DEFAULT, "https://example.app");
  it("has a launcher, settings and a Reports folder per scanner", () => {
    expect(f["CTQA/Start CT QA.bat"]).toContain('start "" "https://example.app"');
    expect(Object.keys(f).filter((k) => k.startsWith("CTQA/Reports/"))).toHaveLength(DEFAULT.sources.length);
  });
  it("never puts a password in the package", () => {
    expect(JSON.stringify(f).toLowerCase()).not.toContain("password\":");
  });
});
