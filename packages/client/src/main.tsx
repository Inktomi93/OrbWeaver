import { RouterProvider } from "@tanstack/react-router";
// biome mis-enumerates react's conditional-CJS export map and misses StrictMode specifically
// (useState/Component/etc. resolve fine); tsc resolves it and the client typechecks clean.
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./routes/router";
import "./styles/globals.css";

// vite:preloadError recovery (client-tooling-setup §9). A redeploy rotates hashed chunk names; an old
// tab that then lazy-imports a route (e.g. /admin/*) requests a hash that no longer exists → a failed
// dynamic import white-screens the app. Soft-reload ONCE to pull the new index — the sessionStorage
// guard stops a genuinely-missing chunk from reload-looping.
const PRELOAD_RELOAD_FLAG = "orb:preload-reloaded";
globalThis.addEventListener("vite:preloadError", () => {
  if (globalThis.sessionStorage.getItem(PRELOAD_RELOAD_FLAG) !== null) {
    return;
  }
  globalThis.sessionStorage.setItem(PRELOAD_RELOAD_FLAG, "1");
  globalThis.location.reload();
});

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("orbweaver: #root mount node missing from index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
