import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { desktop } from "@/lib/qa-desktop";

export function DriveBackup({ backupJson }: { backupJson: () => string }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void desktop()?.backupDestination().then(setFolder).catch(() => setError("Could not load the saved destination."));
  }, []);

  async function run(action: "choose" | "disconnect" | "test" | "backup") {
    const bridge = desktop();
    if (!bridge || busy) return;
    setBusy(true);
    setStatus("");
    setError("");
    try {
      if (action === "choose") setFolder(await bridge.chooseBackupDestination());
      else if (action === "disconnect") {
        await bridge.disconnectBackupDestination();
        setFolder(null);
        setStatus("Destination disconnected.");
      } else {
        const file = await bridge.writeOffsiteBackup(action === "backup" ? backupJson() : undefined);
        setStatus(`Saved ${file}. Check Google Drive to confirm syncing has finished.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 space-y-3 rounded-lg border bg-card p-4" aria-labelledby="drive-backup-title">
      <h2 id="drive-backup-title" className="font-medium">Google Drive backup (beta)</h2>
      <p className="text-sm text-muted-foreground">Sign into your approved account in Google Drive for desktop, then choose a folder from that account. A full backup includes the QA Library, settings, and filing decisions.</p>
      {folder && <p className="break-all text-sm"><strong className="font-medium">Destination</strong> {folder}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void run("choose")}>{folder ? "Change destination" : "Choose Google Drive folder"}</Button>
        {folder && (<>
          <Button variant="outline" disabled={busy} onClick={() => void run("test")}>Write test file</Button>
          <Button disabled={busy} onClick={() => void run("backup")}>Back up now</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run("disconnect")}>Disconnect</Button>
        </>)}
      </div>
      {busy && <p role="status" className="text-sm text-muted-foreground">Working…</p>}
      {status && <p role="status" className="break-all text-sm">{status}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Restore a full backup</summary>
        <p className="mt-2">Download a completed backup folder from Drive. With CT QA Manager closed, copy its entire QA Library into a fresh Windows installation next to the executable. Open that copy of the app and use Restore backup above to import CTQA-backup.json.</p>
      </details>
    </section>
  );
}
