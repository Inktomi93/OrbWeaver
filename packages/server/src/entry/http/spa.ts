// The SPA static-serve registrar: the built client bundle + the index.html history fallback. MUST be
// the LAST registration on the app — every API/auth/healthz route wins by order, and an /api/* miss
// stays a plain 404 (never HTML) via the explicit prefix bail below.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { earlyHints } from "@hono/node-server/early-hints";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { COMPRESSIBLE_CONTENT_TYPE_REGEX, compress } from "hono/compress";
import { etag } from "hono/etag";
import { parseAccept } from "hono/utils/accept";
import { getMimeType } from "hono/utils/mime";
import { getLog } from "#foundation/observability";

// Only vite's content-hashed output lives under /assets/ — cacheable forever. Everything name-stable
// (index.html, public/-copied files) must revalidate so a new deploy is picked up on the next request.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
// Keep the shell cacheable but revalidate its ETag on every navigation to pick up deployments.
const REVALIDATE_CACHE = "no-cache";
const HASHED_ASSET_PREFIX = "/assets/";
const API_PREFIX = "/api/";
const HTML_MEDIA_TYPE = "text/html";
// F1 belt (pre-auth-attack-surface audit 2026-08-09): source artifacts must NEVER leave the edge, even
// if a build regression re-ships them into the served dist. `.map` = sourcemaps (the root fix is
// `vite.config.ts sourcemap:false`; this is defense-in-depth so a config flip can't re-leak the whole
// first-party `src/**` via `sourcesContent`); `.ts`/`.tsx` = raw source that has no place in a prod
// bundle. Non-global regex → no lastIndex state.
const SOURCE_ARTIFACT_EXT = /\.(?:map|tsx?)(?:\.(?:br|gz|zst))?$/;
const PRECOMPRESSED_ENCODINGS = [
  ["br", ".br"],
  ["zstd", ".zst"],
  ["gzip", ".gz"],
] as const;
const RUNTIME_ENCODINGS = ["gzip", "deflate"] as const;
const IDENTITY_ENCODING = "identity";
const NOT_ACCEPTABLE = 406;
const OK_STATUS = 200;

function staticFile(distDir: string, path: string, navigation: boolean): string | null {
  let file = join(distDir, path);
  if (statSync(file, { throwIfNoEntry: false })?.isDirectory() === true) {
    file = join(file, "index.html");
  }
  if (!existsSync(file) && navigation) {
    file = join(distDir, "index.html");
  }
  return existsSync(file) ? file : null;
}

function selectEncoding(header: string | undefined, file: string, runtimeCompression: boolean): string | null {
  if (header === undefined) {
    return IDENTITY_ENCODING;
  }
  const accepted = parseAccept(header);
  const wildcard = accepted.find((value) => value.type === "*");
  const identity = accepted.find((value) => value.type.toLowerCase() === IDENTITY_ENCODING);
  const compressible = COMPRESSIBLE_CONTENT_TYPE_REGEX.test(getMimeType(file) ?? "");
  const supports = compressible
    ? [
        ...new Set([
          ...PRECOMPRESSED_ENCODINGS.filter(([, suffix]) => existsSync(file + suffix)).map(([encoding]) => encoding),
          ...(runtimeCompression ? RUNTIME_ENCODINGS : []),
        ]),
      ]
    : [];
  let selected = IDENTITY_ENCODING;
  let quality = identity?.q ?? 0;
  for (const encoding of supports) {
    const preference = accepted.find((value) => value.type.toLowerCase() === encoding);
    const candidateQuality = preference?.q ?? wildcard?.q ?? 0;
    if (candidateQuality > quality) {
      selected = encoding;
      quality = candidateQuality;
    }
  }
  if (quality === 0 && (identity?.q === 0 || (identity === undefined && wildcard?.q === 0))) {
    return null;
  }
  return selected;
}

function assetHints(distDir: string): string[] {
  const html = readFileSync(join(distDir, "index.html"), "utf8");
  const hints = new Set<string>();
  // Consume comments without joining their neighbors into tags or asset paths that the document never contained.
  for (const [, tag = "", attributes = ""] of html.matchAll(/<!--(?:-?>|[\s\S]*?(?:--!?>|$))|<(script|link)\b([^>]*)>/giu)) {
    const script = tag.toLowerCase() === "script" && /\btype\s*=\s*["']module["']/iu.test(attributes);
    const stylesheet = /\brel\s*=\s*["']stylesheet["']/iu.test(attributes);
    const modulepreload = /\brel\s*=\s*["']modulepreload["']/iu.test(attributes);
    if (!(script || stylesheet || modulepreload)) {
      continue;
    }
    const path = /\b(?:src|href)\s*=\s*["']([^"']+)["']/iu.exec(attributes)?.[1];
    // Hint only real, same-origin build assets; comments, public files and external URLs are ineligible.
    if (path !== undefined && /^\/assets\/[\w.-]+\.(?:js|css)$/.test(path) && existsSync(join(distDir, path))) {
      hints.add(`<${path}>; rel=${stylesheet ? "preload; as=style" : "modulepreload"}; crossorigin`);
    }
  }
  return [...hints];
}

export interface SpaDeps {
  /** The built client bundle root (contains index.html); absolute or cwd-relative. */
  readonly distDir: string;
}

/** True for the API surface, which answers JSON and never the HTML bundle or fallback. */
export function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith(API_PREFIX);
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
// shipped-static + generated-index posture (NOT per-user CAS). A server-side pose-byte reader's root MUST
// derive from the SAME static root the SPA serves (never a parallel guess that can drift to nothing).

/** Register the bundle file-serve + the history fallback on `app` (GET/HEAD only; call LAST). */
export function registerSpa(app: Hono, deps: SpaDeps): void {
  // Reject source files, compressed copies and invalid filenames before negotiation, hints or file serving.
  app.get("*", (c, next) => {
    if (isApiPath(c.req.path)) {
      return next();
    }
    return SOURCE_ARTIFACT_EXT.test(c.req.path) || c.req.path.includes("\0") ? c.notFound() : next();
  });
  app.use("*", async (c, next) => {
    if (isApiPath(c.req.path) || (c.req.method !== "GET" && c.req.method !== "HEAD")) {
      return next();
    }
    const file = staticFile(deps.distDir, c.req.path, (c.req.header("accept") ?? "").includes(HTML_MEDIA_TYPE));
    if (file === null) {
      return next();
    }
    const original = c.req.header("Accept-Encoding");
    const encoding = selectEncoding(original, file, c.req.method === "GET" && c.req.header("Range") === undefined);
    if (encoding === null) {
      c.header("Vary", "Accept-Encoding");
      return c.body(null, NOT_ACCEPTABLE);
    }
    // Normalize for node-server's literal-token sidecar matcher, then restore the request for outer observers.
    c.req.raw.headers.set("Accept-Encoding", encoding);
    try {
      await next();
      c.res.headers.set("Vary", "Accept-Encoding");
    } finally {
      if (original === undefined) {
        c.req.raw.headers.delete("Accept-Encoding");
      } else {
        c.req.raw.headers.set("Accept-Encoding", original);
      }
    }
  });
  // Register after the API routes so compression cannot buffer their streaming responses.
  app.use("*", compress({ threshold: 0 }));
  app.use("*", (c, next) => {
    if (
      c.req.method !== "GET" ||
      isApiPath(c.req.path) ||
      c.req.path.startsWith(HASHED_ASSET_PREFIX) ||
      c.req.header("If-None-Match") !== undefined ||
      !(c.req.header("accept") ?? "").includes(HTML_MEDIA_TYPE)
    ) {
      return next();
    }
    if (c.req.path === "/" || c.req.path === "/index.html" || !existsSync(join(deps.distDir, c.req.path))) {
      const hints = assetHints(deps.distDir);
      if (hints.length > 0) {
        return earlyHints({ link: hints })(c, next);
      }
    }
    return next();
  });
  const revalidate = etag({ weak: true });
  app.use("*", async (c, next) => {
    await next();
    if (c.req.method === "GET" && c.res.status === OK_STATUS && c.res.headers.get("content-type")?.startsWith(HTML_MEDIA_TYPE) === true) {
      // Hono replaces the response on 304; restore the cache policy and negotiated representation key.
      const cacheControl = c.res.headers.get("cache-control");
      const vary = c.res.headers.get("vary");
      await revalidate(c, () => Promise.resolve());
      if (cacheControl !== null) {
        c.res.headers.set("Cache-Control", cacheControl);
      }
      if (vary !== null) {
        c.res.headers.set("Vary", vary);
      }
    }
  });

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
  const serveFiles = serveStatic({ root: deps.distDir, precompressed: true });
  app.get("*", async (c, next) => {
    if (isApiPath(c.req.path)) {
      return next();
    }
    return withCache(await serveFiles(c, next), c.req.path.startsWith(HASHED_ASSET_PREFIX) ? IMMUTABLE_CACHE : REVALIDATE_CACHE);
  });

  // History fallback: only a navigation (Accept: text/html) gets index.html — a missed hashed-asset or
  // fetch request 404s instead of receiving HTML-as-JS.
  const serveIndex = serveStatic({ root: deps.distDir, path: "index.html", precompressed: true });
  app.get("*", async (c, next) => {
    if (isApiPath(c.req.path) || !(c.req.header("accept") ?? "").includes(HTML_MEDIA_TYPE)) {
      return next();
    }
    return withCache(await serveIndex(c, next), REVALIDATE_CACHE);
  });
}
