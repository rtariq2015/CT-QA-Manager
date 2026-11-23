import { useConnection, useConfiguredFolders } from "@/components/qa/LiveLog";
import { folderRows } from "@/lib/qa-settings";
import { cn } from "@/lib/utils";

/** Compact top-bar lights, using the same folder matching as Settings. */
export function ScannerLights() {
  const c = useConnection();
  const sources = useConfiguredFolders();
  const rows = folderRows(sources, c.opened);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Scanner folder connections">
        {rows.map(({ source, opened }) => (
          <li key={`${source.name}-${source.path}`} className="flex items-center gap-2 text-xs" title={`${source.name}: ${opened ? "Folder opened in this window" : "Folder not opened in this window"}`}>
            <StatusLight on={!!opened} />
            <span className="font-medium break-words">{source.name}</span>
          </li>
        ))}
    </ul>
  );
}

/** Small green (connected) or red (not connected) light. */
export function StatusLight({ on, className }: { on: boolean; className?: string }) {
  return (
    <span role="img" aria-label={on ? "Connected" : "Not connected"} className={cn("relative inline-flex size-3 shrink-0", className)}>
      {on && <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-ok opacity-60" />}
      <span className={cn("relative size-3 rounded-full ring-2 ring-background", on ? "bg-ok shadow-[0_0_8px_var(--ok)]" : "bg-destructive shadow-[0_0_6px_var(--destructive)]")} />
    </span>
  );
}
