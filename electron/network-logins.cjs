const fs = require("node:fs");
const { randomUUID } = require("node:crypto");

function shareRoot(value) {
  if (typeof value !== "string") return null;
  const match = /^\\\\([\w.-]+)\\([^\\<>:"|?*\x00-\x1f]+)(?:\\|$)/.exec(value.trim().replace(/\//g, "\\"));
  if (!match || /[. ]$/.test(match[1]) || /[. ]$/.test(match[2])) return null;
  return `\\\\${match[1]}\\${match[2]}`;
}

const account = (user) => typeof user === "string" ? user.trim().toLowerCase() : "";
const scope = (root, user) => JSON.stringify([root.toLowerCase(), account(user)]);
const isLogin = (entry) => entry && typeof entry.user === "string" && typeof entry.pass === "string" && entry.pass.length > 0;

function read(file) {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8"))));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function createNetworkLogins(file, legacyFile, encryption) {
  function selection(source) {
    const root = source?.kind === "network" && shareRoot(source.path);
    if (!root) return { status: "none" };
    const key = scope(root, source.user);
    const entries = read(file);
    const current = entries.get(key);
    if (isLogin(current)) return { status: "saved", entry: current, root };
    const legacy = read(legacyFile).get(source.name);
    if (isLogin(legacy) && account(legacy.user) === account(source.user)) return { status: "legacy", entry: legacy, root };
    if (isLogin(legacy) || [...entries.values()].some((entry) => entry?.name === source.name)) return { status: "required", root };
    return { status: "none", root };
  }

  function saveEntry(source, root, entry) {
    const entries = read(file);
    entries.set(scope(root, source.user), { name: source.name, ...entry });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(entries)), { flag: "wx" });
      fs.renameSync(temp, file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }

  return {
    status(source) { return selection(source).status; },
    save(source, password) {
      const root = source?.kind === "network" && shareRoot(source.path);
      if (!root) throw new Error("Enter a network path with a server and share before saving the login.");
      if (typeof password !== "string" || !password) throw new Error("Enter the network password.");
      if (!encryption.isEncryptionAvailable()) throw new Error("Windows encryption is not available.");
      saveEntry(source, root, { user: (source.user ?? "").trim(), pass: encryption.encryptString(password).toString("base64") });
    },
    approveLegacy(source) {
      const { status, entry, root } = selection(source);
      if (status !== "legacy") return false;
      saveEntry(source, root, { user: entry.user, pass: entry.pass });
      return true;
    },
    connection(source) {
      const { status, entry, root } = selection(source);
      if (status !== "saved") return { status, root };
      try {
        const password = encryption.decryptString(Buffer.from(entry.pass, "base64"));
        return { status, root, login: { user: entry.user, password } };
      } catch {
        return { status: "required", root };
      }
    },
  };
}

module.exports = { createNetworkLogins };
