import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { desktop } from "@/lib/qa-desktop";
import { clearLog, exportDiagnostic, exportText, getConnection, getLog, subscribe, type Connection, type LogEntry } from "@/lib/qa-logger";
import { folderRows, unmatchedFolders, normalizeConfig, SETTINGS_KEY, DEFAULT, type Source } from "@/lib/qa-settings";
import { useQa } from "@/lib/qa-store";

const EMPTY: LogEntry[] = [];
const IDLE: Connection = { state: "idle", kind: "local", done: 0, total: 0, failed: 0, opened: [], checks: {} };
export const useLog = () => useSyncExternalStore(subscribe, getLog, () => EMPTY);
export const useConnection = () => useSyncExternalStore(subscribe, getConnection, () => IDLE);

/** The scanner folders saved on the Settings page (the defaults until something is saved). */
export function useConfiguredFolders(): Source[] {
  const raw = useSyncExternalStore(subscribeSettings, savedSettings, () => null);
  return useMemo(() => {
    try { return raw ? normalizeConfig(JSON.parse(raw)).sources : DEFAULT.sources; }
    catch { return DEFAULT.sources; }
  }, [raw]);
}

function savedSettings() {
  try { return localStorage.getItem(SETTINGS_KEY); }
  catch { return null; }
}

function subscribeSettings(notify: () => void) {
  window.addEventListener("ctqa:settings", notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener("ctqa:settings", notify); window.removeEventListener("storage", notify); };
}

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

const TONE: Record<LogEntry["level"], string> = {
  info: "text-primary", success: "text-ok", warning: "text-warn", error: "text-destructive",
};

export function ConnectionPill({ onClick }: { onClick: () => void }) {
  const c = useConnection();
  const sources = useConfiguredFolders();
  const matched = folderRows(sources, c.opened).filter((r) => r.opened).length;
  const extra = unmatchedFolders(sources, c.opened).length;
  const label = c.state === "reading"
    ? `Reading ${c.done} of ${c.total}…`
    : c.opened.length === 0
      ? "No folder connected"
      : sources.length === 0
        ? `${c.opened.length} folder${c.opened.length === 1 ? "" : "s"} open`
        : `${matched} of ${sources.length} folders connected${extra ? ` · ${extra} other` : ""}`;
  const dot = c.state === "reading" ? "bg-warn animate-pulse" : c.opened.length === 0 ? "bg-destructive" : matched || extra ? "bg-ok" : "bg-warn";
  return (
    <button onClick={onClick} className="flex max-w-[15rem] items-center gap-2 truncate rounded-full border px-3 py-1.5 text-xs hover:bg-muted" aria-label="Folder connection status">
      <span className={cn("size-2.5 shrink-0 rounded-full", dot)} /><span className="truncate">{label}</span>
    </button>
  );
}

export function LiveLogView({ tall }: { tall?: boolean }) {
  const all = useLog();
  const qa = useQa();
  const [filter, setFilter] = useState<"all" | "problems" | "files">("all");
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const rows = all.filter((e) =>
    (filter === "all" || (filter === "problems" ? e.level === "warning" || e.level === "error" : e.area === "file" || e.area === "folder")) &&
    (!q || e.message.toLowerCase().includes(q.toLowerCase())));
  useEffect(() => { if (!paused && box.current) box.current.scrollTop = box.current.scrollHeight; }, [rows.length, paused]);
  const day = new Date().toISOString().slice(0, 10);
  const diag = () => save(`CTQA-diagnostic-${day}.json`, exportDiagnostic({
    app: desktop() ? "desktop" : "web", reports: qa.reports.length,
    waitingInReview: qa.pending.length + qa.failedImports.length,
  }), "application/json");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "problems", "files"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "problems" ? "Problems only" : "Files"}</Button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search log" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
      </div>
      <div ref={box} className={cn("overflow-y-auto rounded-md border bg-muted/40 p-2 font-mono text-xs leading-relaxed", tall ? "h-[28rem]" : "min-h-0 flex-1")}>
        {rows.length === 0 ? <p className="p-4 text-center text-muted-foreground">Nothing yet. Open a folder or some PDFs and each step shows up here.</p>
          : rows.map((e) => (
            <div key={e.id} className="flex gap-2 border-b border-border/40 py-1 last:border-0">
              <span className="shrink-0 text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
              <span className={cn("w-16 shrink-0 font-semibold uppercase", TONE[e.level])}>{e.level}</span>
              <span className="break-all">{e.message}</span>
            </div>
          ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>{paused ? <Play /> : <Pause />}{paused ? "Resume scrolling" : "Pause scrolling"}</Button>
        <Button size="sm" onClick={() => save(`CTQA-log-${day}.txt`, exportText(), "text/plain")}><Download />Download log</Button>
        <Button size="sm" variant="outline" onClick={diag}><Download />Download diagnostic file</Button>
        <Button size="sm" variant="ghost" onClick={clearLog}><Trash2 />Clear</Button>
      </div>
      <p className="text-xs text-muted-foreground">Share the diagnostic file for scan totals, timings, and error codes. The detailed log can contain file and folder names.</p>
    </div>
  );
}
