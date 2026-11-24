import type { ReactNode } from "react";
import { scannerById, type ScannerId } from "@/lib/qa-data";
import { cn } from "@/lib/utils";

export const scanColor: Record<ScannerId, string> = {
  xcite: "var(--scan-xcite)", flash: "var(--scan-flash)", edge: "var(--scan-edge)", drive: "var(--scan-drive)",
};

export function ScannerDot({ id, className }: { id: ScannerId; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: scanColor[id] }} aria-hidden />;
}

export function ScannerLabel({ id }: { id: ScannerId }) {
  const s = scannerById(id);
  return <span className="inline-flex items-center gap-2"><ScannerDot id={id} /><span className="font-medium">{s.name}</span><span className="text-muted-foreground">{s.model.replace("SOMATOM ", "")}</span></span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: ReactNode }) {
  const map = {
    ok: "bg-ok/15 text-ok border-ok/30",
    warn: "bg-warn/20 text-warn-foreground border-warn/40 dark:text-warn",
    bad: "bg-destructive/12 text-destructive border-destructive/30",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium", map[tone])}>{children}</span>;
}

export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
