import { SCANNERS, type ScannerId } from "./qa-data";

export type FolderKind = "local" | "network";

/** Where the Settings page keeps its copy on this computer. */
export const SETTINGS_KEY = "qa-settings";

export interface Source {
  name: string;
  path: string;
  scanner?: ScannerId;
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
    { name: "CT Flash", path: "\\\\server\\CTQA\\CT Flash", kind: "network", scanner: "flash" },
    { name: "CT Edge", path: "\\\\server\\CTQA\\CT Edge", kind: "network", scanner: "edge" },
    { name: "MDP Building (Drive)", path: "\\\\server\\CTQA\\MDP Building", kind: "network", scanner: "drive" },
    { name: "CT Xcite", path: "E:\\EXCITE-ED", kind: "local", scanner: "xcite" },
  ],
  dueDay: 10,
  days: "every",
  sync: "30",
};

const KINDS: readonly string[] = ["local", "network"];
const DAYS: readonly string[] = ["every", "weekdays"];
const SYNC: readonly string[] = ["launch", "15", "30", "60"];

export const isLocalPath = (p: string) => /^[a-zA-Z]:[\\/]/.test(p.trim());
export const hasFolderPath = (source: Source) => Boolean(source.path.trim() && source.path.trim() !== "\\\\");

/** The hand-picked type wins; only when none was picked does the path decide. */
export function kindOf(s: Source): FolderKind {
  if (s.kind === "local" || s.kind === "network") return s.kind;
  return isLocalPath(s.path) ? "local" : "network";
}

/** A folder the person actually opened in this browser window. */
export interface OpenedFolder { name: string; kind: FolderKind; count: number; at: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const folderName = (source: Source) => source.path.trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";

const scannerIds = new Set<unknown>(SCANNERS.map(({ id }) => id));
const isScannerId = (id: unknown): id is ScannerId => scannerIds.has(id);
const oldScannerNames = new Map<string, ScannerId>([
  ["ctxcitenew", "xcite"], ["xcitenew", "xcite"], ["exciteed", "xcite"],
  ["mdpbuildingdrive", "drive"], ["mdpbuilding", "drive"],
]);
for (const { id, name, model } of SCANNERS) {
  for (const label of [name, `CT ${name}`, model, model.replace(/^SOMATOM /, "")]) {
    oldScannerNames.set(norm(label), id);
  }
}

function inferScanner(source: Source): ScannerId | undefined {
  const fromName = oldScannerNames.get(norm(source.name));
  const fromFolder = oldScannerNames.get(norm(folderName(source)));
  return fromName && fromFolder && fromName !== fromFolder ? undefined : fromName ?? fromFolder;
}

export interface ConfiguredScanner {
  scanner: ScannerId | undefined;
  folders: [Source, ...Source[]];
}

/** A scanner with several intake folders appears once, using its first saved name. */
export function configuredScanners(sources: Source[]): ConfiguredScanner[] {
  const groups: ConfiguredScanner[] = [];
  const byScanner = new Map<ScannerId, ConfiguredScanner>();
  for (const source of sources) {
    if (!hasFolderPath(source)) continue;
    const scanner = source.scanner;
    const existing = scanner && byScanner.get(scanner);
    if (existing) {
      existing.folders.push(source);
    } else {
      const group: ConfiguredScanner = { scanner, folders: [source] };
      groups.push(group);
      if (scanner) byScanner.set(scanner, group);
    }
  }
  return groups;
}

/** True when an opened folder is the one this scanner is configured to use. */
export function folderMatches(s: Source, o: OpenedFolder): boolean {
  const n = norm(o.name);
  if (!n) return false;
  if (norm(s.name) === n) return true;
  const leaf = folderName(s);
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
          Scanner: s.scanner,
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
    const scanner = isScannerId(o.scanner) ? o.scanner : inferScanner(src);
    if (scanner) src.scanner = scanner;
    if (typeof o.user === "string" && o.user) src.user = o.user;
    if (KINDS.includes(String(o.kind))) src.kind = o.kind as FolderKind;
    sources.push(src);
  }
  const dueDay = typeof c.dueDay === "number" && c.dueDay >= 1 && c.dueDay <= 28 ? Math.round(c.dueDay) : DEFAULT.dueDay;
  const days = DAYS.includes(String(c.days)) ? (c.days as Config["days"]) : DEFAULT.days;
  const sync = SYNC.includes(String(c.sync)) ? (c.sync as Config["sync"]) : DEFAULT.sync;
  return { sources, dueDay, days, sync };
}

/** A backup must contain usable settings before the restore can change any saved data. */
export function parseBackupSettings(raw: unknown): Config {
  const config = raw as Partial<Config> | null;
  if (!config || typeof config !== "object" || !Array.isArray(config.sources)) {
    throw new Error("The backup settings have no scanner folder list.");
  }
  for (const entry of config.sources) {
    const source = entry as Partial<Source> | null;
    if (!source || typeof source !== "object" || typeof source.name !== "string" || !source.name.trim() ||
        typeof source.path !== "string" || (source.kind !== undefined && !KINDS.includes(source.kind)) ||
        (source.scanner !== undefined && !isScannerId(source.scanner)) ||
        (source.user !== undefined && typeof source.user !== "string")) {
      throw new Error("The backup contains an invalid scanner folder.");
    }
  }
  const { dueDay, days, sync } = config;
  if (typeof dueDay !== "number" || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28 ||
      typeof days !== "string" || !DAYS.includes(days) ||
      (typeof sync !== "string" && typeof sync !== "number") || !SYNC.includes(String(sync))) {
    throw new Error("The backup contains an invalid QA schedule.");
  }
  return normalizeConfig({ sources: config.sources, dueDay, days, sync: String(sync) });
}

/** Read Settings.json, including files exported by earlier versions. */
export function parseSettingsJson(text: string): Config {
  const raw = JSON.parse(text.trim()) as Record<string, unknown> | null;
  if (!raw || !Array.isArray(raw["Sources"])) throw new Error("Settings.json must contain a Sources list");
  const sources: Source[] = raw["Sources"].map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid scanner folder in Settings.json");
    const { Name, Path, Type, Username, Scanner } = entry as Record<string, unknown>;
    if (typeof Name !== "string" || !Name.trim() || typeof Path !== "string" ||
        (Type !== "Network" && Type !== "Local") || (Scanner !== undefined && !isScannerId(Scanner))) {
      throw new Error("Invalid scanner name, model, path, or type in Settings.json");
    }
    const kind = Type === "Network" ? "network" : "local";
    return {
      name: Name, path: Path, kind,
      ...(Scanner ? { scanner: Scanner } : {}),
      ...(kind === "network" && typeof Username === "string" && Username ? { user: Username } : {}),
    };
  });
  if (typeof raw["MonthlyDueDay"] !== "number" || !Number.isInteger(raw["MonthlyDueDay"]) ||
      raw["MonthlyDueDay"] < 1 || raw["MonthlyDueDay"] > 28 ||
      !DAYS.includes(String(raw["DailySchedule"])) || !SYNC.includes(String(raw["SyncMinutes"]))) {
    throw new Error("Invalid QA schedule in Settings.json");
  }
  return normalizeConfig({ sources, dueDay: raw["MonthlyDueDay"], days: raw["DailySchedule"], sync: raw["SyncMinutes"] });
}
