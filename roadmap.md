# CT QA Companion — progress

## Done
- [x] Companion app: Today, Review, Reports, Monthly, Trends, Folders, Exports, Settings.
- [x] Reads real Siemens PDFs on this computer only (Drive, Edge, Flash); tube A/B, printed limits, printed NOT OK kept after filing.
- [x] Daily / Monthly / Other suggested from the report text (incl. Flash IEC Constancy dailies, acceptance → Other).
- [x] Checked all 1,370 supplied PDFs: 10 unreadable, 99 without supported readings, 110 suggestions differ from archive; missed acceptance NOT OK fixed.
- [x] Folders: open folder, sorted Scanner → Year → Month → Type; Exports: filtered ZIP + CSV + HTML summary.
- [x] Settings: scanner folders with username; password kept only by the Windows program.
- [x] Settings: each folder switches between Local / Desktop and Network by hand; local folders need no login, and Settings.json records the chosen type.
- [x] All four scanners shown (X.cite, Flash, Edge, Drive); X.cite Daily + Monthly VA40A reports read.
- [x] Cleaner layout: grouped menu, phone bottom bar, light/dark switch on top, calmer Today page, Settings tabs.
- [x] Search inside reports, backup/restore, problem report, Help guide, shortcuts (?), print Monthly.
- [x] Monthly cards on Today: tests found, progress bar, what is still missing, due/overdue status.

- [x] Live activity log (Log button), download log / diagnostic file, folder connection pill, USB package.
- [x] Compact red/green scanner lights in the top bar; removed the extra connection panel and aggregate badge; Open folder requests Desktop as its starting location.
- [x] Downloadable Windows desktop program: VITE_DESKTOP build + Electron (electron/main.cjs serves dist/client over local 127.0.0.1), packaged to CT-QA-Manager-Windows.zip; runs offline, no internet.

## Open
- [x] Collapse Reports/Exports filters into one Filters button.
- [x] Code is on GitHub in the private radiology-qa-insight repository (auto-synced) and v5.8.0 release published there.
- [ ] Publish a clean public repository for the program with its own v5.8.0 release (user chose Public).
- [ ] Review the 110 filing differences and 99 no-reading reports with Rizwan.
- [x] X.cite added (real Daily + Monthly VA40A reports read)
- [ ] Windows launcher that pulls from network folders and opens this dashboard — waiting on the new GitHub repository.
- [ ] Test ZIP download and "Save organized copy" on a hospital PC.
- [ ] Fully offline USB copy: the desktop program itself now runs offline from the stick; a launcher that auto-pulls PDFs from folders still needs the Windows repository.
