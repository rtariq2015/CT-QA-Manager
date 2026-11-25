import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQa } from "@/lib/qa-store";
import { makeBackup, parseBackup } from "@/lib/qa-backup";
import { buildSettingsJson, parseSettingsJson, kindOf, normalizeConfig, folderRows, SETTINGS_KEY, DEFAULT, type Config, type FolderKind, type Source } from "@/lib/qa-settings";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/qa/ui";
import { LiveLogView, useConnection } from "@/components/qa/LiveLog";
import { exportDiagnostic, folderCheck, log, recordFolderCheck } from "@/lib/qa-logger";
import { buildUsbPackage } from "@/lib/qa-portable";
import { desktop, type LoginStatus } from "@/lib/qa-desktop";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CT QA Manager Companion" },
      { name: "description", content: "Set the scanner folders (local or network), monthly due day and sync schedule for CT QA reports." },
      { property: "og:title", content: "Settings — CT QA Manager Companion" },
      { property: "og:description", content: "Scanner folders, local or network, and QA schedule." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

const KEY = SETTINGS_KEY;
const KIND_LABEL: Record<FolderKind, string> = { local: "Local / Desktop", network: "Network" };
const KIND_HINT: Record<FolderKind, string> = {
  local: "A folder on this computer — no login needed.",
  network: "A shared folder on the hospital network — needs a login.",
};
const inp = "h-11 w-full rounded-md border bg-card px-3";
const loginKey = (source: Source) => JSON.stringify([source.name, source.path, source.user ?? "", kindOf(source)]);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function Settings() {
  const qa = useQa();
  const conn = useConnection();
  const [cfg, setCfg] = useState<Config>(DEFAULT);
  const [pw, setPw] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, LoginStatus>>({});
  const [loginRevision, setLoginRevision] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [testing, setTesting] = useState<number>();
  useEffect(() => {
    const d = desktop();
    setIsDesktop(Boolean(d));
    if (!d) return;
    let active = true;
    void Promise.all(cfg.sources.filter((source) => kindOf(source) === "network").map(async (source) => [
      loginKey(source), await d.loginStatus({ ...source, kind: "network" }),
    ] as const)).then((rows) => { if (active) setSaved(Object.fromEntries(rows)); })
      .catch(() => { if (active) setSaved({}); });
    return () => { active = false; };
  }, [cfg.sources, loginRevision]);
  useEffect(() => {
    try {
      const text = localStorage.getItem(KEY);
      if (text) setCfg(normalizeConfig(JSON.parse(text)));
    } catch { /* use defaults for malformed local data */ }
  }, []);
  useEffect(() => {
    const refresh = () => {
      const text = localStorage.getItem(KEY);
      if (!text) return;
      const next = normalizeConfig(JSON.parse(text));
      setCfg(next);
    };
    window.addEventListener("ctqa:settings", refresh);
    return () => window.removeEventListener("ctqa:settings", refresh);
  }, []);
  const set = (c: Partial<Config>) => setCfg((o) => ({ ...o, ...c }));
  const setSrc = (i: number, s: Partial<Source>) => set({ sources: cfg.sources.map((x, j) => j === i ? { ...x, ...s } : x) });
  const setKind = (i: number, kind: FolderKind) => setSrc(i, { kind });
  const testConnection = async (source: Source, index: number) => {
    const bridge = desktop();
    if (!bridge || testing !== undefined) return;
    setTesting(index);
    try {
      const result = await bridge.testFolder({ ...source, path: source.path.trim(), kind: kindOf(source) });
      recordFolderCheck(source, result.ok);
      if (result.ok) toast.success(`${source.name}: folder is reachable`);
      else {
        const message = result.error ?? `${source.name}: folder could not be reached`;
        log("warning", "folder", message);
        toast.error(message);
      }
    } catch {
      recordFolderCheck(source, false);
      toast.error(`${source.name}: test could not be completed`);
    } finally { setTesting(undefined); }
  };
  const persist = async (next: Config) => {
    const d = desktop();
    if (d) await d.saveSettings(buildSettingsJson(next));
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("ctqa:settings"));

  };
  const save = async () => {
    try {
      const next = parseSettingsJson(buildSettingsJson(cfg));
      const d = desktop();
      if (d) {
        for (const source of next.sources) {
          const password = pw[loginKey(source)];
          if (password && kindOf(source) === "network") await d.saveLogin(source, password);
        }
        setLoginRevision((value) => value + 1);
      }
      await persist(next);
      if (d) window.dispatchEvent(new Event("ctqa:reconnect"));
      setPw({});
      toast.success(d ? "Settings.json saved · connecting folders" : "Settings saved on this computer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    }
  };

  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = parseSettingsJson(await file.text());
      await persist(next);
      setCfg(next);
      setPw({});
      if (desktop()) window.dispatchEvent(new Event("ctqa:reconnect"));
      toast.success("Scanner folder settings imported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import settings");
    }
  };

  const approveLogin = async (source: Source) => {
    try {
      const approved = await desktop()?.approveLegacyLogin({ ...source, kind: "network" });
      setLoginRevision((value) => value + 1);
      if (approved) {
        window.dispatchEvent(new Event("ctqa:reconnect"));
        toast.success(`Network login approved for ${source.name}`);
      }
    } catch {
      toast.error("Could not approve the saved network login.");
    }
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([buildSettingsJson(cfg)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "Settings.json"; a.click(); URL.revokeObjectURL(url);
  };

  const backup = () => {
    try {
      const data = makeBackup(qa.overrides, cfg);
      download(`CTQA-backup-${data.createdAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create backup");
    }
  };
  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = parseBackup(await f.text());
      if (b.settings) {
        const next = b.settings;
        await persist(next);
        setCfg(next);
        setPw({});
      }
      qa.restoreFilings(b.filings);
      if (desktop()) window.dispatchEvent(new Event("ctqa:reconnect"));
      toast.success(`Restored ${Object.keys(b.filings).length} filing decisions`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const problemReport = () => download("CTQA-problem-report.json", exportDiagnostic({
    app: desktop() ? "desktop" : "web", reports: qa.reports.length, waitingInReview: qa.pending.length + qa.failedImports.length,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Settings" title="Settings"><Button onClick={() => void save()}>Save</Button></PageHeader>
      <Tabs defaultValue="network">
        <TabsList className="mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="network">Scanner folders</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="backup">Backup & help</TabsTrigger>
          <TabsTrigger value="log">Activity log</TabsTrigger>
          <TabsTrigger value="usb">Portable / USB</TabsTrigger>
        </TabsList>
        <TabsContent value="network">
          <section className="mb-6 rounded-lg border bg-card p-4">
            <h2 className="mb-1 font-medium">Scanner connections</h2>
            {isDesktop ? <p className="mb-4 text-sm text-muted-foreground">Enter the folder that receives each scanner’s QA PDFs. For a network share, save the login before testing the connection.</p>
              : <p className="mb-4 text-sm text-muted-foreground">Use <Link to="/folders" className="underline">Folders → Import from folder</Link> to load reports in the web app.</p>}
            <div className="space-y-5">
              {folderRows(cfg.sources, conn.opened).map(({ source: s, opened }, i) => {
                const kind = kindOf(s);
                const check = folderCheck(conn, s);
                const configured = Boolean(s.path.trim() && s.path.trim() !== "\\\\");
                const key = loginKey(s);
                const login = saved[key];
                return (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[180px_1fr_auto]">
                    <input className={inp} value={s.name} onChange={(e) => setSrc(i, { name: e.target.value })} aria-label="Scanner name" />
                    <input className={`${inp} font-mono text-sm`} value={s.path} onChange={(e) => setSrc(i, { path: e.target.value })} aria-label="Folder path" placeholder={kind === "local" ? String.raw`C:\Users\you\Desktop\QA or E:\EXCITE-ED` : String.raw`\\server\share`} />
                    <Button variant="outline" size="icon" className="size-11" aria-label="Remove" onClick={() => set({ sources: cfg.sources.filter((_, j) => j !== i) })}><Trash2 /></Button>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                      <span className="text-sm text-muted-foreground">Folder type</span>
                      <div role="group" aria-label={`Folder type for ${s.name}`} className="inline-flex rounded-md border p-0.5">
                        {(["local", "network"] as FolderKind[]).map((k) => (
                          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(i, k)}
                            className={`rounded px-3 py-1.5 text-sm font-medium ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                            {KIND_LABEL[k]}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{KIND_HINT[kind]}</span>
                      {isDesktop && <Button type="button" size="sm" variant="outline" disabled={!configured || testing !== undefined || (kind === "network" && Boolean(pw[key]))}
                        onClick={() => void testConnection(s, i)}>{testing === i ? "Testing…" : "Test connection"}</Button>}
                      {check?.ok === false ? <Pill tone="bad">Last check failed</Pill>
                        : check?.ok ? <Pill tone="ok">Folder reachable</Pill>
                        : opened ? <Pill tone="ok">Folder opened</Pill>
                        : <Pill tone="muted">{configured ? "Awaiting check" : "Folder not set"}</Pill>}
                      {check?.successfulAt && <time className="text-xs text-muted-foreground" dateTime={check.successfulAt}>Last successful check {new Date(check.successfulAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>}
                    </div>
                    {kind === "network" && (
                      <div className="grid gap-2 sm:col-span-3 sm:grid-cols-2">
                        <label className="text-sm">Username<input className={`${inp} mt-1`} placeholder="HOSPITAL\\username" autoComplete="off" value={s.user ?? ""} onChange={(e) => setSrc(i, { user: e.target.value })} /></label>
                        <label className="text-sm">Password<input type="password" className={`${inp} mt-1`} autoComplete="new-password" disabled={!isDesktop} placeholder={!isDesktop ? "Only in the desktop program" : login === "saved" ? "Saved for this share" : "Network password"} value={pw[key] ?? ""} onChange={(e) => setPw((o) => ({ ...o, [key]: e.target.value }))} /></label>
                        {login === "legacy" && <div className="space-y-2 text-sm sm:col-span-2">
                          <p>Approve {s.user ? <strong>{s.user}</strong> : "your Windows account"} for <span className="break-all font-mono">{s.path.trim()}</span>.</p>
                          <Button size="sm" variant="outline" onClick={() => void approveLogin(s)}>Use saved login for this share</Button>
                        </div>}
                        {login === "required" && <p className="text-sm text-warn-foreground dark:text-warn sm:col-span-2">Enter the username and password for this network share, then save.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" className="mt-3" onClick={() => set({ sources: [...cfg.sources, { name: "New scanner", path: "\\\\", kind: "network" }] })}><Plus />Add folder</Button>
          </section>
          <p className="mt-3 text-sm text-muted-foreground">Windows saves Settings.json next to the program. Copy that file beside the executable before launching, or import it here. Passwords stay encrypted on this PC.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportJson}>Download Settings.json</Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"><Upload className="size-4" />Import Settings.json
              <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { void importSettings(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        </TabsContent>
        <TabsContent value="schedule">
          <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
            <label className="text-sm">Monthly due day<input type="number" min={1} max={28} className={`${inp} mt-1`} value={cfg.dueDay} onChange={(e) => set({ dueDay: Number(e.target.value) })} /></label>
            <label className="text-sm">Daily QA expected<select className={`${inp} mt-1`} value={cfg.days} onChange={(e) => set({ days: e.target.value as Config["days"] })}><option value="every">Every day</option><option value="weekdays">Weekdays</option></select></label>
            <label className="text-sm">Check folders<select className={`${inp} mt-1`} value={cfg.sync} onChange={(e) => set({ sync: e.target.value as Config["sync"] })}><option value="launch">On launch only</option><option value="15">Every 15 min</option><option value="30">Every 30 min</option><option value="60">Every hour</option></select></label>
          </section>
        </TabsContent>
        <TabsContent value="appearance">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <label className="flex items-center justify-between gap-4"><span><b className="font-medium">Dark mode</b><br /><span className="text-sm text-muted-foreground">Easier on the eyes in dim rooms.</span></span>
              <input type="checkbox" className="size-5" checked={qa.theme === "dark"} onChange={qa.toggleTheme} /></label>
            <label className="flex items-center justify-between gap-4"><span><b className="font-medium">Compact spacing</b><br /><span className="text-sm text-muted-foreground">Fit more rows on screen.</span></span>
              <input type="checkbox" className="size-5" checked={qa.compact} onChange={qa.toggleCompact} /></label>
          </section>
        </TabsContent>
        <TabsContent value="backup">
          <section className="mb-4 rounded-lg border bg-card p-4">
            <h2 className="mb-1 font-medium">Backup</h2>
            <p className="mb-3 text-sm text-muted-foreground">Saves your filing decisions and settings in one file (no PDFs, no password).</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={backup}>Download backup</Button>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted"><Upload className="size-4" />Restore backup
                <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
          </section>
          {isDesktop && <section className="mb-4 rounded-lg border bg-card p-4">
            <h2 className="mb-1 font-medium">Windows updates</h2>
            <p className="mb-3 text-sm text-muted-foreground">Close the app, extract the smaller Update ZIP, then open Apply-Update.cmd and select the program folder.</p>
            <Button variant="outline" asChild><a href="https://github.com/rtariq2015/CT-QA-Manager/releases/latest" target="_blank" rel="noreferrer">View Windows downloads</a></Button>
          </section>}
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-1 font-medium">Problem report</h2>
            <p className="mb-3 text-sm text-muted-foreground">Download recent scan totals, timings, and error codes for troubleshooting. The export omits PDF contents, filenames, and folder paths.</p>
            <Button variant="outline" onClick={problemReport}>Download problem report</Button>
          </section>
        </TabsContent>
        <TabsContent value="log">
          <section className="rounded-lg border bg-card p-4"><LiveLogView tall /></section>
        </TabsContent>
        <TabsContent value="usb">
          <section className="rounded-lg border bg-card p-4 text-sm">
            {isDesktop ? (
              <>
                <h2 className="mb-1 font-medium">Carry the Windows program on a USB stick</h2>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Copy the entire extracted CT QA Manager program folder onto the USB stick.</li>
                  <li>On the Windows PC, open the copied folder and double-click <b className="text-foreground">CT QA Manager.exe</b>.</li>
                  <li>Go to Folders → Import from folder and select the folder containing your scanner PDFs.</li>
                </ol>
              </>
            ) : (
              <>
                <h2 className="mb-1 font-medium">USB report folders and web shortcut</h2>
                <ol className="mb-3 list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Download the ZIP and extract its contents onto the USB stick.</li>
                  <li>Put scanner PDFs in the <b className="text-foreground">Reports</b> folder.</li>
                  <li>On a Windows PC with access to this site, double-click <b className="text-foreground">Start CT QA.bat</b>.</li>
                  <li>Go to Folders → Import from folder and select the USB's Reports folder.</li>
                </ol>
                <Button onClick={async () => { const zip = await buildUsbPackage(cfg, window.location.origin); const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" })); const a = document.createElement("a"); a.href = url; a.download = "CTQA-USB.zip"; a.click(); URL.revokeObjectURL(url); log("success", "settings", "USB package downloaded"); }}>Download USB folders and shortcut</Button>
              </>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
