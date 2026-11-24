import { createRequire } from "node:module";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import type { Report } from "./qa-data";

type RecordInput = { reportId: string; report?: Report; target: string; bytes: Buffer; source?: string };
interface Catalog {
  save(input: RecordInput): void;
  hasSource(source: string): boolean;
  reports(url: string): Report[];
  fileForReport(reportId: string): string | undefined;
  pdf(key: string): string | undefined;
}
const { createCatalog, sourceFingerprint } = createRequire(import.meta.url)("../../electron/catalog.cjs") as {
  createCatalog(root: () => string): Catalog;
  sourceFingerprint(file: string, stat: ReturnType<typeof statSync>): string;
};

it("reopens parsed reports, tracks moved originals and invalidates missing or changed PDFs", () => {
  const folder = mkdtempSync(join(tmpdir(), "ctqa-catalog-test-"));
  try {
    const bytes = Buffer.from("%PDF-example");
    const sourceFile = join(folder, "source.pdf");
    const target = join(folder, "archive.pdf");
    writeFileSync(sourceFile, bytes);
    writeFileSync(target, bytes);
    const originalStamp = sourceFingerprint(sourceFile, statSync(sourceFile));
    const report: Report = {
      id: "example", fileName: "source.pdf", scanner: "drive", type: "Other", suggested: "Daily",
      date: "2026-11-23", time: "08:00", sizeKb: 1, confidence: "uncertain",
      needsReview: true, measurements: [], pages: 1, source: "uploaded", originalUrl: "blob:temporary",
    };
    createCatalog(() => folder).save({ reportId: report.id, report, target, bytes, source: originalStamp });

    const reopened = createCatalog(() => folder);
    expect(reopened.hasSource(originalStamp)).toBe(true);
    const saved = reopened.reports("ctqa://app/")[0]!;
    expect(saved).toMatchObject({ id: report.id, needsReview: true, originalUrl: expect.stringMatching(/^ctqa:/) });
    const key = saved.originalUrl!.split("/").at(-1)!.slice(0, -4);
    expect(reopened.pdf(key)).toBe(target);
    expect(reopened.fileForReport(report.id)).toBe(target);

    const moved = join(folder, "moved.pdf");
    writeFileSync(moved, bytes);
    reopened.save({ reportId: report.id, target: moved, bytes });
    rmSync(target);
    expect(reopened.pdf(key)).toBe(moved);
    expect(reopened.hasSource(originalStamp)).toBe(true);

    writeFileSync(sourceFile, Buffer.from("%PDF-with-new-bytes"));
    expect(reopened.hasSource(sourceFingerprint(sourceFile, statSync(sourceFile)))).toBe(false);
    rmSync(moved);
    expect(reopened.hasSource(originalStamp)).toBe(false);
    expect(reopened.reports("ctqa://app/")[0]?.originalUrl).toBeUndefined();
    expect(reopened.pdf("../../private")).toBeUndefined();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
