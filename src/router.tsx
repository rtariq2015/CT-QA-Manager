import { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Desktop routes use hashes so every route loads from the same bundled index.html. The router
// is also created during static rendering, where hash history cannot access window.
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
