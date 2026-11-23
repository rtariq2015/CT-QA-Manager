import { createFileRoute } from "@tanstack/react-router";
import { METRICS } from "@/lib/qa-data";
import { PageHeader } from "@/components/qa/ui";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & Siemens QA guide — CT QA Manager Companion" },
      { name: "description", content: "Plain-language guide to Siemens SOMATOM daily and monthly QA tests and how the companion files reports." },
      { property: "og:title", content: "Help & Siemens QA guide — CT QA Manager Companion" },
      { property: "og:description", content: "What each Siemens CT QA test checks and how reports are filed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Help,
});

const FAQ: [string, string][] = [
  ["What does “Filed as Daily/Monthly/Other” mean?", "It only says where a report is stored. It is not a clinical sign-off. A printed NOT OK always stays visible after filing."],
  ["How is Daily vs Monthly decided?", "From the words printed inside the PDF (Quality Daily, IEC Constancy, test list), never the file name or folder. Review shows reports that need a filing decision."],
  ["Why is “Monthly” set by the department?", "Monthly groups supported checks from filed Monthly PDFs. You can set the due day in Settings."],
  ["One month, several PDFs?", "Yes. Monthly tests can be spread over several PDFs. The Monthly page combines them per scanner."],
  ["Are reports uploaded anywhere?", "The app reads PDFs on this computer. The Windows app keeps a copy in the QA Library next to the program."],
];

function Help() {
  const daily = METRICS.filter((m) => m.frequency === "Daily");
  const monthly = METRICS.filter((m) => m.frequency === "Monthly");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Help" title="Siemens QA guide" />
      {[["Daily tests", daily], ["Monthly / constancy tests", monthly]].map(([title, list]) => (
        <section key={title as string} className="mb-6 rounded-lg border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">{title as string}</h2>
          <dl className="divide-y">
            {(list as typeof METRICS).map((m) => (
              <div key={m.id} className="grid gap-1 py-2.5 sm:grid-cols-[200px_1fr]">
                <dt className="font-medium">{m.label} <span className="font-mono text-sm text-muted-foreground">{m.unit}</span></dt>
                <dd className="text-muted-foreground">{m.note}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-3 text-lg font-semibold">Common questions</h2>
        {FAQ.map(([q, a]) => (<details key={q} className="border-t py-3 first-of-type:border-t-0"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-muted-foreground">{a}</p></details>))}
      </section>
    </div>
  );
}
