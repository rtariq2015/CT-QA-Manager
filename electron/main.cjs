// Electron main process (CommonJS: the project's package.json sets "type": "module",
// so a .js file here would have no __dirname).
//
// The offline build is an ES-module SPA (Vite). Chromium refuses to load ES modules over the
// file:// protocol (CORS "origin 'null'"), so instead of win.loadFile() we serve the built
// client folder over a local loopback HTTP server and load that. Everything still runs on the
// local machine with no internet: the server only listens on 127.0.0.1.
const { app, BrowserWindow, shell, ipcMain, safeStorage } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const CLIENT_DIR = path.join(__dirname, "..", "dist", "client");

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

function send(res, code, body, headers) {
  res.writeHead(code, headers);
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found", { "content-type": "text/plain" });
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": "no-cache",
    });
  });
}

function startServer() {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      return send(res, 400, "Bad request", { "content-type": "text/plain" });
    }
    if (pathname === "/" || pathname === "") pathname = "/index.html";

    // Resolve inside CLIENT_DIR only; reject path traversal.
    const resolved = path.normalize(path.join(CLIENT_DIR, pathname));
    if (!resolved.startsWith(CLIENT_DIR)) {
      return send(res, 403, "Forbidden", { "content-type": "text/plain" });
    }

    fs.stat(resolved, (err, stat) => {
      if (!err && stat.isDirectory()) return serveFile(res, path.join(resolved, "index.html"));
      if (!err) return serveFile(res, resolved);
      // SPA fallback: unknown path -> index.html (hash history keeps routes in the hash).
      serveFile(res, path.join(CLIENT_DIR, "index.html"));
    });
  });
  // Ephemeral port on loopback only.
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    createWindow(`http://127.0.0.1:${port}/`);
  });
  return server;
}

function createWindow(url) {
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
    if (u.startsWith("http")) shell.openExternal(u);
    return { action: "deny" };
  });

  win.loadURL(url);
  return win;
}

// ---- Network logins: encrypted with Windows (DPAPI via safeStorage), never stored in plain text.
const loginFile = () => path.join(app.getPath("userData"), "logins.json");
function readLogins() { try { return JSON.parse(fs.readFileSync(loginFile(), "utf8")); } catch { return {}; } }
function getLogin(name) {
  const l = readLogins()[name];
  if (!l) return null;
  try { return { user: l.user, password: safeStorage.decryptString(Buffer.from(l.pass, "base64")) }; } catch { return null; }
}
ipcMain.handle("ctqa:saveLogin", (_e, name, user, password) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encryption is not available");
  const all = readLogins();
  all[name] = { user: String(user || ""), pass: safeStorage.encryptString(String(password || "")).toString("base64") };
  fs.writeFileSync(loginFile(), JSON.stringify(all));
  return true;
});
ipcMain.handle("ctqa:renameLogin", (_e, from, to) => {
  const all = readLogins();
  if (!all[from] || from === to || all[to]) return false;
  all[to] = all[from]; delete all[from];
  fs.writeFileSync(loginFile(), JSON.stringify(all));
  return true;
});
ipcMain.handle("ctqa:hasLogin", (_e, name) => !!readLogins()[name]);

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
function walkPdfs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkPdfs(full, out);
    else if (e.name.toLowerCase().endsWith(".pdf")) out.push(full);
    if (out.length > 5000) break;
  }
  return out;
}
ipcMain.handle("ctqa:readFolder", async (_e, source) => {
  const p = String(source.path || "");
  let login = null;
  if (source.kind === "network") {
    login = getLogin(source.name);
    const r = await netUse(shareRoot(p), login);
    if (r.startsWith("failed")) return { ok: false, error: `Login failed for ${source.name}. Check the username and password.`, files: [] };
  }
  try {
    const files = walkPdfs(p).map((f) => ({ name: path.basename(f), data: fs.readFileSync(f) }));
    return { ok: true, files };
  } catch {
    return { ok: false, error: `Cannot reach ${p}${login ? "" : source.kind === "network" ? " (no saved password)" : ""}`, files: [] };
  }
});

// Backup copies of every PDF read, organized Scanner/Year/Month/Type, next to the program.
const libraryRoot = () => app.isPackaged
  ? path.join(path.dirname(process.execPath), "QA Library")
  : path.join(app.getPath("userData"), "QA Library");
const safePart = (x) => String(x).replace(/[<>:"|?*\\/]/g, "_").replace(/^\.+/, "_").trim() || "_";
ipcMain.handle("ctqa:saveCopy", (_e, rel, data) => {
  try {
    const parts = String(rel).split("/").map(safePart);
    const dir = path.join(libraryRoot(), ...parts.slice(0, -1));
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(data);
    const name = parts[parts.length - 1];
    let target = path.join(dir, name), n = 2;
    while (fs.existsSync(target)) {
      if (fs.statSync(target).size === buf.length) return { ok: true, path: target, existed: true };
      target = path.join(dir, name.replace(/\.pdf$/i, `_${n++}.pdf`));
    }
    fs.writeFileSync(target, buf);
    return { ok: true, path: target, existed: false };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle("ctqa:openLibrary", async () => {
  fs.mkdirSync(libraryRoot(), { recursive: true });
  const err = await shell.openPath(libraryRoot());
  return { ok: !err, path: libraryRoot(), error: err || undefined };
});

let httpServer;

app.whenReady().then(() => {
  httpServer = startServer();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (httpServer) {
        const port = httpServer.address().port;
        createWindow(`http://127.0.0.1:${port}/`);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (httpServer) httpServer.close();
  if (process.platform !== "darwin") app.quit();
});
