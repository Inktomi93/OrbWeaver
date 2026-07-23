// The SPA static-serve registrar: the built client bundle + the index.html history fallback. MUST be
// the LAST registration on the app — every API/auth/healthz route wins by order, and an /api/* miss
// stays a plain 404 (never HTML) via the explicit prefix bail below.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { getLog } from "#foundation/observability";

// Only vite's content-hashed output lives under /assets/ — cacheable forever. Everything name-stable
// (index.html, public/-copied files) must revalidate so a new deploy is picked up on the next request.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
// no-cache, not no-store: the copy may be kept but must revalidate — serveStatic's Last-Modified gives
// cheap 304s while a redeployed index.html still lands immediately.
const REVALIDATE_CACHE = "no-cache";
const HASHED_ASSET_PREFIX = "/assets/";
const API_PREFIX = "/api/";

export interface SpaDeps {
  /** The built client bundle root (contains index.html); absolute or cwd-relative. */
  readonly distDir: string;
}

/** Resolve the bundle dir to serve, or `null` to skip SPA registration (vite is the dev front door).
 *  @throws in prod when the bundle is missing — an API-only origin posing as the app is a boot lie. */
export function resolveSpaDistDir(opts: { readonly distDir: string; readonly prod: boolean }): string | null {
  if (existsSync(join(opts.distDir, "index.html"))) {
    return opts.distDir;
  }
  if (opts.prod) {
    throw new Error(`spa: no client bundle at ${opts.distDir}/index.html — run \`vite build\` or point CLIENT_DIST_DIR at the bundle`);
  }
  getLog().info({ distDir: opts.distDir }, "spa: no client bundle — static serving skipped (vite serves the SPA in dev)");
  return null;
}

// The curated pose skeletons ship UNDER the same served client-static tree (`<root>/poses/library/…`) — the
// C6b theme-pipeline posture (shipped static + generated index, NOT per-user CAS). The ComfyUI arm reads their
// BYTES server-side, so the reader's root MUST derive from the SAME static root the SPA serves (never a
// parallel guess that can drift to nothing).

/** Register the bundle file-serve + the history fallback on `app` (GET/HEAD only; call LAST). */
export function registerSpa(app: Hono, deps: SpaDeps): void {
  const isApi = (path: string): boolean => path === "/api" || path.startsWith(API_PREFIX);

  // Cache headers are set on the RETURNED Response — serveStatic constructs it before onFound fires,
  // so a c.header() there is silently lost (node-server 2.x).
  const withCache = (res: unknown, value: string): Response | undefined => {
    // Miss (non-Response): serveStatic already ran next() — the downstream handler owns c.res.
    if (!(res instanceof Response)) {
      return;
    }
    res.headers.set("Cache-Control", value);
    return res;
  };

  // Real files first. serveStatic's own guard rejects traversal (`..` / `\` / `//`, percent-decoded
  // included) and falls through to next() on a miss.
  const serveFiles = serveStatic({ root: deps.distDir });
  app.get("*", async (c, next) => {
    if (isApi(c.req.path)) {
      return next();
    }
    return withCache(await serveFiles(c, next), c.req.path.startsWith(HASHED_ASSET_PREFIX) ? IMMUTABLE_CACHE : REVALIDATE_CACHE);
  });

  // History fallback: only a navigation (Accept: text/html) gets index.html — a missed hashed-asset or
  // fetch request 404s instead of receiving HTML-as-JS.
  const serveIndex = serveStatic({ root: deps.distDir, path: "index.html" });
  app.get("*", async (c, next) => {
    if (isApi(c.req.path) || !(c.req.header("accept") ?? "").includes("text/html")) {
      return next();
    }
    return withCache(await serveIndex(c, next), REVALIDATE_CACHE);
  });
}
