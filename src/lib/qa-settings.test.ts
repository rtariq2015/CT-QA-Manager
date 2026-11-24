import { describe, expect, it } from "vitest";
import { buildSettingsJson, parseSettingsJson, kindOf, normalizeConfig, folderMatches, folderRows, unmatchedFolders, DEFAULT, type Config, type OpenedFolder, type Source } from "./qa-settings";

const cfg = (sources: Source[]): Config => ({ ...DEFAULT, sources });
const parse = (text: string) => JSON.parse(text) as {
  Sources: { Name: string; Path: string; Type: string; Username: string; CredentialTarget: string }[];
};
const opened = (name: string, count = 5): OpenedFolder => ({ name, kind: "local", count, at: "2026-11-23T15:00:00.000Z" });

describe("kindOf", () => {
  it("reads a drive letter as local and a share as network when nothing was picked", () => {
    expect(kindOf({ name: "CT Xcite", path: "E:\\EXCITE-ED" })).toBe("local");
    expect(kindOf({ name: "CT Edge", path: "\\\\server\\CTQA\\CT Edge" })).toBe("network");
  });

  it("lets the hand-picked type win over the path", () => {
    expect(kindOf({ name: "CT Xcite", path: "E:\\EXCITE-ED", kind: "network" })).toBe("network");
    expect(kindOf({ name: "CT Edge", path: "\\\\server\\CTQA\\CT Edge", kind: "local" })).toBe("local");
  });
});

describe("buildSettingsJson", () => {
  it("marks a local folder Local with no login at all", () => {
    const out = parse(buildSettingsJson(cfg([{ name: "CT Xcite", path: "E:\\EXCITE-ED", user: "HOSPITAL\\qa", kind: "local" }])));
    expect(out.Sources[0]).toMatchObject({ Name: "CT Xcite", Type: "Local", Username: "", CredentialTarget: "" });
  });

  it("marks a network folder Network and keeps the username plus credential target", () => {
    const out = parse(buildSettingsJson(cfg([{ name: "CT Edge", path: "\\\\server\\CTQA\\CT Edge", user: "HOSPITAL\\qa", kind: "network" }])));
    expect(out.Sources[0]).toMatchObject({ Type: "Network", Username: "HOSPITAL\\qa", CredentialTarget: "CTQA:CT Edge" });
  });

  it("exports the schedule and due day as picked", () => {
    const out = JSON.parse(buildSettingsJson({ ...DEFAULT, dueDay: 15, days: "weekdays", sync: "60" })) as {
      MonthlyDueDay: number; DailySchedule: string; SyncMinutes: string;
    };
    expect(out).toMatchObject({ MonthlyDueDay: 15, DailySchedule: "weekdays", SyncMinutes: "60" });
  });
});

describe("normalizeConfig", () => {
  it("keeps the picked folder type and username through a round trip", () => {
    const back = parseSettingsJson(buildSettingsJson(DEFAULT));
    expect(back.sources.map((s) => s.kind)).toEqual(["network", "network", "network", "local"]);
    expect(back.sources[3]).toMatchObject({ name: "CT Xcite", path: "E:\\EXCITE-ED" });
  });

  it("falls back to defaults for junk and clamps a bad due day", () => {
    expect(normalizeConfig("nope").sources.length).toBe(DEFAULT.sources.length);
    expect(normalizeConfig({ sources: [], dueDay: 99 }).dueDay).toBe(DEFAULT.dueDay);
    expect(normalizeConfig({ sources: [], dueDay: 99 }).sources).toEqual([]);
    expect(normalizeConfig({ sources: [{ path: 5 }], dueDay: 12 }).sources).toEqual([]);
  });

  it("drops an unknown folder type so the path decides again", () => {
    const back = normalizeConfig({ sources: [{ name: "CT Edge", path: "C:\\Desktop\\QA", kind: "usb" }], dueDay: 10 });
    const first = back.sources[0];
    if (!first) throw new Error("The folder should have been kept.");
    expect(first.kind).toBeUndefined();
    expect(kindOf(first)).toBe("local");
  });
});

describe("folder connection status", () => {
  const xcite: Source = { name: "CT Xcite", path: "E:\\EXCITE-ED", kind: "local" };
  const edge: Source = { name: "CT Edge", path: "\\\\server\\CTQA\\CT Edge", kind: "network" };

  it("matches an opened folder by the folder name in the path", () => {
    expect(folderMatches(xcite, opened("EXCITE-ED"))).toBe(true);
    expect(folderMatches(edge, opened("CT Edge"))).toBe(true);
    expect(folderMatches(xcite, opened("CT Flash"))).toBe(false);
  });

  it("matches by scanner name ignoring case, spaces and punctuation", () => {
    expect(folderMatches(xcite, opened("ct xcite"))).toBe(true);
    expect(folderMatches(edge, opened("CTEDGE"))).toBe(true);
    expect(folderMatches(xcite, opened(""))).toBe(false);
  });

  it("marks only the folder that was actually opened as connected", () => {
    const rows = folderRows([xcite, edge], [opened("EXCITE-ED", 8)]);
    expect(rows.map((r) => Boolean(r.opened))).toEqual([true, false]);
    expect(rows[0]?.opened?.count).toBe(8);
    expect(rows[1]?.opened).toBeUndefined();
  });

  it("lists an opened folder that no scanner points at", () => {
    const loose = opened("Random Scans", 2);
    expect(unmatchedFolders([xcite, edge], [opened("EXCITE-ED"), loose])).toEqual([loose]);
    expect(unmatchedFolders([xcite, edge], [opened("EXCITE-ED")])).toEqual([]);
  });
});


it("reads a copied Windows settings file and rejects an invalid replacement", () => {
  const original = cfg([{ name: "CT Edge", path: "\\\\server\\QA", user: "HOSPITAL\\qa", kind: "network" }]);
  expect(parseSettingsJson("\uFEFF" + buildSettingsJson(original))).toEqual(original);
  expect(() => parseSettingsJson('{"Sources":[]}')).toThrow("Invalid QA schedule");
  expect(() => parseSettingsJson(buildSettingsJson(cfg([{ name: "", path: "C:/QA", kind: "local" }])))).toThrow("Invalid scanner");
});
