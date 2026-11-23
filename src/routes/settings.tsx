import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQa } from "@/lib/qa-store";
import { makeBackup, parseBackup } from "@/lib/qa-backup";
import { buildSettingsJson, kindOf, normalizeConfig, folderRows, SETTINGS_KEY, DEFAULT, type Config, type FolderKind, type Source } from "@/lib/qa-settings";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/qa/ui";
import { LiveLogView, useConnection } from "@/components/qa/LiveLog";
import { log } from "@/lib/qa-logger";
import { buildUsbPackage } from "@/lib/qa-portable";
import { desktop } from "@/lib/qa-desktop";

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

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function Settings() {
  const qa = useQa();
  const conn = useConnection();
  const [cfg, setCfg] = useState<Config>(DEFAULT);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [pw, setPw] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => { const d = desktop(); setIsDesktop(!!d); if (d) void Promise.all(cfg.sources.map(async (s) => [s.name, await d.hasLogin(s.name)] as const)).then((r) => setSaved(Object.fromEntries(r))); }, [cfg.sources]);
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) { const c = normalizeConfig(JSON.parse(s) as unknown); setCfg(c); setSavedNames(c.sources.map((x) => x.name)); } else setSavedNames(DEFAULT.sources.map((x) => x.name)); } catch { /* ignore */ } }, []);
  const set = (c: Partial<Config>) => setCfg((o) => ({ ...o, ...c }));
  const setSrc = (i: number, s: Partial<Source>) => set({ sources: cfg.sources.map((x, j) => j === i ? { ...x, ...s } : x) });
  const setKind = (i: number, kind: FolderKind) => setSrc(i, { kind });
  const save = async () => {
    localStorage.setItem(KEY, JSON.stringify(cfg));
    window.dispatchEvent(new Event("ctqa:settings"));
    const d = desktop();
    if (d) {
      // Keep a saved password when its scanner was renamed (logins are kept by scanner name).
      for (const [i, s] of cfg.sources.entries()) { const old = savedNames[i]; if (old && old !== s.name && !pw[s.name] && cfg.sources.length === savedNames.length && !cfg.sources.some((x) => x.name === old)) await d.renameLogin(old, s.name); }
      for (const s of cfg.sources) { const p = pw[s.name]; if (p && kindOf(s) === "network") { await d.saveLogin(s.name, s.user ?? "", p); log("info", "settings", `Login saved for ${s.name}`); } }
      setPw({});
      setSavedNames(cfg.sources.map((x) => x.name));
      toast.success("Settings saved — connecting folders…");
      window.dispatchEvent(new Event("ctqa:reconnect"));
    } else toast.success("Settings saved on this computer"); log("info", "settings", `Settings saved: ${cfg.sources.map((x) => `${x.name} (${kindOf(x)})`).join(", ")}`); };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([buildSettingsJson(cfg)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "Settings.json"; a.click(); URL.revokeObjectURL(url);
  };

  const backup = () => download(`CTQA-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(qa.overrides, cfg), null, 2));
  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = parseBackup(await f.text());
      qa.restoreFilings(b.filings);
      if (b.settings && typeof b.settings === "object" && Array.isArray((b.settings as Config).sources)) {
        const next = normalizeConfig(b.settings);
        setCfg(next); localStorage.setItem(KEY, JSON.stringify(next));
      }
      toast.success(`Restored ${Object.keys(b.filings).length} filing decisions`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const problemReport = () => download("CTQA-problem-report.json", JSON.stringify({
    createdAt: new Date().toISOString(), browser: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}`,
    reports: qa.reports.length, openedPdfs: qa.reports.filter((r) => r.source === "uploaded").length,
    partlyRead: qa.reports.filter((r) => r.source === "uploaded" && r.extractionNotes?.length).length,
    waitingToFile: qa.pending.length, scannerFolders: cfg.sources.length, theme: qa.theme,
    note: "Contains no PDFs, file names, user names or patient data.",
  }, null, 2));

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
            <h2 className="mb-1 font-medium">Scanner folders (Network or Desktop / Local)</h2>
            <p className="mb-4 text-sm text-muted-foreground">Where each scanner sends its QA PDFs — a network share (e.g. <code>\\192.168.1.20\QA</code>) or a regular folder on this computer (e.g. <code>C:\Users\you\Desktop\QA Reports</code> or <code>E:\EXCITE-ED</code>). Switch each folder between the two types below. The Windows program uses these to pull reports automatically; a web browser cannot reach network folders by itself — use <b>Folders → Open folder</b> here.</p>
            <p className="mb-4 rounded-md bg-muted p-3 text-sm">
              <b className="font-medium">{folderRows(cfg.sources, conn.opened).filter((r) => r.opened).length} of {cfg.sources.length} folders connected</b> in this window.
              A web page cannot reach a network share by itself — open the folder on <Link to="/folders" className="underline">Folders → Open folder</Link> to load its reports.
            </p>
            <p className="mb-4 rounded-md bg-muted p-3 text-sm">{isDesktop ? "Type the password and press Save. It is locked with Windows encryption on this computer and the folders connect automatically each time the program opens." : "Passwords can only be saved in the downloaded desktop program. Here, use Open folder at the top."}</p>
            <div className="space-y-5">
              {folderRows(cfg.sources, conn.opened).map(({ source: s, opened }, i) => {
                const kind = kindOf(s);
                return (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[180px_1fr_auto]">
                    <input className={inp} value={s.name} onChange={(e) => setSrc(i, { name: e.target.value })} aria-label="Scanner name" />
                    <input className={`${inp} font-mono text-sm`} value={s.path} onChange={(e) => setSrc(i, { path: e.target.value })} aria-label="Folder path" placeholder={kind === "local" ? "C:\Users\you\Desktop\QA or E:\EXCITE-ED" : "\\\\server\share"} />
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
                      {opened
                        ? <Pill tone="ok">Connected · {opened.count} report{opened.count === 1 ? "" : "s"}</Pill>
                        : <Pill tone="muted">Not connected</Pill>}
                    </div>
                    {kind === "network" && (
                      <div className="grid gap-2 sm:col-span-3 sm:grid-cols-2">
                        <label className="text-sm">Username<input className={`${inp} mt-1`} placeholder="HOSPITAL\\username" autoComplete="off" value={s.user ?? ""} onChange={(e) => setSrc(i, { user: e.target.value })} /></label>
                        <label className="text-sm">Password<input type="password" className={`${inp} mt-1`} autoComplete="new-password" disabled={!isDesktop} placeholder={!isDesktop ? "Only in the desktop program" : saved[s.name] ? "Saved ✓ (type to change)" : "Network password"} value={pw[s.name] ?? ""} onChange={(e) => setPw((o) => ({ ...o, [s.name]: e.target.value }))} /></label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" className="mt-3" onClick={() => set({ sources: [...cfg.sources, { name: "New scanner", path: "\\\\", kind: "network" }] })}><Plus />Add folder</Button>
          </section>
          <Button variant="outline" onClick={exportJson}>Download Settings.json for the Windows program</Button>
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
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-1 font-medium">Problem report</h2>
            <p className="mb-3 text-sm text-muted-foreground">If something looks wrong, download this short summary and send it to whoever maintains the program. It has no reports or patient data.</p>
            <Button variant="outline" onClick={problemReport}>Download problem report</Button>
          </section>
        </TabsContent>
        <TabsContent value="log">
          <section className="rounded-lg border bg-card p-4"><LiveLogView tall /></section>
        </TabsContent>
        <TabsContent value="usb">
          <section className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="mb-1 font-medium">Carry the program on a USB stick</h2>
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Download the package and unzip it onto your USB stick (or Desktop).</li>
              <li>Put scanner PDFs in the <b className="text-foreground">Reports</b> folder (one sub-folder per scanner is ready).</li>
              <li>On any PC, double-click <b className="text-foreground">Start CT QA.bat</b>. No install, no admin.</li>
              <li>In the app, go to Folders → Open folder and pick the USB's Reports folder.</li>
            </ol>
            <Button onClick={async () => { const zip = await buildUsbPackage(cfg, window.location.origin); const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" })); const a = document.createElement("a"); a.href = url; a.download = "CTQA-USB.zip"; a.click(); URL.revokeObjectURL(url); log("success", "settings", "USB package downloaded"); }}>Download USB package</Button>
            <p className="mt-3 text-xs text-muted-foreground">The launcher opens this app in the PC's browser; PDFs on the USB are still read only on that PC and never uploaded.</p>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
