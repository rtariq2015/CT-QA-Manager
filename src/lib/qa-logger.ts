// Detailed local activity and a separate structured support export.
import { version } from "../../package.json";
import { clearScanHistory, getScanHistory } from "./qa-scan-log";
import { kindOf, type FolderKind, type OpenedFolder, type Source } from "./qa-settings";

export type LogLevel = "info" | "success" | "warning" | "error";
export type LogArea = "folder" | "file" | "filing" | "settings" | "app";
export interface LogEntry { id: number; at: string; level: LogLevel; area: LogArea; message: string }
interface FolderCheck { ok: boolean; at: string; successfulAt?: string }
export interface Connection {
  state: "idle" | "reading" | "ready";
  kind: FolderKind;
  folder?: string;
  done: number;
  total: number;
  failed: number;
  at?: string;
  /** Every folder opened in this window, so each scanner's status can be shown. */
  opened: OpenedFolder[];
  checks: Record<string, FolderCheck>;
}

export const MAX_LINES = 2000;
const KEY = "qa-log";
const CHECKS_KEY = "qa-folder-checks";
let entries: LogEntry[] = [];
let seq = 0;
let connection: Connection = { state: "idle", kind: "local", done: 0, total: 0, failed: 0, opened: [], checks: {} };
const subs = new Set<() => void>();
let loaded = false;
let checksLoaded = false;

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
export function clearLog() { entries = []; clearScanHistory(); emit(); }
export function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

export function getConnection() {
  if (!checksLoaded && typeof localStorage !== "undefined") {
    checksLoaded = true;
    try {
      const checks: unknown = JSON.parse(localStorage.getItem(CHECKS_KEY) ?? "{}");
      if (checks && typeof checks === "object" && !Array.isArray(checks)) connection = { ...connection, checks: checks as Connection["checks"] };
    } catch { /* the next check replaces invalid history */ }
  }
  return connection;
}
export function setConnection(c: Partial<Connection>) { connection = { ...connection, ...c }; emit(); }

const folderKey = (source: Source) => JSON.stringify([source.name.trim(), source.path.trim(), kindOf(source)]);
export const folderCheck = (state: Connection, source: Source) => state.checks[folderKey(source)];

export function recordFolderCheck(source: Source, ok: boolean) {
  const previous = getConnection();
  const key = folderKey(source);
  const at = new Date().toISOString();
  const successfulAt = ok ? at : previous.checks[key]?.successfulAt;
  const checks = { ...previous.checks, [key]: { ok, at, ...(successfulAt ? { successfulAt } : {}) } };
  connection = { ...previous, checks };
  try { localStorage.setItem(CHECKS_KEY, JSON.stringify(checks)); } catch { /* checks still work in this session */ }
  emit();
}

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

export function exportDiagnostic(counts: { reports: number; waitingInReview: number; app: "desktop" | "web" }): string {
  const { reports, waitingInReview, app } = counts;
  return JSON.stringify({
    kind: "ctqa-diagnostic", schemaVersion: 2, appVersion: version, createdAt: new Date().toISOString(), app,
    reports, waitingInReview, scans: getScanHistory(),
  }, null, 2);
}

/** Test helper. */
export function _reset() { entries = []; seq = 0; loaded = true; checksLoaded = true; connection = { state: "idle", kind: "local", done: 0, total: 0, failed: 0, opened: [], checks: {} }; }
