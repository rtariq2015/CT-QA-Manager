import { useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, HardDrive } from "lucide-react";
import type { Report } from "@/lib/qa-data";
import { folderParts, tidyFileName } from "@/lib/qa-library";
import { Pill } from "@/components/qa/ui";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Explorer-style view of the organized library: Scanner → Year → Month → Type → PDFs. */
export function FolderExplorer({ reports }: { reports: Report[] }) {
  const [path, setPath] = useState<string[]>([]);
  const inHere = useMemo(() => reports.filter((r) => { const p = folderParts(r); return path.every((x, i) => p[i] === x); }), [reports, path]);
  const depth = path.length;
  const folders = useMemo(() => {
    if (depth >= 4) return [];
    const m = new Map<string, { count: number; bad: number }>();
    for (const r of inHere) {
      const k = folderParts(r)[depth]!; const e = m.get(k) ?? { count: 0, bad: 0 };
      e.count++; if (r.printedStatus === "NOT OK") e.bad++; m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => depth === 1 || depth === 2 ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]));
  }, [inHere, depth]);
  const files = depth >= 4 ? [...inHere].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const label = (k: string) => depth === 2 && /^\d{2}/.test(k) ? `${k} ${MONTHS[Number(k.slice(0, 2)) - 1] ?? ""}`.trim() : k;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 border-b bg-muted/50 px-3 py-2 text-sm">
        <button onClick={() => setPath([])} className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-background"><HardDrive className="size-4" />QA Library</button>
        {path.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <button onClick={() => setPath(path.slice(0, i + 1))} className="rounded px-1.5 py-0.5 hover:bg-background">{p}</button>
          </span>
        ))}
      </nav>
      {inHere.length === 0 ? <p className="p-8 text-center text-muted-foreground">No reports yet — click Open folder.</p> : depth < 4 ? (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
          {folders.map(([k, e]) => (
            <button key={k} onDoubleClick={() => setPath([...path, k])} onClick={() => setPath([...path, k])}
              className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-3 text-center hover:border-border hover:bg-muted">
              <Folder className="size-12 fill-warn/30 text-warn" strokeWidth={1.5} />
              <span className="line-clamp-2 text-sm font-medium">{label(k)}</span>
              <span className="text-xs text-muted-foreground">{e.count} PDF{e.count === 1 ? "" : "s"}</span>
              {e.bad > 0 && <Pill tone="bad">{e.bad} NOT OK</Pill>}
            </button>
          ))}
        </div>
      ) : (
        <ul className="divide-y">
          {files.map((r) => (
            <li key={r.id}>
              <button disabled={!r.originalUrl} onClick={() => r.originalUrl && window.open(r.originalUrl, "_blank")}
                className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm", r.originalUrl ? "hover:bg-muted" : "cursor-default")}>
                <FileText className="size-5 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{tidyFileName(r)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.originalUrl ? `Original: ${r.fileName} · click to open` : "Original PDF unavailable"}</span>
                </span>
                <Pill tone={r.printedStatus === "NOT OK" ? "bad" : "ok"}>{r.printedStatus === "NOT OK" ? "NOT OK" : "OK"}</Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
