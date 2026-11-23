export type FolderKind = "local" | "network";

/** Where the Settings page keeps its copy on this computer. */
export const SETTINGS_KEY = "qa-settings";

export interface Source {
  name: string;
  path: string;
  user?: string;
  /** Chosen by hand on the Settings page; falls back to what the path looks like. */
  kind?: FolderKind;
}

export interface Config {
  sources: Source[];
  dueDay: number;
  days: "every" | "weekdays";
  sync: "launch" | "15" | "30" | "60";
}

export const DEFAULT: Config = {
  sources: [
    { name: "CT Flash", path: "\\\\server\\CTQA\\CT Flash", kind: "network" },
    { name: "CT Edge", path: "\\\\server\\CTQA\\CT Edge", kind: "network" },
    { name: "MDP Building (Drive)", path: "\\\\server\\CTQA\\MDP Building", kind: "network" },
    { name: "CT Xcite", path: "E:\\EXCITE-ED", kind: "local" },
  ],
  dueDay: 10,
  days: "every",
  sync: "30",
};

const KINDS: readonly string[] = ["local", "network"];
const DAYS: readonly string[] = ["every", "weekdays"];
const SYNC: readonly string[] = ["launch", "15", "30", "60"];

export const isLocalPath = (p: string) => /^[a-zA-Z]:[\\/]/.test(p.trim());

/** The hand-picked type wins; only when none was picked does the path decide. */
export function kindOf(s: Source): FolderKind {
  if (s.kind === "local" || s.kind === "network") return s.kind;
  return isLocalPath(s.path) ? "local" : "network";
}

/** A folder the person actually opened in this browser window. */
export interface OpenedFolder { name: string; kind: FolderKind; count: number; at: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when an opened folder is the one this scanner is configured to use. */
export function folderMatches(s: Source, o: OpenedFolder): boolean {
  const n = norm(o.name);
  if (!n) return false;
  if (norm(s.name) === n) return true;
  const leaf = s.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  return leaf !== "" && norm(leaf) === n;
}

export interface FolderRow { source: Source; opened: OpenedFolder | undefined }

/** One row per configured folder, marked with the folder opened for it (if any). */
export function folderRows(sources: Source[], opened: OpenedFolder[]): FolderRow[] {
  return sources.map((source) => ({ source, opened: opened.find((o) => folderMatches(source, o)) }));
}

/** Folders opened that no configured scanner points at. */
export function unmatchedFolders(sources: Source[], opened: OpenedFolder[]): OpenedFolder[] {
  return opened.filter((o) => !sources.some((s) => folderMatches(s, o)));
}

/** Settings.json for the Windows program: local folders never carry a login. */
export function buildSettingsJson(cfg: Config): string {
  return JSON.stringify(
    {
      Sources: cfg.sources.map((s) => {
        const local = kindOf(s) === "local";
        return {
          Name: s.name,
          Path: s.path,
          Type: local ? "Local" : "Network",
          Username: local ? "" : s.user ?? "",
          CredentialTarget: local ? "" : `CTQA:${s.name}`,
        };
      }),
      MonthlyDueDay: cfg.dueDay,
      DailySchedule: cfg.days,
      SyncMinutes: cfg.sync,
    },
    null,
    2,
  );
}

/** Accepts anything read back from disk and returns a usable Config, or the defaults. */
export function normalizeConfig(raw: unknown): Config {
  const c = raw as Partial<Config> | null;
  if (!c || typeof c !== "object" || !Array.isArray(c.sources)) return DEFAULT;
  const sources: Source[] = [];
  for (const item of c.sources) {
    const o = item as Partial<Source> | null;
    if (!o || typeof o.path !== "string") continue;
    const src: Source = { name: typeof o.name === "string" ? o.name : "Scanner", path: o.path };
    if (typeof o.user === "string" && o.user) src.user = o.user;
    if (KINDS.includes(String(o.kind))) src.kind = o.kind as FolderKind;
    sources.push(src);
  }
  const dueDay = typeof c.dueDay === "number" && c.dueDay >= 1 && c.dueDay <= 28 ? Math.round(c.dueDay) : DEFAULT.dueDay;
  const days = DAYS.includes(String(c.days)) ? (c.days as Config["days"]) : DEFAULT.days;
  const sync = SYNC.includes(String(c.sync)) ? (c.sync as Config["sync"]) : DEFAULT.sync;
  return { sources, dueDay, days, sync };
}
