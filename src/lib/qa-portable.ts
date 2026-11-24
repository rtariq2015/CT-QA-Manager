import { buildSettingsJson, type Config } from "./qa-settings";

/** Files that go on the USB stick; the launcher needs no install or admin rights. */
export function usbFiles(cfg: Config, appUrl: string): Record<string, string> {
  const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");
  const files: Record<string, string> = {
    "CTQA/Start CT QA.bat": crlf(`@echo off\ncd /d "%~dp0"\nstart "" "${appUrl}"\n`),
    "CTQA/Settings.json": buildSettingsJson(cfg),
    "CTQA/READ ME.txt": crlf(`CT QA Manager - portable USB copy

1. Keep this whole CTQA folder together. You can move it to any USB stick, Desktop or shared drive.
2. Put scanner QA PDFs into the Reports folder (one sub-folder per scanner).
3. Double-click "Start CT QA.bat". No install and no admin rights are needed.
4. In the app: Folders -> Import from folder -> pick this USB's Reports folder.

PDFs are read only on the PC you are using and are never uploaded.
If something looks wrong: click Log at the top, then Download log, and send the file.
`),
  };
  for (const s of cfg.sources) files[`CTQA/Reports/${s.name.replace(/[\\/:*?"<>|]/g, "_")}/Put PDFs here.txt`] = "Drop this scanner's QA PDFs in this folder.\r\n";
  return files;
}

export async function buildUsbPackage(cfg: Config, appUrl: string): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  return zipSync(Object.fromEntries(Object.entries(usbFiles(cfg, appUrl)).map(([k, v]) => [k, strToU8(v)])));
}
