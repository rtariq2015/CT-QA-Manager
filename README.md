# CT QA Manager

**An offline Windows workspace for Siemens CT quality assurance.** Open scanner QA PDFs, track daily receipt and monthly checks, and file reports into a local QA Library.

[**Download for Windows x64**](https://github.com/rtariq2015/CT-QA-Manager/releases/latest/download/CT-QA-Manager-Windows-x64.zip) · [Release notes](https://github.com/rtariq2015/CT-QA-Manager/releases/latest) · [CT QA Manager Pro](https://github.com/rtariq2015/QA-Manger)

![CT QA Manager dashboard on first launch](docs/images/today.png)

## Start on Windows

1. Download the Windows ZIP and extract the full folder to a writable location.
2. Double-click **CT QA Manager.exe**. The app opens in its own window.
3. Choose **Folders → Open folder** for local PDFs, or save scanner locations under **Settings**. Network shares require access to the network that hosts them.

Use **Saved PDFs** to open the **QA Library** next to the program. Keep the full program folder together when copying to another computer or USB drive. Before upgrading, keep a copy of your QA Library and export a settings and filing backup.

## Update an existing Windows copy

1. Close CT QA Manager and extract the [smaller Windows Update ZIP](https://github.com/rtariq2015/CT-QA-Manager/releases/latest/download/CT-QA-Manager-Update-x64.zip).
2. Double-click **Apply-Update.cmd** and paste the path of the folder containing **CT QA Manager.exe**.
3. Open the program again. The update replaces the app files and keeps the previous app files as a backup.

The updater checks the installed Electron version. Use the full Windows ZIP if the runtime changes.

## Copy scanner settings

Click **Save** in Windows Settings to write **Settings.json** beside the executable. Copy it beside the executable in another copy before launching, or use **Settings → Scanner folders → Import Settings.json**. The file contains folder paths, usernames and scheduling preferences. Passwords stay encrypted on the original PC and may need to be entered again on another Windows account or computer.

## Workspaces

| Workspace | What you can do |
| --- | --- |
| **Today** | Check Daily QA receipt, pending reviews, printed exceptions, and monthly deadlines. |
| **Reports** | Search imported reports, open the source PDF, and check receipt on the calendar. |
| **Review** | Check unreadable or flagged results, file as Daily, Monthly, or Other, and undo a filing. |
| **Monthly and Trends** | View the monthly checklist and chart supported readings against the printed limits. |
| **Folders and Exports** | Browse the organized library and export PDFs with a CSV and HTML summary. |
| **Settings** | Configure scanner folders and the QA schedule, or back up settings and filing decisions. |

## How reports are handled

The parser supports older Siemens syngo VB PDFs and syngo VA40A reports, including SOMATOM Drive, Flash, Edge, and X.cite. It retains printed results and supported readings with their printed tolerances. Incomplete extractions and exceptions stay visible for review. Filing is a document classification step and leaves the scanner’s printed result intact.

The desktop app works offline with local PDFs. Windows protects saved network credentials, and backups include filing decisions and settings. The report library starts empty until you import PDFs or connect a scanner folder.

## Share a diagnostic

Open **Log → Download diagnostic file** to share scan totals, read timings, cache hits, review reasons, and connection error codes. The diagnostic keeps the last 60 scans separately from the detailed activity log and omits file names, folder paths, and PDF contents. Use **Download log** for the detailed local history.

## Build from source

```sh
npm install
npm test
npm run dev
npm run build
npm run package:windows
```

The package command creates `electron-release/CT QA Manager-win32-x64`. The desktop renderer uses a stable local address for settings and filing decisions across restarts. The web build processes PDFs locally after you select a folder or files using the browser.
