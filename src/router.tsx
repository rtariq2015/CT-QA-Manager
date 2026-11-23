import { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Offline desktop build (Electron loads index.html from disk): hash history keeps navigation
// working under file:// where the browser history API can't change the path. The web build is
// unaffected — it keeps the default browser history. Guarded to the browser because hash history
// needs `window`, and the router is also created server-side while the static shell is rendered.
const DESKTOP = typeof window !== "undefined" && import.meta.env["VITE_DESKTOP"] === "1";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
    ...(DESKTOP ? { history: createHashHistory() } : {}),
  });

  return router;
};
