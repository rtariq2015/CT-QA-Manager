import { log } from "./qa-logger";
import { desktop } from "./qa-desktop";
import { ALL_SCANNERS, type Report, type ReportType } from "./qa-data";

const MONTHS = ["01-January","02-February","03-March","04-April","05-May","06-June","07-July","08-August","09-September","10-October","11-November","12-December"];
export const SCANNER_FOLDER = { xcite: "CT Xcite", flash: "CT Flash", edge: "CT Edge", drive: "MDP Building" } as const;
const TYPE_FOLDER = { Daily: "Daily_QA", Monthly: "Monthly_QA", Other: "Other" } as const;

const NAME_TOKEN = { xcite: "EXCITE", flash: "FLASH", edge: "EDGE", drive: "DRIVE" } as const;
const TYPE_TOKEN = { Daily: "QA", Monthly: "MONTHLY_QA", Other: "OTHER_QA" } as const;

/** Readable name for saved copies, e.g. CT_EXCITE_QA_11-23-2026.pdf (scanner-generated names like serviceReport_<id>.pdf are unreadable). The original file is never renamed. */
export function tidyFileName(r: Report, withTime = false): string {
  const [y = "0000", m = "01", d = "01"] = r.date.split("-");
  const time = withTime ? `_${r.time.slice(0, 5).replace(":", "")}` : "";
  return `CT_${NAME_TOKEN[r.scanner]}_${TYPE_TOKEN[r.type]}_${m}-${d}-${y}${time}.pdf`;
}

/** Folder path + tidy name; adds the time when two reports would share a name. */
export function savedPaths(reports: Report[]): Map<string, string> {
  const out = new Map<string, string>(); const used = new Set<string>();
  for (const r of reports) {
    let path = [...folderParts(r), tidyFileName(r)].join("/");
    if (used.has(path)) path = [...folderParts(r), tidyFileName(r, true)].join("/");
    let n = 2; const base = path; while (used.has(path)) path = base.replace(/\.pdf$/, `_${n++}.pdf`);
    used.add(path); out.set(r.id, path);
  }
  return out;
}

/** Archive layout mirrored from QA-Manger: Scanner / Year / Month / Report type. */
export function folderParts(r: Report): [string, string, string, string] {
  const scanner = SCANNER_FOLDER[r.scanner];
  const [y = "0000", m = "01"] = r.date.split("-");
  return [scanner, y, MONTHS[Number(m) - 1] ?? m, TYPE_FOLDER[r.type]];
}

const archiveTypes: ReportType[] = ["Daily", "Monthly", "Other"];

export async function saveArchivedReport(report: Report, data?: Uint8Array, original?: Report, source?: string) {
  const bridge = desktop();
  if (!bridge || report.source !== "uploaded" || (!data && !report.originalUrl)) return false;

  const relativePath = (type: ReportType) => {
    const filed = { ...report, type };
    return [...folderParts(filed), tidyFileName(filed)].join("/");
  };
  if (!data) {
    const pdf = await fetch(report.originalUrl!);
    if (!pdf.ok) throw new Error("Could not reopen the local PDF");
    data = new Uint8Array(await pdf.arrayBuffer());
  }
  const previous = archiveTypes.filter((type) => type !== report.type).map(relativePath);
  const result = await bridge.saveCopy(relativePath(report.type), data, previous, {
    reportId: report.id,
    ...(original ? { report: original } : {}),
    ...(source ? { source } : {}),
  });
  if (!result.ok) throw new Error(result.error ?? "Could not update the QA Library");
  if (result.catalogError) log("warning", "folder", result.catalogError);
  return !result.existed;
}

export interface TreeNode { name: string; count: number; notOk: number; children: Map<string, TreeNode> }

export function buildTree(reports: Report[]): TreeNode {
  const root: TreeNode = { name: "Library", count: 0, notOk: 0, children: new Map() };
  for (const r of reports) {
    let node = root;
    const bad = r.printedStatus === "NOT OK" ? 1 : 0;
    node.count++; node.notOk += bad;
    for (const p of folderParts(r)) {
      let next = node.children.get(p);
      if (!next) { next = { name: p, count: 0, notOk: 0, children: new Map() }; node.children.set(p, next); }
      next.count++; next.notOk += bad; node = next;
    }
  }
  return root;
}

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function buildCsv(reports: Report[]): string {
  const head = ["Scanner", "Model", "Date", "Time", "File", "Original file", "Folder", "FilingDecision", "SuggestedType", "PrintedResultStatus", "FlaggedReadings"];
  const rows = reports.map((r) => {
    const s = ALL_SCANNERS.find((x) => x.id === r.scanner);
    return [s?.name ?? r.scanner, s?.model ?? "", r.date, r.time, tidyFileName(r), r.fileName, folderParts(r).join("/"),
      r.needsReview ? "Not filed" : `Filed as ${r.type}`, r.suggested, r.printedStatus ?? "Not available",
      r.measurements.filter((m) => m.value < m.lower || m.value > m.upper).length];
  });
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function buildSummaryHtml(reports: Report[], title: string): string {
  const rows = reports.map((r) => `<tr><td>${esc(ALL_SCANNERS.find((s) => s.id === r.scanner)?.name ?? r.scanner)}</td><td>${r.date} ${r.time}</td><td>${esc(r.fileName)}</td><td>${r.needsReview ? "Not filed" : "Filed as " + r.type}</td><td class="${r.printedStatus === "NOT OK" ? "bad" : ""}">${r.printedStatus ?? "Not available"}</td></tr>`).join("");
  const notOk = reports.filter((r) => r.printedStatus === "NOT OK").length;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 8px;text-align:left}.bad{color:#b00;font-weight:600}</style></head><body><h1>${esc(title)}</h1><p>${reports.length} reports · ${notOk} with printed NOT OK. Filing labels are organisation only, not clinical sign-off.</p><table><thead><tr><th>Scanner</th><th>Date</th><th>File</th><th>Filing</th><th>Printed result</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** ZIP with organised PDFs (when the original file is loaded locally) + CSV + HTML summary. */
export async function buildZip(reports: Report[], title: string): Promise<{ zip: Uint8Array<ArrayBuffer>; pdfs: number }> {
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {
    "Report list.csv": strToU8(buildCsv(reports)),
    "Report Summary.html": strToU8(buildSummaryHtml(reports, title)),
  };
  let pdfs = 0;
  const paths = savedPaths(reports);
  for (const r of reports) {
    if (!r.originalUrl) continue;
    const buf = new Uint8Array(await (await fetch(r.originalUrl)).arrayBuffer());
    files[paths.get(r.id) ?? [...folderParts(r), r.fileName].join("/")] = buf; pdfs++;
  }
  return { zip: zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>, pdfs };
}
