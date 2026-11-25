import { useConnection, useConfiguredFolders } from "@/components/qa/LiveLog";
import { folderRows } from "@/lib/qa-settings";
import { folderCheck } from "@/lib/qa-logger";
import { cn } from "@/lib/utils";

export function ScannerLights() {
  const connection = useConnection();
  const sources = useConfiguredFolders();
  const rows = folderRows(sources, connection.opened);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Scanner folder connections">
      {rows.map(({ source, opened }) => {
        const check = folderCheck(connection, source);
        const status = check?.ok === false ? "failed" : check?.ok || opened ? "reachable" : "unchecked";
        const label = status === "failed" ? "Last folder check failed" : status === "reachable" ? "Last folder check succeeded" : "Folder not checked";
        return <li key={`${source.name}-${source.path}`} className="flex items-center gap-2 text-xs" title={`${source.name}: ${label}`}>
          <span role="img" aria-label={label} className={cn("inline-block size-2.5 shrink-0 rounded-full", status === "failed" ? "bg-destructive" : status === "reachable" ? "bg-ok" : "bg-muted-foreground/45")} />
          <span className="font-medium break-words">{source.name}</span>
        </li>;
      })}
      {connection.state === "reading" && connection.total > 0 && <li className="text-xs tabular-nums text-muted-foreground">
        <span role="progressbar" aria-label={`Checking PDFs in ${connection.folder ?? "the folder"}`} aria-valuemin={0} aria-valuemax={connection.total} aria-valuenow={connection.done}>
          {connection.done} / {connection.total} PDFs
        </span>
      </li>}
    </ul>
  );
}
