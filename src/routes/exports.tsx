import { createFileRoute } from "@tanstack/react-router";
import { SlidersHorizontal, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/qa/ui";
import { SCANNERS, type ScannerId } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { useConnection } from "@/components/qa/LiveLog";
import { buildCsv, buildSummaryHtml, buildZip, download } from "@/lib/qa-library";

export const Route = createFileRoute("/exports")({
  head: () => ({
    meta: [
      { title: "Exports — CT QA Manager Companion" },
      { name: "description", content: "Export filtered CT QA reports as a ZIP with a spreadsheet and printable summary." },
      { property: "og:title", content: "Exports — CT QA Manager Companion" },
      { property: "og:description", content: "Build QA export packages by scanner, year, month and type." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Exports,
});

const sel = "h-11 rounded-md border bg-card px-3";

function Exports() {
  const { reports } = useQa();
  const [scanner, setScanner] = useState<ScannerId | "all">("all");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const active = [scanner, year, month, type, status].filter((v) => v !== "all").length;
  const [busy, setBusy] = useState(false);
  const years = useMemo(() => [...new Set(reports.map((r) => r.date.slice(0, 4)))].sort().reverse(), [reports]);
  const list = useMemo(() => reports.filter((r) =>
    (scanner === "all" || r.scanner === scanner) && (year === "all" || r.date.startsWith(year)) &&
    (month === "all" || r.date.slice(5, 7) === month) && (type === "all" || r.type === type) &&
    (status === "all" || (r.printedStatus ?? "Not available") === status)), [reports, scanner, year, month, type, status]);
  const title = `CT QA export — ${scanner === "all" ? "All scanners" : SCANNERS.find((s) => s.id === scanner)?.name} ${year === "all" ? "" : year}${month === "all" ? "" : "-" + month}`.trim();

  const conn = useConnection();
  const reading = conn.state === "reading";
  const withPdf = list.filter((r) => r.originalUrl).length;
  async function zip() {
    setBusy(true);
    const { zip, pdfs } = await buildZip(list, title);
    download("CTQA-Export.zip", zip, "application/zip"); setBusy(false);
    if (pdfs < list.length) toast.warning(`ZIP ready with ${pdfs} PDFs. ${list.length - pdfs} reports have no PDF open right now — click Open folder for that scanner, wait until reading finishes, then export again.`, { duration: 9000 });
    else toast.success(`ZIP ready: ${pdfs} PDFs included`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Exports" title={`${list.length} reports selected`} />
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">{withPdf} of {list.length} have their PDF open and will be included in the ZIP. PDFs are only available after you open their folder in this session.</p>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" className="h-11"><SlidersHorizontal className="size-4" />Filters{active ? ` (${active})` : ""}</Button></PopoverTrigger>
          <PopoverContent align="start" className="grid w-72 gap-3">
        <select className={sel} value={scanner} onChange={(e) => setScanner(e.target.value as ScannerId | "all")} aria-label="Scanner">
          <option value="all">All scanners</option>{SCANNERS.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.model.replace("SOMATOM ", "")}</option>)}
        </select>
        <select className={sel} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select className={sel} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="all">All months</option>{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => <option key={m} value={m}>{new Date(`2026-${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" })}</option>)}
        </select>
        <select className={sel} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="all">All types</option><option>Daily</option><option>Monthly</option><option>Other</option></select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Printed result"><option value="all">Any printed result</option><option>OK</option><option>NOT OK</option><option>Not available</option></select>
          </PopoverContent>
        </Popover>
        {active > 0 && <Button variant="ghost" className="h-11" onClick={() => { setScanner("all"); setYear("all"); setMonth("all"); setType("all"); setStatus("all"); }}>Clear</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ExportCard icon={<Download />} title="Full package (ZIP)" text="Organized PDFs in scanner / year / month folders, plus the spreadsheet and summary." onClick={zip} disabled={busy || reading || !list.length} label={reading ? "Wait, still reading PDFs…" : busy ? "Building…" : "Download ZIP"} />
        <ExportCard icon={<FileSpreadsheet />} title="Report list (CSV)" text="Spreadsheet for audits: scanner, date, filing, printed result." onClick={() => download("Report list.csv", buildCsv(list), "text/csv")} disabled={!list.length} label="Download CSV" />
        <ExportCard icon={<FileText />} title="Printable summary" text="One-page HTML summary for binders; open and print." onClick={() => download("Report Summary.html", buildSummaryHtml(list, title), "text/html")} disabled={!list.length} label="Download summary" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">PDF files are included only for reports opened from a folder on this computer. "Filed as" is organization only, not clinical sign-off.</p>
    </div>
  );
}

function ExportCard({ icon, title, text, label, onClick, disabled }: { icon: React.ReactNode; title: string; text: string; label: string; onClick: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 font-medium text-primary">{icon}<span className="text-foreground">{title}</span></div>
      <p className="flex-1 text-sm text-muted-foreground">{text}</p>
      <Button onClick={onClick} disabled={disabled}>{label}</Button>
    </div>
  );
}
