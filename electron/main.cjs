// Electron main process (CommonJS: the project's package.json sets "type": "module",
// so a .js file here would have no __dirname).
//
// The desktop build uses a local protocol so Chromium can load ES modules and keep the
// same storage origin for scanner settings and filing decisions across launches.
const { app, BrowserWindow, dialog, shell, ipcMain, protocol, safeStorage } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { createCatalog, sourceFingerprint } = require("./catalog.cjs");
const { createHash, randomUUID } = require("crypto");

const CLIENT_DIR = path.join(__dirname, "..", "dist", "client");
const APP_SCHEME = "ctqa";
const APP_HOST = "app";
const APP_URL = `${APP_SCHEME}://${APP_HOST}/`;

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

async function serveApp(request) {
  let pathname;
  try {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response("Not found", { status: 404 });
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const saved = /^\/saved-report\/([a-f0-9]{64})\.pdf$/.exec(pathname);
  if (saved) {
    try {
      const pdf = catalog.pdf(saved[1]);
      if (!pdf) return new Response("Saved PDF unavailable", { status: 404 });
      return new Response(await fs.promises.readFile(pdf), {
        headers: { "content-type": "application/pdf", "cache-control": "no-store" },
      });
    } catch {
      return new Response("Saved PDF unavailable", { status: 404 });
    }
  }

  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(CLIENT_DIR, `.${pathname}`);
  const relative = path.relative(CLIENT_DIR, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = await fs.promises.readFile(file);
    const contentType = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    return new Response(body, { headers: { "content-type": contentType } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0f14",
    title: "CT QA Manager",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Open external links (help, docs) in the system browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith("https://") || u.startsWith("http://")) void shell.openExternal(u);
    const archived = u.startsWith(APP_URL) && /^saved-report\/([a-f0-9]{64})\.pdf$/.exec(u.slice(APP_URL.length));
    if (archived) {
      const pdf = catalog.pdf(archived[1]);
      if (pdf) void shell.openPath(pdf);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, targetUrl) => {
    event.preventDefault();
    // Links in the prerendered HTML use paths. In the desktop app those routes belong in the hash.
    if (targetUrl.startsWith(APP_URL)) {
      const target = new URL(targetUrl);
      const route = target.pathname === "/" && target.hash.startsWith("#/")
        ? target.hash
        : `#${target.pathname}${target.search}${target.hash}`;
      const next = `${APP_URL}${route}`;
      if (win.webContents.getURL() !== next) void win.loadURL(next);
    }
  });

  void win.loadURL(`${APP_URL}#/`);
  return win;
}

function handleAppMessage(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !frame.url.startsWith(APP_URL)) {
      throw new Error("Desktop actions are only available in the app window");
    }
    return handler(event, ...args);
  });
}

const settingsPath = () => path.join(app.isPackaged ? path.dirname(process.execPath) : app.getPath("userData"), "Settings.json");

handleAppMessage("ctqa:readSettings", () => {
  try {
    return fs.readFileSync(settingsPath(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
});

handleAppMessage("ctqa:saveSettings", (_event, json) => {
  const file = settingsPath();
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, json, "utf8");
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
});

// ---- Network logins: encrypted with Windows (DPAPI via safeStorage), never stored in plain text.
const loginFile = () => path.join(app.getPath("userData"), "logins.json");
function readLogins() { try { return JSON.parse(fs.readFileSync(loginFile(), "utf8")); } catch { return {}; } }
function getLogin(name) {
  const l = readLogins()[name];
  if (!l) return null;
  try { return { user: l.user, password: safeStorage.decryptString(Buffer.from(l.pass, "base64")) }; } catch { return null; }
}
handleAppMessage("ctqa:saveLogin", (_e, name, user, password) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encryption is not available");
  const all = readLogins();
  all[name] = { user: String(user || ""), pass: safeStorage.encryptString(String(password || "")).toString("base64") };
  fs.writeFileSync(loginFile(), JSON.stringify(all));
  return true;
});
handleAppMessage("ctqa:renameLogin", (_e, from, to) => {
  const all = readLogins();
  if (!all[from] || from === to || all[to]) return false;
  all[to] = all[from]; delete all[from];
  fs.writeFileSync(loginFile(), JSON.stringify(all));
  return true;
});
handleAppMessage("ctqa:hasLogin", (_e, name) => !!readLogins()[name]);

function shareRoot(p) { const m = /^(\\\\[^\\]+\\[^\\]+)/.exec(p); return m ? m[1] : null; }
function netUse(root, login) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" || !root || !login) return resolve("skipped");
    execFile("net", ["use", root, login.password, `/user:${login.user}`, "/persistent:no"], { windowsHide: true }, (err, _o, stderr) => {
      const match = /\b(?:System error|error)\s+(\d+)\b/i.exec(String(stderr));
      const nativeCode = match ? Number(match[1]) : /\b1219\b/.test(String(stderr)) ? 1219 : undefined;
      // Windows may already have a connection under another account. Try reading it.
      resolve(err ? { code: nativeCode === 1219 ? "credential-conflict" : "network-login-failed", nativeCode } : "ok");
    });
  });
}
async function walkPdfs(dir, out = []) {
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkPdfs(full, out);
    else if (e.name.toLowerCase().endsWith(".pdf")) out.push(full);
    if (out.length > 5000) throw new Error("This folder contains more than 5,000 PDFs. Select a scanner or date subfolder.");
  }
  return out;
}
handleAppMessage("ctqa:readFolder", async (_e, source, incremental = false) => {
  const p = String(source.path || "");
  let login = null;
  let loginResult = null;
  if (source.kind === "network") {
    login = getLogin(source.name);
    loginResult = await netUse(shareRoot(p), login);
    if (loginResult?.code === "network-login-failed") {
      return { ok: false, error: `Login failed for ${source.name}. Check the saved account and password.`, diagnostic: loginResult, files: [] };
    }
  }
  try {
    const paths = await walkPdfs(p);
    const files = [];
    const unreadableFiles = [];
    let unchanged = 0;
    for (const file of paths) {
      const name = path.basename(file);
      try {
        const before = await fs.promises.stat(file);
        const fingerprint = sourceFingerprint(file, before);
        if (incremental && catalog.hasSource(fingerprint)) {
          unchanged++;
          continue;
        }
        const data = await fs.promises.readFile(file);
        const after = await fs.promises.stat(file);
        files.push({ name, data, sourceKey: fingerprint === sourceFingerprint(file, after) ? fingerprint : undefined });
      } catch {
        unreadableFiles.push(name);
      }
    }
    return { ok: true, files, unreadableFiles, unchanged };
  } catch (error) {
    if (error.message.startsWith("This folder contains")) {
      return { ok: false, error: error.message, diagnostic: { code: "folder-limit" }, files: [] };
    }
    const code = loginResult?.code === "credential-conflict" ? "credential-conflict"
      : error.code === "EACCES" || error.code === "EPERM" ? "folder-access-denied"
      : error.code === "ENOENT" || error.code === "ENOTDIR" ? "folder-not-found" : "folder-unavailable";
    const nativeCode = loginResult?.nativeCode ?? (Number.isInteger(error.errno) ? error.errno : undefined);
    const message = code === "credential-conflict" ? "Windows already has a connection using a different account."
      : code === "folder-access-denied" ? "Access to the folder was denied."
      : code === "folder-not-found" ? "The folder or drive could not be found." : "The folder could not be opened.";
    return { ok: false, error: `${source.name}: ${message}`, diagnostic: { code, nativeCode }, files: [] };
  }
});

// Backup copies of every PDF read, organized Scanner/Year/Month/Type, next to the program.
const libraryRoot = () => app.isPackaged
  ? path.join(path.dirname(process.execPath), "QA Library")
  : path.join(app.getPath("userData"), "QA Library");
const catalog = createCatalog(libraryRoot);
handleAppMessage("ctqa:listCatalog", () => catalog.reports(APP_URL));
const safePart = (x) => String(x).trim().replace(/[<>:"|?*\\/]/g, "_").replace(/^\.+/, "_").trim() || "_";
function archivePath(rel) {
  return path.join(libraryRoot(), ...rel.split("/").map(safePart));
}

function checkArchiveDirectory(dir) {
  const relative = path.relative(fs.realpathSync(libraryRoot()), fs.realpathSync(dir));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Archive folder leaves the QA Library");
  }
}

function removePreviousCopies(previous, bytes, reportId) {
  for (const relative of previous) {
    const { dir, name, base } = path.parse(archivePath(relative));
    if (!fs.existsSync(dir)) continue;
    checkArchiveDirectory(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const suffix = entry.name.slice(name.length);
      if (!entry.isFile() || (entry.name !== base &&
          (!entry.name.startsWith(name) || !/^_\d+\.pdf$/i.test(suffix)))) continue;
      const file = path.join(dir, entry.name);
      if (catalog.hasAnotherReference(file, reportId)) continue;
      if (fs.statSync(file).size === bytes.length && fs.readFileSync(file).equals(bytes)) {
        fs.unlinkSync(file);
      }
    }
  }
}

handleAppMessage("ctqa:saveCopy", (_e, rel, data, previous = [], metadata) => {
  try {
    const destination = archivePath(rel);
    const { dir, name: stem, ext } = path.parse(destination);
    const alternatives = previous.filter((item) => path.dirname(archivePath(item)) !== dir);
    fs.mkdirSync(dir, { recursive: true });
    checkArchiveDirectory(dir);
    const buf = Buffer.from(data);
    const remember = (target) => {
      if (metadata) {
        try {
          catalog.save({ ...metadata, target, bytes: buf });
        } catch {
          return "PDF saved, but its catalog entry could not be updated";
        }
      }
      return undefined;
    };
    let target = destination;
    for (let suffix = 2; ; suffix++) {
      try {
        fs.writeFileSync(target, buf, { flag: "wx" });
        break;
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
      }
      const existing = fs.statSync(target);
      if (existing.isFile() && existing.size === buf.length && fs.readFileSync(target).equals(buf)) {
        const catalogError = remember(target);
        if (!catalogError) removePreviousCopies(alternatives, buf, metadata?.reportId);
        return { ok: true, path: target, existed: true, catalogError };
      }
      target = path.join(dir, `${stem}_${suffix}${ext}`);
    }
    const catalogError = remember(target);
    if (!catalogError) removePreviousCopies(alternatives, buf, metadata?.reportId);
    return { ok: true, path: target, existed: false, catalogError };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
const inbox = () => path.join(libraryRoot(), "Review Inbox");
const inboxCodes = new Set(["scanner-unrecognized", "invalid-report-date", "pdf-password-required", "invalid-pdf", "pdf-read-failed"]);

function inboxPath(id, extension) {
  if (typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id)) throw new Error("Invalid Review Inbox ID");
  checkArchiveDirectory(inbox());
  const file = path.join(inbox(), `${id}.${extension}`);
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error("Invalid Review Inbox file");
  return file;
}

function writeInboxFile(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function writeInboxRecord(entry) {
  writeInboxFile(inboxPath(entry.id, "json"), JSON.stringify(entry));
}

handleAppMessage("ctqa:saveFailedImport", (_event, name, code, data) => {
  if (typeof name !== "string" || !inboxCodes.has(code)) throw new Error("Invalid failed import");
  fs.mkdirSync(inbox(), { recursive: true });
  const bytes = Buffer.from(data);
  const id = createHash("sha256").update(bytes).digest("hex");
  const metadata = inboxPath(id, "json");
  if (fs.existsSync(metadata)) {
    const entry = JSON.parse(fs.readFileSync(metadata, "utf8"));
    return entry.reviewed ? null : entry;
  }
  const pdf = inboxPath(id, "pdf");
  if (!fs.existsSync(pdf)) writeInboxFile(pdf, bytes);
  const entry = { id, fileName: path.basename(name), code, at: new Date().toISOString(), archived: true };
  writeInboxRecord(entry);
  return entry;
});

handleAppMessage("ctqa:listFailedImports", () => {
  if (!fs.existsSync(inbox())) return [];
  checkArchiveDirectory(inbox());
  return fs.readdirSync(inbox(), { withFileTypes: true })
    .filter((file) => file.isFile() && /^[0-9a-f]{64}\.json$/.test(file.name))
    .flatMap((file) => {
      try {
        const id = file.name.slice(0, -5);
        const entry = JSON.parse(fs.readFileSync(inboxPath(id, "json"), "utf8"));
        return !entry.reviewed && entry.id === id && typeof entry.fileName === "string" &&
          typeof entry.at === "string" && inboxCodes.has(entry.code) ? [entry] : [];
      } catch {
        return [];
      }
    });
});

handleAppMessage("ctqa:openFailedImport", (_event, id) => fs.promises.readFile(inboxPath(id, "pdf")));
handleAppMessage("ctqa:reviewFailedImport", (_event, id) => {
  const entry = JSON.parse(fs.readFileSync(inboxPath(id, "json"), "utf8"));
  writeInboxRecord({ ...entry, id, reviewed: true });
});

handleAppMessage("ctqa:openLibrary", async () => {
  fs.mkdirSync(libraryRoot(), { recursive: true });
  const err = await shell.openPath(libraryRoot());
  return { ok: !err, path: libraryRoot(), error: err || undefined };
});

app.whenReady().then(() => {
  if (!fs.existsSync(path.join(CLIENT_DIR, "index.html"))) {
    dialog.showErrorBox("CT QA Manager", "The desktop app files are missing. Rebuild the desktop app or re-extract the complete Windows package.");
    app.quit();
    return;
  }
  protocol.handle(APP_SCHEME, serveApp);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
