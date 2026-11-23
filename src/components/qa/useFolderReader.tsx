import { useEffect, useRef, useState } from "react";
import { desktop } from "@/lib/qa-desktop";
import { normalizeConfig, SETTINGS_KEY, kindOf } from "@/lib/qa-settings";
import { toast } from "sonner";
import { useQa } from "@/lib/qa-store";
import { folderParts, tidyFileName } from "@/lib/qa-library";
import { log, markFolderOpened, setConnection } from "@/lib/qa-logger";

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
  const { addReport } = useQa();
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function readFiles(files: AsyncIterable<File> | File[], folder: string, kind: "local" | "network" = "local") {
    const { readQaPdf } = await import("@/lib/qa-pdf");
    const list: File[] = []; for await (const f of files) list.push(f);
    log("info", "folder", `Opened folder "${folder}" (local): ${list.length} PDFs found`);
    setConnection({ state: "reading", kind: "local", folder, done: 0, total: list.length, failed: 0, at: new Date().toISOString() });
    let ok = 0, bad = 0, saved = 0;
    const d = desktop();
    for (const file of list) {
      setBusy(`Reading ${file.name}…`);
      try { const rep = await readQaPdf(file); rep.originalUrl = URL.createObjectURL(file); addReport(rep); ok++;
        if (d) {
          const res = await d.saveCopy([...folderParts(rep), tidyFileName(rep)].join("/"), new Uint8Array(await file.arrayBuffer()));
          if (res.ok) { if (!res.existed) saved++; } else log("error", "folder", `Could not save a copy of ${file.name}: ${res.error ?? "unknown"}`);
        }
      }
      catch { bad++; }
      setConnection({ done: ok + bad, failed: bad });
    }
    setConnection({ state: "ready" });
    if (d) log("success", "folder", `Saved ${saved} new PDF copies into the QA Library folder`);
    markFolderOpened(folder, kind, ok);
    log(bad ? "warning" : "success", "folder", `Finished "${folder}": ${ok} read, ${bad} could not be read`);
    setBusy(null);
    toast.success(`${ok} reports organized${d ? ` · ${saved} new PDFs saved to QA Library` : ""}${bad ? ` · ${bad} could not be read` : ""}`);
    onDone?.();
  }

  /** Desktop program only: connect every configured scanner folder with its saved login. */
  async function connectAll() {
    const d = desktop(); if (!d) return;
    let cfg; try { cfg = normalizeConfig(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as unknown); } catch { return; }
    for (const s of cfg.sources) {
      if (!s.path || s.path === "\\\\") continue;
      setBusy(`Connecting ${s.name}…`);
      const res = await d.readFolder({ ...s, kind: kindOf(s) });
      if (!res.ok) { log("error", "folder", res.error ?? `Could not connect ${s.name}`); toast.error(res.error ?? `Could not connect ${s.name}`); continue; }
      const files = res.files.map((f) => new File([f.data as BlobPart], f.name, { type: "application/pdf" }));
      await readFiles(files, s.path.split(/[\\/]/).filter(Boolean).pop() ?? s.name, kindOf(s));
    }
    setBusy(null);
  }
  useEffect(() => {
    if (!autoConnect) return;
    void connectAll();
    const again = () => void connectAll();
    window.addEventListener("ctqa:reconnect", again);
    return () => window.removeEventListener("ctqa:reconnect", again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openFolder() {
    const p = picker();
    if (!p) { input.current?.click(); return; }
    try { const d = await p({ startIn: "desktop" }); await readFiles(walk(d), d.name); } catch { setBusy(null); }
  }

  /** Hidden fallback picker for browsers without a folder picker. Render it once. */
  const inputEl = (
    <input ref={input} type="file" multiple accept="application/pdf" className="hidden"
      {...({ webkitdirectory: "" } as Record<string, string>)}
      onChange={(e) => { const f = Array.from(e.target.files ?? []).filter((x) => x.name.toLowerCase().endsWith(".pdf")); if (f.length) void readFiles(f, (f[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "Selected folder"); e.target.value = ""; }} />
  );

  return { busy, setBusy, openFolder, inputEl, connectAll };
}
