// Live activity log: records what the app does (no patient data, no passwords, no PDF text).
import type { FolderKind, OpenedFolder } from "./qa-settings";

export type LogLevel = "info" | "success" | "warning" | "error";
export type LogArea = "folder" | "file" | "filing" | "settings" | "app";
export interface LogEntry { id: number; at: string; level: LogLevel; area: LogArea; message: string }
export interface Connection {
  state: "demo" | "reading" | "ready";
  kind: FolderKind;
  folder?: string;
  done: number;
  total: number;
  failed: number;
  at?: string;
  /** Every folder opened in this window, so each scanner's status can be shown. */
  opened: OpenedFolder[];
}

export const MAX_LINES = 2000;
const KEY = "qa-log";
let entries: LogEntry[] = [];
let seq = 0;
let connection: Connection = { state: "demo", kind: "local", done: 0, total: 0, failed: 0, opened: [] };
const subs = new Set<() => void>();
let loaded = false;

/** Strips anything that looks like a password or login secret before it is stored. */
export function redact(text: string): string {
  return text.replace(/(password|passwd|pwd|secret|token)\s*[:=]\s*\S+/gi, "$1=[hidden]");
}

function load() {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as LogEntry[];
    if (Array.isArray(saved)) { entries = saved.slice(-MAX_LINES); seq = entries.reduce((m, e) => Math.max(m, e.id), 0); }
  } catch { /* ignore */ }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function emit() {
  subs.forEach((f) => f());
  if (typeof localStorage === "undefined") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* full */ } }, 300);
}

export function log(level: LogLevel, area: LogArea, message: string) {
  load();
  entries = [...entries, { id: ++seq, at: new Date().toISOString(), level, area, message: redact(message) }];
  if (entries.length > MAX_LINES) entries = entries.slice(-MAX_LINES);
  emit();
}
export function getLog(): LogEntry[] { load(); return entries; }
export function clearLog() { entries = []; emit(); }
export function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

export function getConnection() { return connection; }
export function setConnection(c: Partial<Connection>) { connection = { ...connection, ...c }; emit(); }

/** Records that a folder was opened, so the status can say which ones are connected. */
export function markFolderOpened(name: string, kind: FolderKind, count: number) {
  const at = new Date().toISOString();
  const opened = [...connection.opened.filter((o) => o.name !== name), { name, kind, count, at }];
  connection = { ...connection, state: "ready", kind, folder: name, opened };
  emit();
}

export function exportText(list: LogEntry[] = getLog()): string {
  return list.map((e) => `${e.at}  ${e.level.toUpperCase().padEnd(7)} ${e.area.padEnd(8)} ${e.message}`).join("\n") + "\n";
}

export function exportDiagnostic(extra: Record<string, unknown>): string {
  return JSON.stringify({
    kind: "ctqa-diagnostic", createdAt: new Date().toISOString(), connection,
    note: "Contains no PDFs, no PDF text, no passwords and no patient data.",
    ...extra, log: getLog(),
  }, null, 2);
}

/** Test helper. */
export function _reset() { entries = []; seq = 0; loaded = true; connection = { state: "demo", kind: "local", done: 0, total: 0, failed: 0, opened: [] }; }
