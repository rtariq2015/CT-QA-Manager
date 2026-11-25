import { pdfReadErrorCode } from "@/lib/qa-read-error";
import { useEffect, useRef, useState } from "react";
import { desktop, type DesktopBridge } from "@/lib/qa-desktop";
import { hasFolderPath, normalizeConfig, parseSettingsJson, SETTINGS_KEY, kindOf } from "@/lib/qa-settings";
import { toast } from "sonner";
import { useQa } from "@/lib/qa-store";
import { startScan } from "@/lib/qa-scan-log";
import { log, markFolderOpened, recordFolderCheck, setConnection } from "@/lib/qa-logger";

type SourcePdf = File & { sourceKey?: string };

type ImportBatch = { files: SourcePdf[]; unreadableFiles: string[]; unchanged: number; readMs: number };

async function* desktopBatches(bridge: DesktopBridge, id: string): AsyncGenerator<ImportBatch> {
  let done = false;
  while (!done) {
    const start = performance.now();
    const batch = await bridge.nextFolderBatch(id);
    done = batch.done;
    yield {
      files: batch.files.map(({ name, data, sourceKey }) => Object.assign(
        new File([data as BlobPart], name, { type: "application/pdf" }), sourceKey ? { sourceKey } : {},
      )),
      unreadableFiles: batch.unreadableFiles,
      unchanged: batch.unchanged,
      readMs: Math.round(performance.now() - start),
    };
  }
}

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
  const { classifyReport, addReport, addFailedImport, catalogReadyForScan } = useQa();
  const [busy, setBusy] = useState<string | null>(null);
  const scanning = useRef(false);
  const reconnectPending = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function readFiles(batches: AsyncIterable<ImportBatch> | ImportBatch[], folder: string, total: number,
    kind: "local" | "network" = "local", sourceReadMs = 0, configuredFolder?: number) {
    const scan = startScan(kind, sourceReadMs, configuredFolder);
    const { importQaPdf } = await import("@/lib/qa-pdf");
    let ok = 0, bad = 0, skipped = 0, saved = 0, unsaved = 0, unchanged = 0;
    let unreadable = 0;
    const actions = { classifyReport, addReport, addFailedImport };
    const progress = () => setConnection({ done: ok + bad + skipped + unchanged, failed: bad });
    log("info", "folder", `Opened folder "${folder}" (${kind}): ${total} PDFs found`);
    setConnection({ state: "reading", kind, folder, done: 0, total, failed: 0, at: new Date().toISOString() });
    try {
      for await (const batch of batches) {
        scan.recordSourceBatch(batch.readMs, batch.unchanged);
        unchanged += batch.unchanged;
        for (const name of batch.unreadableFiles) {
          addFailedImport({ id: JSON.stringify([configuredFolder, name, unreadable++]), fileName: name, code: "pdf-read-failed", at: new Date().toISOString(), archived: false });
          scan.recordFailure(new Error("PDF source could not be read"));
          log("error", "file", `Could not open ${name} from the source folder`);
          bad++;
        }
        progress();
        for (const file of batch.files) {
          setBusy(`Reading ${file.name}…`);
          try {
            const result = await importQaPdf(file, actions, file.sourceKey);
            scan.recordRead(result);
            ok++;
            if (result.saved) saved++;
            if (result.archiveError) unsaved++;
          } catch (error) {
            scan.recordFailure(error);
            if (pdfReadErrorCode(error) === "empty-pdf") skipped++;
            else bad++;
          }
          progress();
        }
      }
    } catch (error) {
      scan.finish(total, { code: "folder-batch-failed" });
      throw error;
    } finally {
      setConnection({ state: "ready" });
      setBusy(null);
    }
    const summary = scan.finish(total);
    markFolderOpened(folder, kind, ok + unchanged);
    log(bad || unsaved ? "warning" : "success", "folder", `Finished "${folder}": ${ok} read, ${unchanged} unchanged, ${bad} failed, ${skipped} empty, ${summary.queuedForReview} for review, ${summary.cached} cached, ${saved} saved, ${unsaved} archive failures, ${summary.durationMs} ms total`);
    const message = `${ok} reports read${desktop() ? ` · ${saved} new PDFs saved to QA Library` : ""}${bad ? ` · ${bad} could not be read` : ""}${skipped ? ` · ${skipped} empty skipped` : ""}${unsaved ? ` · ${unsaved} copies could not be saved` : ""}`;
    if (bad || unsaved) toast.warning(message);
    else if (ok || !unchanged) toast.success(message);
    onDone?.();
  }

  function readSelectedFiles(files: File[], folder: string) {
    return readFiles([{ files, unreadableFiles: [], unchanged: 0, readMs: 0 }], folder, files.length);
  }

  /** Desktop program only: connect every configured scanner folder with its saved login. */
  async function connectAll() {
    const d = desktop(); if (!d) return;
    if (scanning.current) { reconnectPending.current = true; return; }
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return;
    let cfg; try { cfg = normalizeConfig(JSON.parse(saved) as unknown); } catch { return; }
    scanning.current = true;
    try {
      for (const [index, s] of cfg.sources.entries()) {
        if (localStorage.getItem(SETTINGS_KEY) !== saved) break;
        if (!hasFolderPath(s)) continue;
        setBusy(`Connecting ${s.name}…`);
        const connectionStart = performance.now();
        const kind = kindOf(s);
        try {
          const res = await d.startFolderScan({ ...s, kind });
          recordFolderCheck(s, res.ok);
          const sourceReadMs = Math.round(performance.now() - connectionStart);
          if (!res.ok) {
            const issue = res.diagnostic;
            startScan(kind, sourceReadMs, index + 1).finish(0, issue);
            log("error", "folder", `${res.error} (${issue.code}${issue.nativeCode === undefined ? "" : `, code ${issue.nativeCode}`})`);
            toast.error(res.error);
            continue;
          }
          try {
            const folder = s.path.trim().split(/[\\/]/).filter(Boolean).pop() ?? s.name;
            await readFiles(desktopBatches(d, res.id), folder, res.total, kind, sourceReadMs, index + 1);
          } finally {
            await d.endFolderScan(res.id);
          }
        } catch {
          recordFolderCheck(s, false);
          log("error", "folder", `Scan interrupted for ${s.name}`);
          toast.error(`Scan interrupted for ${s.name}`);
        }
      }
    } finally {
      scanning.current = false;
      setBusy(null);
      if (reconnectPending.current) {
        reconnectPending.current = false;
        void connectAll();
      }
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
    try {
      const d = await p({ startIn: "desktop" });
      const files: File[] = [];
      try {
        for await (const file of walk(d)) files.push(file);
      } catch (error) {
        startScan("local").finish(files.length, { code: "folder-enumeration-failed" });
        throw error;
      }
      await readSelectedFiles(files, d.name);
    } catch (error) {
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
      onChange={(e) => { const f = Array.from(e.target.files ?? []).filter((x) => x.name.toLowerCase().endsWith(".pdf")); if (f.length) void readSelectedFiles(f, (f[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "Selected folder"); e.target.value = ""; }} />
  );

  return { busy, setBusy, openFolder, inputEl, connectAll };
}
