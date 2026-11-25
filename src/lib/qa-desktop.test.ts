import { createRequire } from "node:module";
import { mkdtempSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import type { FolderBatch } from "./qa-desktop";
import type { Source } from "./qa-settings";

const require = createRequire(import.meta.url);
const { createFolderScan } = require("../../electron/folder-scan.cjs") as {
  createFolderScan(dir: string, hasSource: (fingerprint: string) => boolean): Promise<{ total: number; next(): Promise<FolderBatch> }>;
};
const { sourceFingerprint } = require("../../electron/catalog.cjs") as {
  sourceFingerprint(file: string, stat: ReturnType<typeof statSync>): string;
};

it("reads one bounded batch at a time, preserving unchanged and unreadable counts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ctqa-batch-test-"));
  try {
    for (let i = 0; i < 9; i++) writeFileSync(join(dir, `sample-${i}.pdf`), "%PDF-fixture");
    const oversized = join(dir, "large.PDF");
    writeFileSync(oversized, "%PDF-fixture");
    truncateSync(oversized, 17 * 1024 * 1024);
    writeFileSync(join(dir, "ignore.txt"), "fixture");
    const cached = join(dir, "sample-0.pdf");
    const fingerprint = sourceFingerprint(cached, statSync(cached));
    const scan = await createFolderScan(dir, (key) => key === fingerprint);
    expect(scan.total).toBe(10);
    rmSync(join(dir, "sample-1.pdf"));
    const delivered: string[] = [];
    let unchanged = 0;
    const unreadable: string[] = [];
    for (let i = 0; i < scan.total; i++) {
      const batch = await scan.next();
      expect(batch.files.length + batch.unchanged + batch.unreadableFiles.length).toBeLessThanOrEqual(8);
      if (batch.files.some(({ name }) => name === "large.PDF")) expect(batch.files.map(({ name }) => name)).toEqual(["large.PDF"]);
      delivered.push(...batch.files.map(({ name }) => name));
      unreadable.push(...batch.unreadableFiles);
      unchanged += batch.unchanged;
      if (batch.done) break;
    }
    expect(unchanged).toBe(1);
    expect(unreadable).toEqual(["sample-1.pdf"]);
    expect(delivered.sort()).toEqual(["large.PDF", ...Array.from({ length: 7 }, (_, i) => `sample-${i + 2}.pdf`)]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("binds saved credentials to the approved network share and username", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctqa-login-test-"));
  try {
    const legacy = join(dir, "logins.json");
    const scoped = join(dir, "network-logins.json");
    writeFileSync(legacy, JSON.stringify({ Edge: { user: "QA\\reader", pass: Buffer.from("fixture").toString("base64") } }));
    const decryptString = vi.fn(() => "fixture");
    const { createNetworkLogins } = require("../../electron/network-logins.cjs");
    const store = createNetworkLogins(scoped, legacy, {
      isEncryptionAvailable: () => true,
      encryptString: (password: string) => Buffer.from(password),
      decryptString,
    });
    const first: Source = { name: "Edge", path: String.raw`\\qa-a\reports\daily`, user: "QA\\reader", kind: "network" };
    expect(store.connection(first)).toEqual({ status: "legacy", root: String.raw`\\qa-a\reports` });
    expect(decryptString).not.toHaveBeenCalled();
    expect(store.approveLegacy(first)).toBe(true);
    expect(store.connection({ ...first, name: "Renamed Edge", path: "//QA-A/REPORTS/monthly" })).toMatchObject({ status: "saved", login: { user: first.user } });
    expect(store.connection({ ...first, path: String.raw`\\qa-b\reports` })).toEqual({ status: "legacy", root: String.raw`\\qa-b\reports` });
    expect(store.connection({ ...first, path: String.raw`\\qa-a\other` })).toEqual({ status: "legacy", root: String.raw`\\qa-a\other` });
    expect(store.connection({ ...first, user: "QA\\another" })).toEqual({ status: "required", root: String.raw`\\qa-a\reports` });
    expect(decryptString).toHaveBeenCalledTimes(1);

    const second: Source = { ...first, path: String.raw`\\qa-b\reports`, user: "QA\\another" };
    store.save(second, "placeholder");
    expect(store.connection(second)).toMatchObject({ status: "saved", login: { user: second.user } });
    expect(store.status(first)).toBe("saved");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
