import { useConnection, useConfiguredFolders } from "@/components/qa/LiveLog";
import { configuredScanners, folderRows } from "@/lib/qa-settings";
import { folderCheck } from "@/lib/qa-logger";
import { cn } from "@/lib/utils";

export function ScannerLights() {
  const connection = useConnection();
  const sources = useConfiguredFolders();
  const scanners = configuredScanners(sources);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Scanner folder connections">
      {scanners.map(({ scanner, folders }, index) => {
        const name = folders[0].name;
        const checks = folderRows(folders, connection.opened).map(({ source, opened }) => folderCheck(connection, source)?.ok ?? (opened ? true : undefined));
        const status = checks.includes(false) ? "failed" : checks.every((ok) => ok === true) ? "reachable" : "unchecked";
        const label = status === "failed" ? "A folder check failed" : status === "reachable" ? "All folder checks succeeded" : "Folder checks pending";
        return <li key={scanner ?? `folder-${index}`} className="flex items-center gap-2 text-xs" title={`${name}: ${label}`}>
          <span role="img" aria-label={label} className={cn("inline-block size-2.5 shrink-0 rounded-full", status === "failed" ? "bg-destructive" : status === "reachable" ? "bg-ok" : "bg-muted-foreground/45")} />
          <span className="font-medium break-words">{name}</span>
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
