import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { desktop } from "@/lib/qa-desktop";
import { failureLabels, type FailedImport } from "@/lib/qa-import-failure";
import { useQa } from "@/lib/qa-store";

export function FailedImports() {
  const { failedImports, markFailedImportReviewed } = useQa();
  const [picked, setPicked] = useState<string>();
  const current = failedImports.find(({ id }) => id === picked) ?? failedImports[0];
  if (!current) return <p className="text-muted-foreground">No import issues to review.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="max-h-80 overflow-y-auto rounded-lg border bg-card" aria-label="Failed PDFs">
        {failedImports.map((failure) => (
          <Button key={failure.id} variant={current.id === failure.id ? "secondary" : "ghost"}
            className="h-auto w-full justify-start whitespace-normal break-all px-3 py-2 text-left"
            aria-pressed={current.id === failure.id} onClick={() => setPicked(failure.id)}>
            {failure.fileName}
          </Button>
        ))}
      </div>
      <FailedPreview key={current.id} failure={current} onReview={markFailedImportReviewed} />
    </div>
  );
}

function FailedPreview({ failure, onReview }: { failure: FailedImport; onReview: (failure: FailedImport) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let active = true;
    let preview = "";
    const open = async () => {
      try {
        const bytes = failure.original
          ? await failure.original.arrayBuffer()
          : failure.archived ? await desktop()?.openFailedImport(failure.id) : undefined;
        const blob = bytes ? new Blob([new Uint8Array(bytes)], { type: "application/pdf" }) : undefined;
        if (!active) return;
        if (!blob) { setUnavailable(true); return; }
        preview = URL.createObjectURL(blob);
        setUrl(preview);
      } catch {
        if (active) setUnavailable(true);
      }
    };
    void open();
    return () => { active = false; if (preview) URL.revokeObjectURL(preview); };
  }, [failure]);

  const review = async () => {
    setWorking(true);
    try {
      await onReview(failure);
    } catch {
      toast.error("Could not mark this PDF reviewed");
      setWorking(false);
    }
  };

  return (
    <section className="min-w-0 space-y-4" aria-label="Original PDF">
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="break-all text-lg font-semibold">{failure.fileName}</h2>
        <p className="text-sm font-medium text-destructive">{failureLabels[failure.code]}</p>
        <p className="text-sm text-muted-foreground">Open the original to check it. Mark reviewed to clear it from this inbox.</p>
        <div className="flex flex-wrap gap-2">
          {url && <Button asChild variant="outline"><a href={url} download={failure.fileName}>Save original PDF</a></Button>}
          <Button variant="outline" disabled={working} onClick={() => void review()}>Mark reviewed</Button>
        </div>
      </div>
      {url
        ? <iframe title="Original failed import PDF" src={url} className="h-[70vh] w-full rounded-md border bg-card" />
        : <p className="text-sm text-muted-foreground">{unavailable ? "The original PDF is unavailable. Reopen it from its source folder." : "Opening original PDF…"}</p>}
    </section>
  );
}
