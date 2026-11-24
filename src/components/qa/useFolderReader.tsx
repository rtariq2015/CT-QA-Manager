import { pdfReadErrorCode } from "@/lib/qa-read-error";
import { useEffect, useRef, useState } from "react";
import { desktop } from "@/lib/qa-desktop";
import { normalizeConfig, parseSettingsJson, SETTINGS_KEY, kindOf } from "@/lib/qa-settings";
import { toast } from "sonner";
import { useQa } from "@/lib/qa-store";
import { startScan } from "@/lib/qa-scan-log";
import { log, markFolderOpened, recordFolderCheck, setConnection } from "@/lib/qa-logger";

type SourcePdf = File & { sourceKey?: string };

type DirHandle = { kind: "directory"; name: string; values(): AsyncIterable<DirHandle | FileHandle>; getDirectoryHandle(n: string, o?: { create: boolean }): Promise<DirHandle>; getFileHandle(n: string, o?: { create: boolean }): Promise<FileHandle> };
type FileHandle = { kind: "file"; name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> };
type Picker = (o?: { mode?: "read" | "readwrite"; startIn?: "desktop" }) => Promise<DirHandle>;

/** The browser's own folder picker, when it has one (Chrome / Edge on Windows). */
export const picker = () => (globalThis as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;

async function* walk(dir: DirHandle): AsyncGenerator<File> {
  for await (const h of dir.values()) {
    if (h.kind === "directory") yield* walk(h);
    else if (h.name.toLowerCase().endsWith(".pdf")) yield h.getFile();
  }
}

/**
 * Opens a folder (or a hand-picked set of PDFs) and files every report it finds.
 * Shared by the top-bar button and the Folders page so both behave identically.
 * Everything stays in this browser tab: the PDFs are never uploaded anywhere.
 */
export function useFolderReader(onDone?: () => void, autoConnect = false) {
  const { addReport, addFailedImport, catalogReadyForScan } = useQa();
  const [busy, setBusy] = useState<string | null>(null);
  const scanning = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function readFiles(files: AsyncIterable<SourcePdf> | SourcePdf[], folder: string, kind: "local" | "network" = "local", sourceReadMs = 0, configuredFolder?: number, unreadableFiles: string[] = [], unchanged = 0) {
    const scan = startScan(kind, sourceReadMs, configuredFolder, unchanged);
    const { importQaPdf } = await import("@/lib/qa-pdf");
    const list: SourcePdf[] = [];
    try {
      for await (const file of files) list.push(file);
    } catch (error) {
      scan.finish(list.length, { code: "folder-enumeration-failed" });
      throw error;
    }
    const total = list.length + unreadableFiles.length + unchanged;
    for (const [index, name] of unreadableFiles.entries()) {
      addFailedImport({ id: JSON.stringify([configuredFolder, name, index]), fileName: name, code: "pdf-read-failed", at: new Date().toISOString(), archived: false });
      scan.recordFailure(new Error("PDF source could not be read"));
      log("error", "file", `Could not open ${name} from the source folder`);
    }
    log("info", "folder", `Opened folder "${folder}" (${kind}): ${total} PDFs found`);
    setConnection({ state: "reading", kind, folder, done: unreadableFiles.length + unchanged, total, failed: unreadableFiles.length, at: new Date().toISOString() });
    let ok = 0, bad = unreadableFiles.length, skipped = 0, saved = 0, unsaved = 0;
    const d = desktop();
    for (const file of list) {
      setBusy(`Reading ${file.name}…`);
      try {
        const result = await importQaPdf(file, addReport, addFailedImport, file.sourceKey);
        scan.recordRead(result);
        ok++;
        if (result.saved) saved++;
        if (result.archiveError) unsaved++;
      } catch (error) {
        scan.recordFailure(error);
        if (pdfReadErrorCode(error) === "empty-pdf") skipped++;
        else bad++;
      }
      setConnection({ done: ok + bad + skipped + unchanged, failed: bad });
    }
    setConnection({ state: "ready" });
    const summary = scan.finish(total);
    markFolderOpened(folder, kind, ok + unchanged);
    log(bad || unsaved ? "warning" : "success", "folder", `Finished "${folder}": ${ok} read, ${unchanged} unchanged, ${bad} failed, ${skipped} empty, ${summary.queuedForReview} for review, ${summary.cached} cached, ${saved} saved, ${unsaved} archive failures, ${summary.durationMs} ms total`);
    setBusy(null);
    const message = `${ok} reports read${d ? ` · ${saved} new PDFs saved to QA Library` : ""}${bad ? ` · ${bad} could not be read` : ""}${skipped ? ` · ${skipped} empty skipped` : ""}${unsaved ? ` · ${unsaved} copies could not be saved` : ""}`;
    if (bad || unsaved) toast.warning(message);
    else if (ok || !unchanged) toast.success(message);
    onDone?.();
  }

  /** Desktop program only: connect every configured scanner folder with its saved login. */
  async function connectAll() {
    const d = desktop(); if (!d) return;
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return;
    let cfg; try { cfg = normalizeConfig(JSON.parse(saved) as unknown); } catch { return; }
    if (scanning.current) return;
    scanning.current = true;
    try {
      for (const [index, s] of cfg.sources.entries()) {
        if (!s.path || s.path === "\\\\") continue;
        setBusy(`Connecting ${s.name}…`);
        const connectionStart = performance.now();
        const kind = kindOf(s);
        const res = await d.readFolder({ ...s, kind }, true);
        recordFolderCheck(s, res.ok);
        const sourceReadMs = Math.round(performance.now() - connectionStart);
        if (!res.ok) {
          const issue = res.diagnostic ?? { code: "folder-unavailable" };
          startScan(kind, sourceReadMs, index + 1).finish(0, issue);
          const message = res.error ?? `Could not connect ${s.name}`;
          log("error", "folder", `${message} (${issue.code}${issue.nativeCode === undefined ? "" : `, code ${issue.nativeCode}`})`);
          toast.error(message);
          continue;
        }
        const files = res.files.map((f) => Object.assign(
          new File([f.data as BlobPart], f.name, { type: "application/pdf" }),
          f.sourceKey ? { sourceKey: f.sourceKey } : {},
        ));
        await readFiles(files, s.path.split(/[\\/]/).filter(Boolean).pop() ?? s.name, kind, sourceReadMs, index + 1, res.unreadableFiles, res.unchanged);
      }
    } finally {
      scanning.current = false;
      setBusy(null);
    }
  }
  useEffect(() => {
    if (!autoConnect || !catalogReadyForScan) return;
    let active = true;
    const loadSettings = async () => {
      try {
        const text = await desktop()?.readSettings();
        if (!active) return;
        if (text) {
          const config = parseSettingsJson(text);
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
          window.dispatchEvent(new Event("ctqa:settings"));
        }
        await connectAll();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load Settings.json";
        log("error", "settings", message);
        toast.error(message);
      }
    };
    let timer: number | undefined;
    const again = () => {
      void connectAll().catch((error) => toast.error(String(error)));
    };
    const schedule = () => {
      window.clearInterval(timer);
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved || !desktop()) return;
      try {
        const { sync } = normalizeConfig(JSON.parse(saved));
        if (sync !== "launch") timer = window.setInterval(again, Number(sync) * 60_000);
      } catch { /* leave a malformed schedule inactive */ }
    };
    void loadSettings().then(() => { if (active) schedule(); });
    window.addEventListener("ctqa:reconnect", again);
    window.addEventListener("ctqa:settings", schedule);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("ctqa:reconnect", again);
      window.removeEventListener("ctqa:settings", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, catalogReadyForScan]);

  async function openFolder() {
    const p = picker();
    if (!p) { input.current?.click(); return; }
    try { const d = await p({ startIn: "desktop" }); await readFiles(walk(d), d.name); } catch (error) {
      setBusy(null);
      if (error instanceof DOMException && error.name === "AbortError") return;
      log("error", "folder", "Could not open the selected folder");
      toast.error("Could not open the selected folder");
    }
  }

  /** Hidden fallback picker for browsers without a folder picker. Render it once. */
  const inputEl = (
    <input ref={input} type="file" multiple accept="application/pdf" className="hidden"
      {...({ webkitdirectory: "" } as Record<string, string>)}
      onChange={(e) => { const f = Array.from(e.target.files ?? []).filter((x) => x.name.toLowerCase().endsWith(".pdf")); if (f.length) void readFiles(f, (f[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "Selected folder"); e.target.value = ""; }} />
  );

  return { busy, setBusy, openFolder, inputEl, connectAll };
}
