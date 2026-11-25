import { Link, Outlet } from "@tanstack/react-router";
import { Activity, CalendarCheck, ClipboardCheck, FileStack, LayoutDashboard, Moon, Sun, FolderTree, Download, Settings, HelpCircle, Keyboard, MoreHorizontal, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { useQa } from "@/lib/qa-store";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type NavItem = { to: "/" | "/review" | "/reports" | "/monthly" | "/trends" | "/folders" | "/exports" | "/settings" | "/help"; label: string; icon: LucideIcon };
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LiveLogView, useLog } from "./LiveLog";
import { ScannerLights } from "./FolderStatus";
import { Button } from "@/components/ui/button";
import { log } from "@/lib/qa-logger";
import { useFolderReader } from "./useFolderReader";
import { desktop } from "@/lib/qa-desktop";
import { Library } from "lucide-react";

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Daily work", items: [
    { to: "/", label: "Today", icon: LayoutDashboard },
    { to: "/review", label: "Review", icon: ClipboardCheck },
  ] },
  { label: "Records", items: [
    { to: "/reports", label: "Reports", icon: FileStack },
    { to: "/monthly", label: "Monthly", icon: CalendarCheck },
    { to: "/trends", label: "Trends", icon: Activity },
  ] },
  { label: "Library", items: [
    { to: "/folders", label: "Folders", icon: FolderTree },
    { to: "/exports", label: "Exports", icon: Download },
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/help", label: "Help & guide", icon: HelpCircle },
  ] },
];
const MOBILE_MAIN: string[] = ["/", "/review", "/reports", "/monthly"];
const ALL = GROUPS.flatMap((g) => g.items);

const SHORTCUTS: [string, string][] = [
  ["D", "File as Daily"], ["M", "File as Monthly"], ["O", "File as Other"],
  ["Z", "Undo last filing"], ["J / K", "Next / previous report"], ["?", "Show this list"],
];

export function AppShell() {
  const { today, pending, failedImports, theme, toggleTheme } = useQa();
  useFolderReader(undefined, true);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(!!desktop()), []);
  const [keys, setKeys] = useState(false);
  const [more, setMore] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const entries = useLog();
  const [seenErr, setSeenErr] = useState(0);
  const lastErr = entries.reduce((m, e) => e.level === "error" ? Math.max(m, e.id) : m, 0);
  useEffect(() => { if (logOpen) setSeenErr(lastErr); }, [logOpen, lastErr]);
  useEffect(() => {
    const onErr = (e: ErrorEvent) => log("error", "app", `App error: ${e.message}`);
    const onRej = (e: PromiseRejectionEvent) => log("error", "app", `App error: ${String((e.reason as Error)?.message ?? e.reason)}`);
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "?") { e.preventDefault(); setKeys((k) => !k); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needsReview = pending.length + failedImports.length;
  const badge = (to: string) => to === "/review" && needsReview > 0 && (
    <span className="ml-auto rounded-full bg-sidebar-primary px-2 text-xs font-semibold text-sidebar-primary-foreground">{needsReview}</span>
  );
  const linkCls = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const active = { className: "bg-sidebar-accent !text-sidebar-accent-foreground font-medium" };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:w-56">
        <Brand />
        <nav className="flex flex-col gap-5 overflow-y-auto px-3" aria-label="Workspaces">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">{g.label}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className={linkCls} activeProps={active}>
                    <Icon className="size-4.5" /><span>{label}</span>{badge(to)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <p className="mt-auto p-5 text-xs leading-relaxed text-sidebar-foreground/70">QA PDFs are processed locally.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-bar sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-3 border-b bg-background/90 px-4 py-2 backdrop-blur md:px-8">
          <div className="md:hidden"><Brand small /></div>
          <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1"><ScannerLights /></div>
          <div className="ml-auto flex items-center gap-1">
            {isDesktop && (
              <Button variant="outline" className="px-3" aria-label="Open saved PDFs folder" title="Open the QA Library folder with every saved PDF, organized by scanner, year, month and type"
                onClick={async () => { const r = await desktop()?.openLibrary(); if (r && !r.ok) log("error", "folder", `Could not open ${r.path}: ${r.error}`); }}>
                <Library className="size-4" /><span className="hidden lg:inline">Open saved PDFs</span>
              </Button>
            )}
            <button onClick={() => setLogOpen(true)} className="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" aria-label="Live activity log">
              <ScrollText className="size-4" /><span className="hidden lg:inline">Log</span>
              {lastErr > seenErr && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />}
            </button>
            <button onClick={() => setKeys(true)} className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted md:flex" aria-label="Keyboard shortcuts">
              <Keyboard className="size-4" /><span className="hidden lg:inline">Shortcuts</span>
            </button>
            <button onClick={toggleTheme} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted" aria-label="Switch light or dark mode">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="hidden lg:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
          {today && <Outlet />}
        </main>
      </div>

      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-sidebar text-sidebar-foreground md:hidden" aria-label="Main">
        {ALL.filter((i) => MOBILE_MAIN.includes(i.to)).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="relative flex flex-col items-center gap-0.5 py-2 text-xs text-sidebar-foreground/70" activeProps={{ className: "!text-sidebar-primary font-medium" }}>
            <Icon className="size-5" />{label}
            {to === "/review" && needsReview > 0 && <span className="absolute right-3 top-1 rounded-full bg-sidebar-primary px-1.5 text-[11px] text-sidebar-primary-foreground">{needsReview}</span>}
          </Link>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-xs text-sidebar-foreground/70"><MoreHorizontal className="size-5" />More</button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom">
          <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-2 p-4">
            {ALL.filter((i) => !MOBILE_MAIN.includes(i.to)).map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-md border p-3"><Icon className="size-5" />{label}</Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={logOpen} onOpenChange={setLogOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
          <SheetHeader><SheetTitle>Live activity log</SheetTitle></SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4"><LiveLogView /></div>
        </SheetContent>
      </Sheet>

      <Dialog open={keys} onOpenChange={setKeys}>
        <DialogContent>
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            {SHORTCUTS.map(([k, d]) => [<dt key={k}><kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-sm">{k}</kbd></dt>, <dd key={d}>{d}</dd>])}
          </dl>
          <p className="text-sm text-muted-foreground">Filing keys work on the Review page.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Brand({ small }: { small?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", small ? "" : "px-5 py-5")}>
      <div className="grid size-8 place-items-center rounded-full border-2 border-primary md:border-sidebar-primary">
        <div className="size-2.5 rounded-full bg-primary md:bg-sidebar-primary" />
      </div>
      <p className="font-semibold leading-tight">CT QA Manager</p>
    </div>
  );
}
