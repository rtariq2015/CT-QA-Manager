// Bridge to the Windows desktop program (electron/preload.cjs). Absent in a normal browser.
import type { Source } from "./qa-settings";

export interface DesktopBridge {
  saveLogin(name: string, user: string, password: string): Promise<boolean>;
  renameLogin(from: string, to: string): Promise<boolean>;
  hasLogin(name: string): Promise<boolean>;
  saveCopy(rel: string, data: Uint8Array): Promise<{ ok: boolean; path?: string; existed?: boolean; error?: string }>;
  openLibrary(): Promise<{ ok: boolean; path: string; error?: string }>;
  readFolder(s: Source): Promise<{ ok: boolean; error?: string; files: { name: string; data: Uint8Array }[] }>;
}
export const desktop = (): DesktopBridge | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { ctqaDesktop?: DesktopBridge }).ctqaDesktop;
