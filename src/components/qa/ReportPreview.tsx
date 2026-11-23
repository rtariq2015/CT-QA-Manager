import { tidyFileName } from "@/lib/qa-library";
import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { METRICS, isOutOfLimit, scannerById, type Report } from "@/lib/qa-data";
import { Pill } from "./ui";

const format = (value: number, unit: string) => unit === "1/HUcm" ? value.toExponential(2) : String(value);

export function ReportPreview({ report, highlightPage, initialView = "readings" }: { report: Report; highlightPage?: number; initialView?: "readings" | "pdf" }) {
  const scanner = scannerById(report.scanner);
  const [tube, setTube] = useState("all");
  const [showPdf, setShowPdf] = useState(initialView === "pdf" && Boolean(report.originalUrl));
  const tubes = [...new Set(report.measurements.flatMap(m => m.tube ? [m.tube] : []))];
  const pages = Array.from({ length: report.pages }, (_, i) => i + 1);
  const status = report.printedStatus ?? "Not available";
  return (
    <div className="min-w-0 space-y-4">
      <header className="space-y-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="muted">Local PDF</Pill>
          <Pill tone={status === "NOT OK" ? "bad" : status === "OK" ? "ok" : "muted"}>Printed result: {status}</Pill>
          <Pill tone="muted">{report.needsReview ? "Filing pending" : `Filed as ${report.type}`}</Pill>
        </div>
        <h2 className="break-words text-lg font-semibold">{scanner.model}</h2>
        <p className="break-all font-mono text-sm font-medium">{tidyFileName(report)}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">Original file: {report.fileName} · {report.date} {report.time}</p>
        {report.originalUrl
          ? <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={showPdf ? "default" : "outline"} aria-pressed={showPdf} onClick={() => setShowPdf(v => !v)}><FileText />{showPdf ? "Show readings" : "View PDF"}</Button>
              <Button asChild variant="outline" size="sm"><a href={report.originalUrl} download={tidyFileName(report)}>Save as {tidyFileName(report)}</a></Button>
              <Button asChild variant="outline" size="sm"><a href={report.originalUrl} target="_blank" rel="noreferrer">Open in new tab <ExternalLink /></a></Button>
            </div>
          : <p className="text-xs text-muted-foreground">The PDF is available for reports you open with "Open local PDFs" or Folders.</p>}
        {tubes.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Tube filter">{["all", ...tubes].map(t => <Button key={t} size="sm" variant={tube === t ? "default" : "outline"} aria-pressed={tube === t} onClick={() => setTube(t)}>{t === "all" ? "Both tubes" : `Tube ${t}`}</Button>)}</div>}
        {report.extractionNotes?.map(note => <p key={note} className="text-sm text-warn-foreground dark:text-warn">{note}</p>)}
      </header>
      {showPdf && report.originalUrl && <iframe title={`PDF ${report.fileName}`} src={report.originalUrl} className="h-[75vh] w-full rounded-md border bg-card" />}
      {!showPdf && pages.map(page => {
        const ms = report.measurements.filter(m => m.page === page && (tube === "all" || !m.tube || m.tube === tube));
        const sections = report.printedSections?.filter(s => s.page === page) ?? [];
        if (!ms.length && !sections.length && page !== 1) return null;
        return <section key={page} id={`page-${page}`} aria-label={`Page ${page}`} className={`min-w-0 rounded-md border bg-card p-4 text-sm ${highlightPage === page ? "ring-2 ring-primary" : ""}`}>
          <div className="flex flex-wrap justify-between gap-2 border-b pb-2 font-mono text-xs text-muted-foreground"><span>SIEMENS · {report.software ?? scanner.software}</span><span>Page {page}/{report.pages}</span></div>
          {sections.length > 0 && <ul className="my-3 space-y-2">{sections.map(s => <li key={s.label} className="flex flex-wrap items-center justify-between gap-2"><span>{s.label}</span><Pill tone={s.status === "NOT OK" ? "bad" : "ok"}>{s.status}</Pill></li>)}</ul>}
          {ms.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead className="text-xs text-muted-foreground"><tr>{["Test / context", "Value", "Reference", "Limits", "Result"].map(h => <th key={h} className="px-2 py-2 font-normal">{h}</th>)}</tr></thead>
            <tbody>{ms.map((m, i) => <tr key={i} className={`border-t ${isOutOfLimit(m) ? "text-destructive" : ""}`}>
              <td className="max-w-64 px-2 py-2"><span className="font-medium">{METRICS.find(x => x.id === m.metric)?.label}</span><span className="block text-xs text-muted-foreground">{m.context}</span></td>
              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{format(m.value, m.unit)} {m.unit}</td>
              <td className="px-2 py-2 font-mono text-xs">{m.baseline === null ? "—" : format(m.baseline, m.unit)}{m.referenceDate && <span className="block text-muted-foreground">{m.referenceDate}</span>}</td>
              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{format(m.lower, m.unit)} … {format(m.upper, m.unit)}<span className="block text-muted-foreground">Printed · {m.unit}</span></td>
              <td className="px-2 py-2 text-xs">{isOutOfLimit(m) ? "Out of limit" : "Within limits"}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>;
      })}
    </div>
  );
}