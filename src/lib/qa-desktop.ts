import type { Report } from "./qa-data";
// Bridge to the Windows desktop program (electron/preload.cjs). Absent in a normal browser.
import type { FailedImport } from "./qa-import-failure";
import type { PdfFailureCode } from "./qa-read-error";
import type { Source } from "./qa-settings";

export interface CatalogMetadata {
  reportId: string;
  report?: Report;
  source?: string;
}

export interface DesktopBridge {
  listCatalog(): Promise<Report[]>;
  saveFailedImport(name: string, code: PdfFailureCode, bytes: Uint8Array): Promise<FailedImport | null>;
  listFailedImports(): Promise<FailedImport[]>;
  openFailedImport(id: string): Promise<Uint8Array>;
  reviewFailedImport(id: string): Promise<void>;
  readSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<void>;
  saveLogin(name: string, user: string, password: string): Promise<boolean>;
  renameLogin(from: string, to: string): Promise<boolean>;
  hasLogin(name: string): Promise<boolean>;
  saveCopy(rel: string, data: Uint8Array, previous?: string[], metadata?: CatalogMetadata): Promise<{ ok: boolean; path?: string; existed?: boolean; error?: string; catalogError?: string }>;
  openLibrary(): Promise<{ ok: boolean; path: string; error?: string }>;
  testFolder(s: Source): Promise<{ ok: boolean; error?: string }>;
  readFolder(s: Source, incremental?: boolean): Promise<{ ok: boolean; error?: string; diagnostic?: { code: string; nativeCode?: number }; unreadableFiles?: string[]; unchanged?: number; files: { name: string; data: Uint8Array; sourceKey?: string }[] }>;
}
export const desktop = (): DesktopBridge | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { ctqaDesktop?: DesktopBridge }).ctqaDesktop;
