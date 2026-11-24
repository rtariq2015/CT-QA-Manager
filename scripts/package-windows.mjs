import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import { createBuilder } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "electron-release");
const { productName } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const previousBuild = path.join(out, `${productName}-win32-x64`);
if (existsSync(path.join(previousBuild, "QA Library"))) {
  throw new Error(`Move the QA Library from ${previousBuild} before rebuilding this package.`);
}

process.env.VITE_DESKTOP = "1";
const builder = await createBuilder({ root });
await builder.buildApp();
await access(path.join(root, "dist", "client", "index.html"));

const appPaths = new Set(["", "/package.json", "/electron", "/dist", "/dist/client"]);
await packager({
  dir: root,
  platform: "win32",
  arch: "x64",
  out,
  download: { cacheRoot: path.join(out, ".cache") },
  overwrite: true,
  asar: false,
  prune: false,
  ignore: (file) =>
    !appPaths.has(file) && !file.startsWith("/electron/") && !file.startsWith("/dist/client/"),
});
