import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Folder, FolderOpen, FolderInput, Download, Library } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useConnection } from "@/components/qa/LiveLog";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/qa/ui";
import { useQa } from "@/lib/qa-store";
import { log } from "@/lib/qa-logger";
import { picker, useFolderReader } from "@/components/qa/useFolderReader";
import { FolderExplorer } from "@/components/qa/FolderExplorer";
import { buildTree, buildZip, download, folderParts, savedPaths, type TreeNode } from "@/lib/qa-library";
import { desktop } from "@/lib/qa-desktop";

export const Route = createFileRoute("/folders")({
  head: () => ({
    meta: [
      { title: "Folders — CT QA Manager Companion" },
      { name: "description", content: "Open a folder of CT QA reports and see them sorted by scanner, year, month and report type." },
      { property: "og:title", content: "Folders — CT QA Manager Companion" },
      { property: "og:description", content: "Organized QA report library by scanner, year and month." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Folders,
});

function Folders() {
  const { reports } = useQa();
  const bridge = desktop();
  const [view, setView] = useState<"folders" | "tree">("folders");
  const [source, setSource] = useState<"all" | "local">("all");
  const shown = useMemo(() => source === "local" ? reports.filter((r) => r.source === "uploaded") : reports, [reports, source]);
  const tree = useMemo(() => buildTree(shown), [shown]);
  const localCount = reports.filter((r) => r.source === "uploaded" && r.originalUrl).length;

  const { busy, setBusy, openFolder, inputEl } = useFolderReader(() => setSource("local"));

  const reading = useConnection().state === "reading";
  async function saveOrganized() {
    const p = picker();
    const local = reports.filter((r) => r.originalUrl);
    if (!local.length) { toast.error("Open a folder of reports first."); return; }
    try {
      if (!p) {
        setBusy("Building ZIP…");
        const { zip } = await buildZip(local, "QA Library");
        download("QA-Library.zip", zip, "application/zip");
        log("success", "folder", `Saved QA-Library.zip (${local.length} reports)`);
        return;
      }
      const root = await p({ mode: "readwrite" });
      const paths = savedPaths(local);
      for (const r of local) {
        setBusy(`Copying ${r.fileName}…`);
        const parts = (paths.get(r.id) ?? [...folderParts(r), r.fileName].join("/")).split("/"); const name = parts.pop()!;
        let d = root; for (const part of parts) d = await d.getDirectoryHandle(part, { create: true });
        const response = await fetch(r.originalUrl!);
        if (!response.ok) throw new Error(`Could not read ${r.fileName}`);
        const pdf = await response.blob();
        let candidate = name;
        for (let suffix = 2; ; suffix++) {
          try { await d.getFileHandle(candidate); }
          catch (error) {
            if (error instanceof DOMException && error.name === "NotFoundError") break;
            throw error;
          }
          candidate = name.replace(/\.pdf$/i, `_${suffix}.pdf`);
        }
        const writer = await (await d.getFileHandle(candidate, { create: true })).createWritable();
        await writer.write(pdf);
        await writer.close();
      }
      toast.success(`${local.length} reports copied into organized folders`); log("success", "folder", `Saved organized copy: ${local.length} reports into "${root.name}"`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Could not save organized PDFs");
      }
    } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Folders" title="Report library">
        <div className="flex flex-wrap gap-2">
          {bridge && <Button variant="outline" onClick={() => void bridge.openLibrary().then(({ ok, error }) => {
            if (!ok) toast.error(error ?? "The saved PDFs folder could not be opened");
          }, () => toast.error("The saved PDFs folder could not be opened"))}><Library />Open saved PDFs</Button>}
          <Button onClick={openFolder} disabled={!!busy}><FolderOpen />Import from folder</Button>
        </div>
      </PageHeader>
      {inputEl}

      <div className="mb-5 grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <p className="text-muted-foreground">Browse saved reports by scanner, year, month, and report type.</p>
        <Button variant="outline" onClick={saveOrganized} disabled={!!busy || reading || !localCount}>{picker() ? <FolderInput /> : <Download />}{reading ? "Wait, still reading PDFs…" : "Save organized copy"}</Button>
        {busy && <p className="font-mono text-xs text-muted-foreground sm:col-span-2">{busy}</p>}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="ml-auto flex gap-1 rounded-md border p-0.5 order-last">
          <Button variant={view === "folders" ? "secondary" : "ghost"} size="sm" onClick={() => setView("folders")}>Folder view</Button>
          <Button variant={view === "tree" ? "secondary" : "ghost"} size="sm" onClick={() => setView("tree")}>List view</Button>
        </div>
        <Button variant={source === "all" ? "default" : "outline"} size="sm" onClick={() => setSource("all")}>All reports</Button>
        {reports.some((report) => report.source !== "uploaded") && <Button variant={source === "local" ? "default" : "outline"} size="sm" onClick={() => setSource("local")}>Imported PDFs</Button>}
      </div>
      {view === "folders" ? <FolderExplorer reports={shown} /> : (
      <div className="rounded-lg border bg-card p-2">
        {tree.children.size === 0 ? <p className="p-6 text-center text-muted-foreground">Import a folder of QA PDFs to start the library.</p>
          : [...tree.children.values()].map((n) => <Node key={n.name} node={n} depth={0} />)}
      </div>)}
    </div>
  );
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const kids = [...node.children.values()].sort((a, b) => depth === 0 ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted" style={{ paddingLeft: 8 + depth * 18 }}>
        {kids.length ? <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} /> : <span className="w-4" />}
        {open ? <FolderOpen className="size-4 shrink-0 text-primary" /> : <Folder className="size-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.notOk > 0 && <Pill tone="bad">{node.notOk} NOT OK</Pill>}
        <span className="font-mono text-xs text-muted-foreground">{node.count} PDF</span>
      </button>
      {open && kids.map((k) => <Node key={k.name} node={k} depth={depth + 1} />)}
    </div>
  );
}
