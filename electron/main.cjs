// Electron main process (CommonJS: the project's package.json sets "type": "module",
// so a .js file here would have no __dirname).
//
// The desktop build uses a local protocol so Chromium can load ES modules and keep the
// same storage origin for scanner settings and filing decisions across launches.
const { app, BrowserWindow, dialog, shell, ipcMain, protocol, safeStorage } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

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
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, targetUrl) => {
    event.preventDefault();
    // Links in the prerendered HTML use paths. In the desktop app those routes belong in the hash.
    if (targetUrl.startsWith(APP_URL)) {
      const target = new URL(targetUrl);
      void win.loadURL(`${APP_URL}#${target.pathname}${target.search}${target.hash}`);
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
      // "Multiple connections" means it is already connected, which is fine.
      resolve(err && !/1219/.test(String(stderr)) ? `failed: ${String(stderr).trim()}` : "ok");
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
handleAppMessage("ctqa:readFolder", async (_e, source) => {
  const p = String(source.path || "");
  let login = null;
  if (source.kind === "network") {
    login = getLogin(source.name);
    const r = await netUse(shareRoot(p), login);
    if (r.startsWith("failed")) return { ok: false, error: `Login failed for ${source.name}. Check the username and password.`, files: [] };
  }
  try {
    const files = [];
    for (const file of await walkPdfs(p)) {
      files.push({ name: path.basename(file), data: await fs.promises.readFile(file) });
    }
    return { ok: true, files };
  } catch (error) {
    if (error.message.startsWith("This folder contains")) return { ok: false, error: error.message, files: [] };
    return { ok: false, error: `Cannot reach ${p}${login ? "" : source.kind === "network" ? " (no saved password)" : ""}`, files: [] };
  }
});

// Backup copies of every PDF read, organized Scanner/Year/Month/Type, next to the program.
const libraryRoot = () => app.isPackaged
  ? path.join(path.dirname(process.execPath), "QA Library")
  : path.join(app.getPath("userData"), "QA Library");
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

function removePreviousCopies(previous, bytes) {
  for (const relative of previous) {
    const { dir, name, base } = path.parse(archivePath(relative));
    if (!fs.existsSync(dir)) continue;
    checkArchiveDirectory(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const suffix = entry.name.slice(name.length);
      if (!entry.isFile() || (entry.name !== base &&
          (!entry.name.startsWith(name) || !/^_\d+\.pdf$/i.test(suffix)))) continue;
      const file = path.join(dir, entry.name);
      if (fs.statSync(file).size === bytes.length && fs.readFileSync(file).equals(bytes)) {
        fs.unlinkSync(file);
      }
    }
  }
}

handleAppMessage("ctqa:saveCopy", (_e, rel, data, previous = []) => {
  try {
    const destination = archivePath(rel);
    const { dir, name: stem, ext } = path.parse(destination);
    const alternatives = previous.filter((item) => path.dirname(archivePath(item)) !== dir);
    fs.mkdirSync(dir, { recursive: true });
    checkArchiveDirectory(dir);
    const buf = Buffer.from(data);
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
        removePreviousCopies(alternatives, buf);
        return { ok: true, path: target, existed: true };
      }
      target = path.join(dir, `${stem}_${suffix}${ext}`);
    }
    removePreviousCopies(alternatives, buf);
    return { ok: true, path: target, existed: false };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
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
