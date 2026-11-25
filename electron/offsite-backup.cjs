const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function backupDestination(folder, library) {
  const selected = await fs.realpath(folder);
  const root = await fs.realpath(library);
  const relative = path.relative(root, selected);
  if (!relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) {
    throw new Error("Choose a folder outside the QA Library. Open Google Drive in the picker and select a separate backup folder.");
  }
  return selected;
}

async function writeOffsiteBackup(folder, library, settings) {
  const root = await fs.realpath(library);
  const destination = await backupDestination(folder, root);
  const id = randomUUID();
  const stamp = new Date().toISOString().replaceAll(":", "-");
  if (settings === undefined) {
    const file = path.join(destination, `CT QA sync test ${stamp} ${id}.txt`);
    await fs.writeFile(file, "Synthetic CT QA Manager sync test. Contains no report data or settings.\r\n", { flag: "wx" });
    return file;
  }
  const staging = path.join(destination, `CT QA backup in progress ${id}`);
  const complete = path.join(destination, `CT QA backup ${stamp} ${id}`);
  await fs.mkdir(staging);
  try {
    await fs.cp(root, path.join(staging, "QA Library"), {
      recursive: true,
      filter: async (file) => {
        const item = await fs.lstat(file);
        if (item.isDirectory()) return true;
        if (!item.isFile()) return false;
        const relative = path.relative(root, file).split(path.sep);
        const extension = path.extname(file).toLowerCase();
        return extension === ".pdf" || (extension === ".json" && [".catalog", "Review Inbox"].includes(relative[0]));
      },
    });
    await fs.writeFile(path.join(staging, "CTQA-backup.json"), settings, { flag: "wx" });
    await fs.rename(staging, complete);
    return complete;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

module.exports = { backupDestination, writeOffsiteBackup };
