import type { FailedImport } from "./qa-import-failure";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Context } from "react";
import { reviewReason, triage } from "./qa-triage";
import { saveArchivedReport } from "./qa-library";
import { desktop } from "./qa-desktop";
import { log } from "./qa-logger";
import { localDate, type Report, type ReportType } from "./qa-data";
import { DEFAULT, normalizeConfig, SETTINGS_KEY, type Config } from "./qa-settings";

interface Filing { id: string; type: ReportType; previous: ReportType | undefined; at: number }
type Filings = Record<string, ReportType>;
type Schedule = Pick<Config, "days" | "dueDay">;
// Filter out synthetic report IDs found in older backups.
const importedFilings = (f: Filings) => Object.fromEntries(Object.entries(f).filter(([id]) => !/^r\d+$/.test(id)));

function filedReport(report: Report, filings: Filings): Report {
  const type = filings[report.id];
  return type ? { ...report, type, needsReview: false, autoFiled: false } : triage(report);
}

interface Store {
  today: string;
  schedule: Schedule;
  reports: Report[];
  addReport: (report: Report) => Report;
  pending: Report[];
  failedImports: FailedImport[];
  addFailedImport: (failure: FailedImport) => void;
  markFailedImportReviewed: (failure: FailedImport) => Promise<void>;
  file: (id: string, type: ReportType) => Promise<boolean>;
  undo: () => Promise<Filing | undefined>;
  filingBusy: boolean;
  lastFiling: Filing | undefined;
  history: Filing[];
  theme: "light" | "dark";
  toggleTheme: () => void;
  compact: boolean;
  toggleCompact: () => void;
  overrides: Record<string, ReportType>;
  restoreFilings: (f: Record<string, ReportType>) => void;
}

// Keep one context across hot reloads so pages never lose the provider.
const g = globalThis as { __qaCtx?: Context<Store | null> };
const Ctx = g.__qaCtx ?? (g.__qaCtx = createContext<Store | null>(null));

export function QaProvider({ children }: { children: ReactNode }) {
  const [clockDay, setClockDay] = useState("");
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT);
  const [overrides, setOverrideState] = useState<Filings>({});
  const currentOverrides = useRef<Filings>({});
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const reviewedIds = useRef(new Set<string>());
  const addFailedImport = useCallback((failure: FailedImport) => {
    if (reviewedIds.current.has(failure.id)) return;
    setFailedImports((current) => current.some(({ id }) => id === failure.id) ? current : [failure, ...current]);
  }, []);
  const markFailedImportReviewed = async (failure: FailedImport) => {
    if (failure.archived) await desktop()?.reviewFailedImport(failure.id);
    reviewedIds.current.add(failure.id);
    setFailedImports((current) => current.filter(({ id }) => id !== failure.id));
  };
  useEffect(() => {
    let active = true;
    void desktop()?.listFailedImports().then((entries) => {
      if (!active) return;
      for (const entry of entries.sort((a, b) => a.at.localeCompare(b.at))) addFailedImport(entry);
    }).catch(() => log("error", "folder", "Could not load the Review Inbox"));
    return () => { active = false; };
  }, [addFailedImport]);
  const [localReports, setLocalReports] = useState<Report[]>([]);
  useEffect(() => {
    let active = true;
    void desktop()?.listCatalog().then((saved) => {
      if (!active || !saved.length) return;
      setLocalReports((current) => {
        const newer = new Set(current.map(({ id }) => id));
        return [...current, ...saved.filter(({ id }) => !newer.has(id))]
          .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      });
      log("info", "folder", `Opened ${saved.length} reports from the local catalog`);
    }).catch(() => log("error", "folder", "Could not open the saved report catalog"));
    return () => { active = false; };
  }, []);
  const [history, setHistory] = useState<Filing[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [compact, setCompact] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const setOverrides = useCallback((next: Filings | ((prev: Filings) => Filings)) => {
    currentOverrides.current = typeof next === "function" ? next(currentOverrides.current) : next;
    setOverrideState(currentOverrides.current);
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("qa-theme");
    if (t === "dark" || t === "light") setTheme(t);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
    setCompact(localStorage.getItem("qa-compact") === "1");
    try {
      const saved = JSON.parse(localStorage.getItem("qa-filings") ?? "{}");
      if (saved && typeof saved === "object") {
        setOverrides(importedFilings(Object.fromEntries(Object.entries(saved).filter(([, v]) => v === "Daily" || v === "Monthly" || v === "Other")) as Filings));
      }
    } catch { /* ignore bad saved data */ }
    setLoaded(true);
  }, [setOverrides]);
  useEffect(() => { if (loaded) localStorage.setItem("qa-filings", JSON.stringify(overrides)); }, [overrides, loaded]);
  useEffect(() => {
    const updateDay = () => setClockDay(localDate());
    const updateSchedule = () => {
      try {
        const { days, dueDay } = normalizeConfig(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
        setSchedule({ days, dueDay });
      } catch { setSchedule(DEFAULT); }
    };
    updateDay();
    updateSchedule();
    const clock = window.setInterval(updateDay, 30_000);
    window.addEventListener("focus", updateDay);
    window.addEventListener("ctqa:settings", updateSchedule);
    window.addEventListener("storage", updateSchedule);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener("focus", updateDay);
      window.removeEventListener("ctqa:settings", updateSchedule);
      window.removeEventListener("storage", updateSchedule);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("compact", compact);
  }, [theme, compact]);

  const reports = useMemo(() => localReports.map((report) => filedReport(report, overrides)), [localReports, overrides]);
  const pending = useMemo(() => reports.filter((r) => r.needsReview), [reports]);

  const [filingBusy, setFilingBusy] = useState(false);
  const writingArchive = useRef(false);
  const updateArchive = useCallback(async (report: Report) => {
    writingArchive.current = true;
    setFilingBusy(true);
    try {
      await saveArchivedReport(report);
    } finally {
      writingArchive.current = false;
      setFilingBusy(false);
    }
  }, []);

  const file = useCallback(async (id: string, type: ReportType) => {
    const report = reports.find((r) => r.id === id);
    if (!report || writingArchive.current) return false;
    if (desktop()) await updateArchive({ ...report, type });
    setOverrides((o) => ({ ...o, [id]: type }));
    log("info", "filing", `${report.fileName} filed as ${type}`);
    setHistory((h) => [{ id, type, previous: overrides[id], at: Date.now() }, ...h]);
    return true;
  }, [reports, updateArchive, overrides, setOverrides, setHistory]);

  const undo = useCallback(async () => {
    const last = history[0];
    if (!last || writingArchive.current) return;
    const report = localReports.find((r) => r.id === last.id);
    if (report && desktop()) {
      await updateArchive({ ...report, type: last.previous ?? triage(report).type });
    }
    setOverrides((o) => {
      const next = { ...o };
      if (last.previous) next[last.id] = last.previous;
      else delete next[last.id];
      return next;
    });
    setHistory((h) => h.slice(1));
    log("info", "filing", `Undid filing (${last.type})`);
    return last;
  }, [history, localReports, updateArchive, setOverrides, setHistory]);

  const addReport = useCallback((report: Report) => {
    const filed = filedReport(report, currentOverrides.current);
    const action = filed.needsReview ? `sent to Review: ${reviewReason(filed) ?? "needs a look"}` : `${filed.autoFiled ? "auto-filed" : "filed"} as ${filed.type}`;
    log(filed.needsReview ? "warning" : "info", "filing", `${report.fileName} ${action}`);
    setLocalReports((reports) => [...reports.filter((r) => r.id !== report.id), report].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)));
    return filed;
  }, []);

  const value: Store = {
    today: clockDay, schedule,
    reports, addReport, pending, failedImports, addFailedImport, markFailedImportReviewed, file, undo, filingBusy, history, lastFiling: history[0],
    theme, compact, overrides,
    restoreFilings: (f) => { const filings = importedFilings(f); setOverrides(filings); setHistory([]); log("info", "settings", `Backup restored: ${Object.keys(filings).length} filings`); },
    toggleTheme: () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; localStorage.setItem("qa-theme", n); return n; }),
    toggleCompact: () => setCompact((c) => { localStorage.setItem("qa-compact", c ? "0" : "1"); return !c; }),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQa() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQa outside QaProvider");
  return v;
}
