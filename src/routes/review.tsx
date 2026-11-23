import { tidyFileName } from "@/lib/qa-library";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ReportType } from "@/lib/qa-data";
import { useQa } from "@/lib/qa-store";
import { reviewAction, reviewReason } from "@/lib/qa-triage";
import { PageHeader, Pill, ScannerLabel, fmtDate } from "@/components/qa/ui";
import { ReportPreview } from "@/components/qa/ReportPreview";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review queue — CT QA Manager Companion" },
      { name: "description", content: "File QA reports as Daily, Monthly or Other with one key press and instant undo." },
      { property: "og:title", content: "Review queue — CT QA Manager Companion" },
      { property: "og:description", content: "Keyboard-first filing of Siemens CT QA reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Review,
});

const CHOICES: { type: ReportType; key: string }[] = [
  { type: "Daily", key: "D" }, { type: "Monthly", key: "M" }, { type: "Other", key: "O" },
];

function Review() {
  const { pending, file, undo, lastFiling } = useQa();
  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const current = pending.find((r) => r.id === currentId) ?? pending[0];

  const doFile = (type: ReportType) => {
    if (!current) return;
    const idx = pending.indexOf(current);
    const next = pending[idx + 1] ?? pending[idx - 1];
    file(current.id, type);
    setCurrentId(next?.id);
    toast.success(`Filed as ${type}`, { description: current.fileName, action: { label: "Undo", onClick: () => { const u = undo(); if (u) setCurrentId(u.id); } } });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toUpperCase();
      const c = CHOICES.find((x) => x.key === k);
      if (c) { e.preventDefault(); doFile(c.type); }
      if (k === "Z") { const u = undo(); if (u) setCurrentId(u.id); }
      if (k === "J" || k === "K") {
        const i = current ? pending.indexOf(current) : 0;
        const n = pending[k === "J" ? i + 1 : i - 1];
        if (n) setCurrentId(n.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Review" title="All caught up" />
        <p className="text-lg text-muted-foreground">Every report is filed. New reports that can't be filed automatically will appear here.</p>
        {lastFiling && <Button variant="outline" onClick={() => undo()} className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-muted"><Undo2 className="size-4" />Undo last filing</Button>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow={`Review · ${pending.length} left`} title="Needs attention">
        <p className="text-sm text-muted-foreground">Clean Daily and Monthly reports are filed automatically; unreadable ones go to Other. Only reports that need a person appear here.</p>
        
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border bg-card p-5">
            <ScannerLabel id={current.scanner} />
            <p className="mt-2 break-all font-mono text-sm">{tidyFileName(current)}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">Original: {current.fileName}</p>
            <p className="text-muted-foreground">{fmtDate(current.date)} · {current.time} · {current.sizeKb} KB · {current.pages} pages</p>
            {reviewReason(current) && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium"><span className="block">Why: {reviewReason(current)}</span><span className="mt-1 block font-normal">What to do: {reviewAction(current)}</span></p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Suggested:</span>
              <Pill tone={current.confidence === "uncertain" ? "warn" : "muted"}>{current.suggested} · {current.confidence}</Pill>
            </div>
            <p className="mt-4 text-sm font-medium">Then file it as</p>
            <div className="mt-2 grid gap-2">
              {CHOICES.map((c) => (
                <Button variant="outline" key={c.type} onClick={() => doFile(c.type)}
                  className={cn("flex items-center justify-between rounded-md border px-4 py-3 text-left text-lg font-medium transition-colors hover:bg-accent",
                    c.type === current.suggested && "border-primary bg-primary/8")}>
                  {c.type}<Kbd>{c.key}</Kbd>
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Filing sorts the document. It is not clinical sign-off.</p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border bg-card" role="list" aria-label="Queue">
            {pending.map((r) => (
              <Button variant="outline" key={r.id} role="listitem" onClick={() => setCurrentId(r.id)}
                className={cn("flex w-full items-center justify-between gap-2 border-b px-4 py-2 text-left text-sm last:border-0 hover:bg-muted", r.id === current.id && "bg-accent")}>
                <ScannerLabel id={r.scanner} /><span className="font-mono text-muted-foreground">{r.date.slice(5)}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="min-w-0"><ReportPreview key={current.id} report={current} /></div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</kbd>;
}


