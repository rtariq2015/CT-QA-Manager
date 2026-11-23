import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type Context } from "react";
import { reviewReason, triage } from "./qa-triage";
import { log } from "./qa-logger";
import { getReports, type Report, type ReportType } from "./qa-data";

interface Filing { id: string; type: ReportType; previous: Report["type"]; at: number }

interface Store {
  reports: Report[];
  addReport: (report: Report) => void;
  pending: Report[];
  file: (id: string, type: ReportType) => void;
  undo: () => Filing | undefined;
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
  const base = useMemo(() => getReports(), []);
  const [overrides, setOverrides] = useState<Record<string, ReportType>>({});
  const [localReports, setLocalReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<Filing[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [compact, setCompact] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("qa-theme");
    if (t === "dark" || t === "light") setTheme(t);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
    setCompact(localStorage.getItem("qa-compact") === "1");
    try {
      const saved = JSON.parse(localStorage.getItem("qa-filings") ?? "{}");
      if (saved && typeof saved === "object") setOverrides(Object.fromEntries(Object.entries(saved).filter(([, v]) => v === "Daily" || v === "Monthly" || v === "Other")) as Record<string, ReportType>);
    } catch { /* ignore bad saved data */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem("qa-filings", JSON.stringify(overrides)); }, [overrides, loaded]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("compact", compact);
  }, [theme, compact]);

  const all = useMemo(
    () => [...localReports, ...base].map(triage).map((r) => {
      const type = overrides[r.id];
      return type ? { ...r, type, needsReview: false, autoFiled: false } : r;
    }),
    [base, localReports, overrides],
  );
  const reports = all;
  const pending = useMemo(() => reports.filter((r) => r.needsReview), [reports]);

  const file = useCallback((id: string, type: ReportType) => {
    const prev = reports.find((r) => r.id === id);
    if (!prev) return;
    setOverrides((o) => ({ ...o, [id]: type }));
    log("info", "filing", `${prev.fileName} filed as ${type}`);
    setHistory((h) => [{ id, type, previous: prev.type, at: Date.now() }, ...h]);
  }, [reports]);

  const undo = useCallback(() => {
    const last = history[0];
    if (!last) return undefined;
    setOverrides((o) => { const n = { ...o }; delete n[last.id]; return n; });
    setHistory((h) => h.slice(1));
    log("info", "filing", `Undid filing (${last.type})`);
    return last;
  }, [history]);

  const value: Store = {
    reports, pending, file, undo, history, lastFiling: history[0],
    addReport: (report) => {
      const t = triage(report);
      log(t.needsReview ? "warning" : "info", "filing", t.needsReview ? `${report.fileName} sent to Review: ${reviewReason(t) ?? "needs a look"}` : `${report.fileName} auto-filed as ${t.type}`);
      setLocalReports(rs => [report, ...rs.filter(r => r.id !== report.id)]);
    },
    theme, compact, overrides,
    restoreFilings: (f) => { setOverrides(f); setHistory([]); log("info", "settings", `Backup restored: ${Object.keys(f).length} filings`); },
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
