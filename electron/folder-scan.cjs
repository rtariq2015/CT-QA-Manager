const fs = require("node:fs/promises");
const path = require("node:path");
const { sourceFingerprint } = require("./catalog.cjs");

const MAX_FILES = 5000;
const BATCH_FILES = 8;
const BATCH_BYTES = 16 * 1024 * 1024;

async function findPdfs(dir, files) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await findPdfs(file, files);
    else if (entry.name.toLowerCase().endsWith(".pdf")) files.push(file);
    if (files.length > MAX_FILES) {
      throw Object.assign(new Error("This folder contains more than 5,000 PDFs. Select a scanner or date subfolder."), { code: "folder-limit" });
    }
  }
}

async function readStablePdf(file, before, fingerprint) {
  const handle = await fs.open(file, "r");
  try {
    const data = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      if (!bytesRead) throw new Error("PDF changed during the scan");
      offset += bytesRead;
    }
    if (fingerprint !== sourceFingerprint(file, await handle.stat()) || fingerprint !== sourceFingerprint(file, await fs.stat(file))) {
      throw new Error("PDF changed during the scan");
    }
    return data;
  } finally {
    await handle.close();
  }
}

async function createFolderScan(dir, hasSource) {
  const paths = [];
  await findPdfs(dir, paths);
  let index = 0;
  return {
    total: paths.length,
    async next() {
      const files = [];
      const unreadableFiles = [];
      let unchanged = 0;
      let bytes = 0;
      for (let count = 0; count < BATCH_FILES && index < paths.length; count++) {
        const file = paths[index];
        const name = path.basename(file);
        try {
          const before = await fs.stat(file);
          const fingerprint = sourceFingerprint(file, before);
          if (hasSource(fingerprint)) {
            unchanged++;
          } else {
            // An oversized PDF occupies its own batch.
            if (files.length && bytes + before.size > BATCH_BYTES) break;
            const data = await readStablePdf(file, before, fingerprint);
            files.push({ name, data, sourceKey: fingerprint });
            bytes += data.byteLength;
          }
        } catch {
          unreadableFiles.push(name);
        }
        index++;
        if (bytes >= BATCH_BYTES) break;
      }
      return { files, unreadableFiles, unchanged, done: index === paths.length };
    },
  };
}

module.exports = { createFolderScan };
