<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Demo data comes from the seeded generator in src/lib/qa-data.ts with a fixed TODAY; keep it deterministic so server and browser renders match.
- Record shapes mirror the Windows CT QA Manager (rtariq2015/QA-Manger) so designs can be ported back; filing state is in-memory in src/lib/qa-store.tsx (no backend).

- Keep uploaded QA PDFs browser-local and in-memory; load PDF.js only inside the file-reader action so private reports are never sent to a server or bundled.
- Parse printed QA status independently of filing, and retain tube, mode, slice, kernel, reference and per-reading limits; classification must never erase a printed exception.
- Reject unrecognized scanner identities and flag partial extraction rather than infer unprinted tolerances or clinical conclusions.
- Suggest Daily for a two-section IEC Constancy summary only when the printed tests are noise and homogeneity/water; filenames and archive folders are not reliable classifications.
- Library folder layout (scanner/year/month/type) and exports live in src/lib/qa-library.ts so Folders, Exports and any Windows port share one layout.
- Scanner folder settings (source shape, defaults, the hand-picked Local/Network kind, Settings.json shape) live in src/lib/qa-settings.ts so the Settings page, the export and any Windows port share one definition.
- Backups (src/lib/qa-backup.ts) hold only filing decisions and settings, are validated as a whole before restore, and never include PDFs or passwords.
- Clean routine reports auto-file via src/lib/qa-triage.ts; Review holds only printed NOT OK, out-of-limit, Other or unreadable reports, because filing is not clinical sign-off.

- Reports calendar opens date status first, then the selected report in one shared dialog; available local PDFs open first to avoid nesting the viewer inside calendar cells.
- X.cite (syngo VA40A) reports are parsed by src/lib/qa-parser-va40.ts, dispatched from parseSiemensPages; keep VB-layout rules in qa-parser.ts — the layouts differ (US dates, summary table, single tube).
- Saved copies (ZIP and organized folders) use tidyFileName/savedPaths in src/lib/qa-library.ts; originals are never renamed and the CSV keeps the original name.
- Activity log lives in src/lib/qa-logger.ts (capped, redacts secrets, no PDF text); top-bar scanner lights and Settings share its folder connection state, and folderRows/folderMatches in src/lib/qa-settings.ts decide which configured folder an opened one belongs to.
- Folder reading is shared through useFolderReader, requesting Desktop as the native picker's starting location; browser selection cannot launch Windows Explorer or bypass folder permission.
- USB package files are defined in src/lib/qa-portable.ts; its launcher opens the app URL, so PDFs are still read only in the browser.
- Offline desktop build is gated by VITE_DESKTOP=1: vite.config.ts emits a static SPA index.html (base './', prerendered home), router.tsx uses hash history in the desktop renderer, and electron/main.cjs serves dist/client from the stable ctqa://app/ address; the web preview keeps browser history and base '/'.
- Desktop network logins are saved by electron/main.cjs with safeStorage (Windows encryption) in userData, never in localStorage or Settings.json; the window reaches them only through the preload bridge (src/lib/qa-desktop.ts), and the browser build keeps the password box disabled.
