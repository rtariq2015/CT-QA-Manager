// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Desktop (offline) build: set VITE_DESKTOP=1 to emit a single static index.html SPA that
// Electron loads from disk. The normal web preview/dev build is untouched (base stays "/").
const DESKTOP = process.env["VITE_DESKTOP"] === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(DESKTOP
      ? {
          spa: {
            enabled: true,
            prerender: { enabled: true, outputPath: "index.html", crawlLinks: false },
          },
        }
      : {}),
  },
  ...(DESKTOP ? { vite: { base: "./" } } : {}),
});
