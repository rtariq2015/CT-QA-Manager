# CT QA Manager 5.8.0

A CT quality-assurance companion for a hospital Siemens fleet: it reads the scanner's QA PDF
reports, files them as **Daily / Monthly / Other**, flags anything that needs a person, and can run
completely offline as a Windows program.

This is the modern companion to [CT QA Manager Pro](https://github.com/rtariq2015/QA-Manger), the
offline PowerShell program. Record shapes and filing logic mirror the original so work can be
ported back.

**Release:** <https://github.com/rtariq2015/radiology-qa-insight/releases/tag/v5.8.0>

## What it does

### Reads the actual PDFs
- Mozilla PDF.js plus a purpose-built Siemens parser. Everything stays on the machine — no PDF is
  ever uploaded anywhere.
- Handles the older syngo VB reports and the syngo VA40A reports (X.cite).
- Pulls out scanner identity, serial, date, printed sections with OK / NOT OK, per-slice tables with
  tube A/B, kV, kernel, reference and printed limits, MTF and contrast scale.
- Printed exceptions are never overwritten by a guess. Unreadable or partial reports are flagged,
  not silently classified.

### Files reports by itself
- Clean routine reports are filed automatically as Daily / Monthly / Other.
- Only these stop for a person: a printed NOT OK, a reading outside its printed limit, an
  unrecognized scanner, or an incomplete extraction.
- The Needs attention page shows **why** a report stopped and **what to do** next.
- Suggests Daily for a two-section IEC Constancy summary only when the printed tests are exactly
  noise and homogeneity / water. Filenames and archive folders are never used to classify.

### Folders and exports
- Organized folder view: QA Library → scanner → year → month → Daily / Monthly / Other, with
  breadcrumb navigation and per-folder PDF counts.
- Exports page builds a ZIP of PDFs plus CSV and HTML summary, with filters.
- Saved copies use tidy names such as `CT_EXCITE_QA_11-23-2026.pdf`. Original files are never
  renamed or moved, and the CSV keeps the original name.
- Export waits until every PDF is read and says how many are included, so nothing is left out.

### Scanner folders
- Each scanner points at a network share or a local / Desktop / USB folder, switched with one
  toggle.
- `Settings.json` download for the Windows program.
- Top-bar lights show which scanner folders are actually connected.

### Offline Windows desktop program
- Runs on the local machine with no internet and no browser tab.
- Network passwords are stored with Windows' own encryption on that computer — never in
  `Settings.json`, a backup, or browser storage.
- Connects to configured scanner folders by itself on start-up.
- Saves a copy of every real PDF into a **QA Library** folder next to the program, sorted by
  scanner / year / month / type; a **Saved PDFs** button opens it in Windows Explorer.
- Duplicates are skipped, so re-opening a folder does not create doubles.

### Other
- Live activity log with filters, pause, download as text, and a diagnostic file. The log holds no
  PDF contents, passwords or patient data.
- Light and dark mode, print view, keyboard shortcuts, help page.
- Filing state survives a refresh.
- Backup / restore of filing decisions and settings only — never PDFs or passwords.

## Scanner fleet

SOMATOM Drive, SOMATOM Flash, SOMATOM Edge, SOMATOM X.cite. X.cite reports come from two units
(serials 123193 and 124068) and use the syngo VA40A layout.

## Running it

### Web preview
```sh
npm install
npm run dev
npm test        # 60 tests
npm run build
```

### Offline Windows program
```sh
VITE_DESKTOP=1 npm run build
npx electron-packager . "CT QA Manager" --platform=win32 --arch=x64 --out=release --no-asar --overwrite
```
The desktop build emits a static SPA (`base: './'`, hash routing). Electron serves `dist/client`
over a loopback HTTP server because Chromium blocks ES modules over `file://`.

## Things to know
- The web version cannot crawl a network drive on its own; a browser must be shown the folder. The
  desktop program does not have that limit.
- Google Fonts fall back to system fonts when offline (cosmetic only).
- Demo data is generated deterministically from `src/lib/qa-data.ts` with a fixed date, so the
  server and browser renders match.
