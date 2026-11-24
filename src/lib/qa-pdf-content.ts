import type { PdfTextPage } from "./qa-parser";

/** Siemens sometimes generates a two-page shell without a report or scanner details. */
export function hasOnlyContentsAndPageNumbers(pages: PdfTextPage[]) {
  if (pages.length !== 2) return false;
  const [first, second] = pages.map(({ lines }) => lines.map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean));
  if (first?.length !== 2 || first[0] !== "Table of Contents" || second?.length !== 1) return false;
  const stamp = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) Page: 1 \/ 2$/.exec(first[1] ?? "")?.[1];
  return Boolean(stamp && second[0] === `${stamp} Page: 2 / 2`);
}
