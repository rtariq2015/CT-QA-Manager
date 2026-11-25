import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeBackup, parseBackup } from "./qa-backup";
import { DEFAULT } from "./qa-settings";

const { writeOffsiteBackup } = createRequire(import.meta.url)("../../electron/offsite-backup.cjs") as {
  writeOffsiteBackup(folder: string, library: string, settings?: string): Promise<string>;
};

it("writes a safe sync test and a separate dated backup with every report category", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ctqa-offsite-test-"));
  try {
    const archive = join(temporary, "QA Library");
    const destination = join(temporary, "synthetic Drive");
    await mkdir(destination);
    const reports = ["Daily", "Monthly", "Other"].map((type) => join("Xcite", "2026", "11", type, "qa.pdf"));
    reports.push(join("Review Inbox", "unreadable.pdf"));
    for (const relative of reports) {
      await mkdir(join(archive, relative, ".."), { recursive: true });
      await writeFile(join(archive, relative), relative);
    }
    await mkdir(join(archive, ".catalog"));
    await writeFile(join(archive, ".catalog", "catalog.json"), "{}");
    await writeFile(join(archive, "Review Inbox", "review.json"), "{}");
    await writeFile(join(archive, "logins.json"), "synthetic credential fixture");

    const marker = await writeOffsiteBackup(destination, archive);
    expect(await readFile(marker, "utf8")).toMatch(/^Synthetic CT QA Manager sync test/);
    expect(await readdir(destination)).toHaveLength(1);
    await expect(writeOffsiteBackup(join(archive, ".catalog"), archive)).rejects.toThrow("outside the QA Library");

    const backup = makeBackup({ r1: "Monthly" }, DEFAULT);
    const complete = await writeOffsiteBackup(destination, archive, JSON.stringify(backup));
    const copy = join(complete, "QA Library");
    for (const relative of reports) expect(await readFile(join(copy, relative), "utf8")).toBe(relative);
    expect(await readFile(join(copy, ".catalog", "catalog.json"), "utf8")).toBe("{}");
    expect(await readFile(join(copy, "Review Inbox", "review.json"), "utf8")).toBe("{}");
    expect(await readdir(copy)).not.toContain("logins.json");
    expect(parseBackup(await readFile(join(complete, "CTQA-backup.json"), "utf8"))).toEqual(backup);
    expect(await readdir(destination)).toHaveLength(2);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
