import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import type { Plugin, ResolvedConfig } from "vite";
import { defineConfig, isFileLoadingAllowed, resolveConfig, searchForWorkspaceRoot } from "vite";
import checker from "vite-plugin-checker";

const WORKSPACE_ROOT = searchForWorkspaceRoot(import.meta.dirname);

// Dev-server port + API-proxy target are env-overridable so `snap --isolated` can boot a SECOND, fully
// isolated dev stack at a frozen HEAD worktree on OFFSET ports (tooling/src/snap/ops/stage.ts) without
// fighting the primary dev stack's HMR/crash-loops. Unset = the canonical dev origin, byte-for-byte
// unchanged; the stage exports VITE_PORT + VITE_API_TARGET pointed at ITS own backend. The presence of the
// `VITE_API_TARGET` env read below is ALSO the snap-stage version tripwire — a stage ref that predates this
// line is rejected up front (a silent proxy-to-the-dev-server would defeat isolation), so keep the literal.

// THE TWO FALLBACKS BELOW ARE A DOCUMENTED MIRROR OF `tooling/src/_shared/ports.ts` `DEV_PORTS`
// (5173 / 8788), which is the ONE home for every port this repo's tooling binds (#1269/#1271). This file
// CANNOT read it: `tooling` sits ABOVE the package cake, so importing `@orb/tooling` from `packages/**`
// would be an upward import — automatically wrong (constitution §2), not a matter of taste. Duplicating the
// two numbers here is the ruled house precedent (owner, 2026-09-02), the same treatment the three bash
// launchers get for the same reason in a different dimension; the `tooling-shared-plumbing` arm-I gate
// therefore excludes this file BY RULING. **Change one of these and you must change DEV_PORTS too** — that
// registry's header names this file, so the pointer is greppable from either side.
const DEV_SERVER_PORT = Number(process.env["VITE_PORT"]) || 5173;

const API_PROXY_TARGET = process.env["VITE_API_TARGET"] ?? "http://127.0.0.1:8788";

// ── The DEV app-document CSP (client-tooling-setup.md §7.5 DEV row + §9) ──────────────────────────────
// In dev VITE is the front door — it serves `index.html`, so ITS header is the document's CSP and the
// server's `securityHeaders()` middleware never touches the page (it governs `/api` responses + the
// prod SPA serve). That made the app-tier "Block external media" AppSetting a PLACEBO in dev: turning it
// OFF let MessageMedia render `<img src="https://…">`, and this static header blocked the fetch.
//
// So the dev header is no longer a frozen literal — it MIRRORS the live policy the backend computes
// (`packages/server/src/entry/http/security-headers.ts`, which reads the setting per request). One
// source of truth, no lockstep-literal drift, and flipping the setting changes the dev document's CSP
// on the next page load. The mirror is only accepted when the probed policy is the backend's DEV arm
// (`'unsafe-eval'` present) — a vite dev server pointed at a PROD-mode backend must not inherit a
// prod `script-src` and kill HMR.
//
// The literal below is now purely the FAIL-CLOSED fallback: used before the first probe answers, when
// the backend is down/restarting, or when the probe isn't a dev policy. It is the STRICT arm (no
// external media) on purpose — a probe failure must never silently widen the policy.
//   Dev-only deltas vs the prod policy (everything else is byte-identical):
//     • script-src  + 'unsafe-inline' 'unsafe-eval' — Vite's HMR client + React Refresh inject inline
//       bootstrap scripts and eval transformed modules. Prod stays 'self'-only (zero inline scripts).
//     • connect-src + ws: wss: — the HMR WebSocket (a different scheme than http:, so 'self' misses it).
//     • img-src + data: — DEV-ONLY, for the TanStack Devtools floating trigger, whose logo is an inline
//       data: PNG the dev-only tool injects (prod strips devtools via removeDevtoolsOnBuild). App
//       data:-images are still barred at source (markdown allowDataImages:false + assetsInlineLimit:0 +
//       the no-external-media gate), so this relaxes no real guard.
//   Held tight (same as prod) ON PURPOSE: object-src/frame-ancestors 'none'; base-uri/form-action
//   'self'. style-src keeps 'unsafe-inline' (Tailwind + Base UI + the owner-theme <style> injector
//   `custom-theme-style.tsx` all emit first-party inline styles; §7.5's reasoned choice — do NOT nonce
//   it). No `html.cspNonce`: script-src uses no nonce (see §9 note).
const CSP_DEV_FALLBACK = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // blob: workers/SharedWorkers fall back to script-src without an explicit worker-src (which lacks blob:).
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const CSP_HEADER = "Content-Security-Policy";
// `/healthz` is the cheapest always-registered route, and `securityHeaders()` is `app.use("*")` — so the
// probe response carries the exact policy the backend would put on a document.
const CSP_PROBE_URL = `${API_PROXY_TARGET}/healthz`;
const CSP_PROBE_TIMEOUT_MS = 750;
// Re-probe at most this often: a setting flip needs a page RELOAD to take effect anyway (a document keeps
// the CSP it was delivered with), so sub-second freshness buys nothing.
const CSP_MIRROR_TTL_MS = 2000;

/** Accept a probed policy only if it is the backend's DEV arm — never inherit a prod script-src into HMR. */
function isDevPolicy(csp: string | null): csp is string {
  // `=== true`, not biome's bare `csp?.includes(…)`: the optional chain yields `boolean | undefined`, which
  // does not satisfy this function's `csp is string` predicate return type.
  return csp?.includes("'unsafe-eval'") === true;
}

/**
 * Serves the dev document CSP, mirrored from the backend's live (setting-dependent) policy. Installed as
 * the FIRST middleware and owning the header outright — `server.headers` deliberately no longer carries a
 * CSP, because vite's own header middleware runs after this one and would overwrite the mirror.
 */
function devCspMirror(): Plugin {
  let policy = CSP_DEV_FALLBACK;
  let probedAt = 0;
  let inFlight: Promise<void> | null = null;

  const probe = async (): Promise<void> => {
    try {
      const res = await fetch(CSP_PROBE_URL, { signal: AbortSignal.timeout(CSP_PROBE_TIMEOUT_MS) });
      const live = res.headers.get(CSP_HEADER);
      policy = isDevPolicy(live) ? live : CSP_DEV_FALLBACK;
    } catch {
      policy = CSP_DEV_FALLBACK; // backend down/restarting → fail closed
    }
    probedAt = Date.now();
    inFlight = null;
  };

  // AWAITED by the middleware (not fire-and-forget): the first reload after an admin flips the setting
  // must already carry the new policy, or the toggle stays a placebo for one more reload. Concurrent
  // requests inside one stale window share the single in-flight probe.
  const currentPolicy = async (): Promise<string> => {
    if (Date.now() - probedAt >= CSP_MIRROR_TTL_MS) {
      if (inFlight === null) {
        inFlight = probe();
      }
      await inFlight;
    }
    return policy;
  };

  return {
    name: "orb:dev-csp-mirror",
    apply: "serve",
    configureServer(server): void {
      server.middlewares.use((_req, res, next): void => {
        void currentPolicy().then((csp: string): void => {
          res.setHeader(CSP_HEADER, csp);
          next();
        });
      });
    },
  };
}

// ── Workspace-export-move staleness (#32) ─────────────────────────────────────────────────────────
// A merge that MOVES an export across a workspace-package boundary (@orb/kit, @orb/contracts,
// @orb/ui — the three packages @orb/client actually reaches through the cake) rewrites that
// package's own `package.json` "exports"/"imports" map. Vite's dev-server watcher is scoped to
// `root` (this package) plus whatever files get pulled into the live MODULE GRAPH as transformable
// modules — a sibling workspace's `package.json` is neither: the resolver reads it once per
// specifier and never revisits it, and it never gets added to the watcher on its own. Measured live
// (2026-08-14, this repo, rolldown-vite 8.1.2): with the dev server already running, editing
// `packages/ui/package.json` to repoint an existing subpath at a DIFFERENT file produced ZERO HMR
// event, and a client file that had already been transformed kept resolving through the STALE
// target for the rest of that process's life — touching the client file (forcing Vite to
// re-transform it) OR fully restarting the process both self-heal (a fresh process re-reads
// `package.json` cold, no `--force` needed — Vite's own docs: "restart the dev server with --force"
// covers the case where a linked package's THIRD-PARTY dependency LIST changes; a plain reachable
// specifier remap needs only a restart). What neither self-heals is a LIVE session that never
// restarts — exactly the shape of this repo's overnight multi-lane runs, where a sibling lane's
// export move lands on disk while this dev server keeps running underneath it.
//
// So: explicitly watch the three package.json files client can reach through and RESTART THE
// SERVER IN-PROCESS (`server.restart()`, no forced re-optimize — the plain restart already proved
// sufficient above) the moment one changes. This is strictly narrower than nuking
// `node_modules/.vite` on every boot (which would tax every ordinary restart) — it fires only when
// the three files that actually define what a workspace import resolves to change, and it self-heals
// a LIVE session without requiring the operator to notice, hand-clear the cache, and bounce :5173.
function orbWorkspaceExportsRestart(): Plugin {
  // db/server are excluded ON PURPOSE — client never imports through them (package cake:
  // kit ← contracts ← db ← server ← client, + the sealed ui: kit ← ui ← client).
  const watchedPkgJson = new Set(["kit", "contracts", "ui"].map((pkg) => `${WORKSPACE_ROOT}/packages/${pkg}/package.json`));
  return {
    name: "orb:workspace-exports-restart",
    apply: "serve",
    configureServer(server): void {
      for (const file of watchedPkgJson) {
        server.watcher.add(file);
      }
      server.watcher.on("change", (file: string): void => {
        if (!watchedPkgJson.has(file)) {
          return;
        }
        server.config.logger.info(`orb: ${file.slice(WORKSPACE_ROOT.length + 1)} changed — restarting dev server so workspace-export moves take effect`, {
          timestamp: true,
        });
        void server.restart();
      });
    },
  };
}

// ── REACT COMPILER PERSISTENT TRANSFORM CACHE (#593) ─────────────────────────────────────────────
// The React Compiler babel pass is the single most expensive thing this config does: ~68.3ms per
// module COLD versus ~2.7ms warm in-process (measured #589; the CPU-profile paragraph above puts it
// at ~72% of a profiled build). Vite persists `optimizeDeps` output across processes but NOT source
// transforms, so EVERY fresh vite process re-pays the full cold compiler pass on a byte-identical
// tree — every operator dev restart, and every e2e webServer boot (globalSetup's client warm-up,
// tests/e2e/support/global-setup.ts, exists purely to absorb that cost inside the setup wall).
// Compiling less was rejected: e2e must exercise the COMPILED build, which is the bug class it
// exists for, and D54 is full-compile. So the compiler still runs on every distinct input — it just
// never runs TWICE on the same input.
//
// THE SEAM (chosen after reading @rolldown/plugin-babel@0.2.3's installed source): the plugin is a
// plain object whose `transform.handler` does the whole babel job (loadOptionsAsync → transformAsync),
// while `configResolved`/`applyToEnvironment` mutate `plugin.transform.filter` and populate the
// per-environment options converter ON THAT SAME OBJECT. So the cache wraps the handler IN PLACE on
// the plugin instance rather than proxying the plugin: a wrapper object would receive the
// `plugin.transform.filter = …` assignment on the inner instance and silently transform everything.
// Wrapping the handler (not babel's own `cacheKey`/`caller`) also memoizes `loadOptionsAsync`, which
// the profile shows is not free, and keeps the cached value byte-identical to what the plugin
// returned — the cached output IS the compiled output, so D54 coverage is unchanged.
//
// THE KEY is content + toolchain, never path+mtime (a poisoned cache is worse than no cache):
// source bytes · module id · moduleType · vite environment name · the preset options · and a
// TOOLCHAIN DIGEST = the resolved paths AND the sha256 of the installed
// babel-plugin-react-compiler / @vitejs/plugin-react / @rolldown/plugin-babel entry files. Content
// hashing (not just versions) is what makes a `pnpm patch`, a link, or a same-version republish
// invalidate. A compiler upgrade or a `reactCompilerPreset({…})` option change therefore lands in a
// disjoint keyspace by construction; an edited source file gets a fresh transform for the same
// reason (HMR correctness is a property of the key, not of a watcher).
// THE VALUE keeps `map` beside `code` — serving cached code without its sourcemap would silently
// degrade every stack trace and breakpoint in dev.
//
// Storage: `packages/client/node_modules/.cache/react-compiler` (gitignored twice over —
// `node_modules/` and `.cache/`), one JSON file per key, written tmp+rename so concurrent vite
// processes (the e2e mode-projects boot three) can share one cache safely. Bounded by a
// startup prune; a cache read/write failure degrades to a plain transform and never fails a build.

// The React Compiler's own options — EMPTY on purpose (D54 full-compile on the preset's defaults).
// It is a named const rather than a bare `reactCompilerPreset()` call so the compiler config and the
// cache key are physically the same value: anything added here invalidates every cached entry.
const REACT_COMPILER_OPTIONS = {};
const COMPILER_CACHE_DIR = join(import.meta.dirname, "node_modules", ".cache", "react-compiler");
// Bump when the ENTRY ENCODING changes (not when the compiler changes — the toolchain digest owns that).
const COMPILER_CACHE_FORMAT = "v1";
// Measured 2026-08-23: one full crawl of the client graph (3,140 transformed modules) leaves 1,341
// cache entries / 26 MB — so 8k entries is ~155 MB and holds several generations of edits before the
// oldest half is dropped.
const COMPILER_CACHE_MAX_ENTRIES = 8000;
const COMPILER_TOOLCHAIN_PACKAGES = ["babel-plugin-react-compiler", "@vitejs/plugin-react", "@rolldown/plugin-babel"];

/** sha256 of the installed toolchain (resolved paths + entry-file contents) + the preset options. */
async function compilerToolchainDigest(presetOptions: object): Promise<string> {
  const resolve = createRequire(import.meta.url).resolve;
  const entries = COMPILER_TOOLCHAIN_PACKAGES.map((pkg) => resolve(pkg));
  const sources = await Promise.all(entries.map((entry) => readFile(entry)));
  const digest = createHash("sha256").update(COMPILER_CACHE_FORMAT).update(JSON.stringify(presetOptions));
  for (const [index, entry] of entries.entries()) {
    digest.update(entry).update(sources[index] ?? "");
  }
  return digest.digest("hex");
}

/** Drop the oldest half once the cache outgrows its bound. Fire-and-forget: never blocks a transform. */
async function pruneCompilerCache(): Promise<void> {
  try {
    // A missing dir is the normal first-boot state (nothing cached yet), not a fault to warn about.
    const names = await readdir(COMPILER_CACHE_DIR).catch(() => []);
    if (names.length <= COMPILER_CACHE_MAX_ENTRIES) {
      return;
    }
    const aged = await Promise.all(names.map(async (name: string) => ({ name, at: (await stat(join(COMPILER_CACHE_DIR, name))).mtimeMs })));
    aged.sort((a, b) => a.at - b.at);
    await Promise.all(aged.slice(0, aged.length - COMPILER_CACHE_MAX_ENTRIES / 2).map((entry) => rm(join(COMPILER_CACHE_DIR, entry.name), { force: true })));
  } catch (cause) {
    console.warn(`orb: react-compiler cache prune failed (harmless, the cache just keeps growing): ${String(cause)}`);
  }
}

/**
 * Wrap `@rolldown/plugin-babel`'s transform handler with the persistent content-hash cache described
 * above. Mutates and returns the SAME plugin instance (see THE SEAM) — vite awaits promises in the
 * `plugins` array, so this composes inline where `babel(…)` used to sit.
 */
async function withCompilerTransformCache(pluginPromise: ReturnType<typeof babel>, presetOptions: object): ReturnType<typeof babel> {
  const plugin = await pluginPromise;
  const hook = plugin.transform;
  if (typeof hook !== "object" || typeof hook.handler !== "function") {
    // Loud, not silent: a plugin-babel upgrade that moves the transform out of an object hook must
    // re-seat this cache rather than quietly disable it (a silently-bypassed cache reads as a
    // performance regression nobody can attribute).
    throw new Error(
      "orb: @rolldown/plugin-babel no longer exposes an object `transform` hook — re-seat the React Compiler cache (#593) against its new shape.",
    );
  }
  const toolchain = await compilerToolchainDigest(presetOptions);
  const inner = hook.handler;
  let warnedWriteFailure = false;
  void pruneCompilerCache();

  hook.handler = async function cachedBabelTransform(
    this: ThisParameterType<typeof inner>,
    code: string,
    id: string,
    options: Parameters<typeof inner>[2],
  ): Promise<Awaited<ReturnType<typeof inner>>> {
    const key = createHash("sha256")
      .update(toolchain)
      .update("\0")
      .update(this.environment?.name ?? "")
      .update("\0")
      .update(options?.moduleType ?? "")
      .update("\0")
      .update(id)
      .update("\0")
      .update(code)
      .digest("hex");
    const file = join(COMPILER_CACHE_DIR, `${key}.json`);
    try {
      // A hit stores the handler's OWN return value verbatim — including the `null` that stands for
      // "this module produced no transform", which is just as expensive to re-derive as a compile.
      return JSON.parse(await readFile(file, "utf8")) as ReturnType<typeof inner>;
    } catch {
      // Miss (ENOENT) or an unreadable/partial entry — both mean "compile it and write through".
    }
    const result = await inner.call(this, code, id, options);
    try {
      const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
      await mkdir(COMPILER_CACHE_DIR, { recursive: true });
      await writeFile(tmp, JSON.stringify(result ?? null));
      await rename(tmp, file);
    } catch (cause) {
      if (!warnedWriteFailure) {
        warnedWriteFailure = true;
        console.warn(`orb: react-compiler cache is not writable — transforms still run, they just won't persist: ${String(cause)}`);
      }
    }
    return result;
  };
  return plugin;
}

// @orb/client build — fully es2025, React-Compiler full-compile from day one (D54). Entry is
// index.html + src/main.tsx with a hand-written code-based route tree (src/routes/ — no file-based
// codegen, UI-Arch §6.1). Every non-default option below is annotated with its why; the full
// rationale + cites live in history/client-tooling-setup.md §7.
//
// Intra-package imports use the package.json `#*` subpath field (resolved natively by Vite) — there is
// NO `@`/tsconfig-paths alias (orbweaver principle #2). No `base` (served at root), no version
// `define`s (foundation/env owns runtime config), no hand-written `manualChunks` (Rolldown
// auto-chunks). The heavy seals with large deps — @orb/ui/stat-figure (ECharts) and @orb/ui/code-editor
// (CodeMirror) — are `React.lazy`'d at their client call sites (character-provenance-section.tsx,
// theme-editor.tsx), each getting its own chunk instead of riding the entry bundle (P1, rollup audit).
//
// ── HOW TO PROFILE THIS BUILD (nothing is wired permanently — it is one flag) ──────────────────────
//   pnpm --filter @orb/client build -- --profile     # or: vite build --configLoader native --profile
// Writes `packages/client/vite-profile-0.cpuprofile` (~25 MB, gitignored); upload it to
// https://www.speedscope.app/. Same flag works on the dev server (`vite --profile`, then `p` then `q`).
//
// READ IT INSTEAD OF `[PLUGIN_TIMINGS]`, NOT BESIDE IT — they measure different things and they
// DISAGREE. Rolldown's end-of-build PLUGIN_TIMINGS block blames `vite-plugin-checker` for ~93% of the
// build; the CPU profile shows checker consuming essentially no main-thread time, because PLUGIN_TIMINGS
// counts WALL time inside a hook (checker's tsc/eslint run out-of-process, so that is waiting, not work).
// The real CPU is the React Compiler: measured 2026-08-07, ~72% of a 74.6s profiled build sits in
// babel-plugin-react-compiler + @babel/{traverse,parser,types,generator}, plus ~12% GC. Rolldown itself
// is 0.6%. So build time here is the Compiler's price (a D54 decision), not a bundler problem.

/**
 * The `/@fs/` deny list — what the dev server refuses to read out of the workspace root.
 *
 * `server.fs.allow` is the whole workspace root (the monorepo REQUIRES it — client imports @orb/* SOURCE
 * from sibling packages), so `/@fs/` would otherwise hand out every file under it. Setting `deny` REPLACES
 * Vite's built-in default, so the first block re-lists that default floor verbatim
 * (`.env`/keys/certs/.npmrc/.git — Vite 8.1 default) and the rest is orbweaver's own:
 *   • `.credentials-key` — infra/crypto's auto-generated 32-byte credential-encryption key
 *     (`<dirname(DATABASE_URL)>/.credentials-key`, mode 0o600). NOT covered by the default `*.{…,key,…}`
 *     glob — that matches a `.key` EXTENSION; this filename ends in `-key`. Leaking it decrypts every
 *     stored provider API key, so it is the single highest-value target.
 *   • `*.db` (+ `-wal`/`-shm`) / `*.sqlite*` — the SQLite database, ANYWHERE under the root (a test
 *     fixture db, a package-local scratch db), which is why these stay globstar-prefixed.
 *   • `<root>/data/**` — THE ENTIRE RUNTIME DATA DIR, denied wholesale rather than file-class by
 *     file-class (#1483). It is the one place on disk that is neither source nor build output: the
 *     database, the CAS blob store, derived image variants, import reports, and whatever the next feature
 *     drops there. Enumerating its classes had already fallen behind reality twice over — `data/assets/**`
 *     was denied but `data/variants/**` (the SAME CAS images, re-encoded) and `data/import-reports/**`
 *     were not, and the globstar `.db` glob misses the `orbweaver.db.backup-<ts>` copies entirely (the suffix is
 *     `.backup-…`, not `.db`), so full database copies INCLUDING the encrypted credential blobs were
 *     `/@fs/`-reachable. Denying the directory means anything added under `data/` later inherits the
 *     protection instead of being exposed until someone notices.
 *
 * THE PATTERN IS ROOT-ANCHORED, never the globstar-prefixed `data` form, and that is load-bearing: Vite
 * matches any deny pattern containing a `/` against the FULL absolute path with `matchBase: false`, so an
 * unanchored `data` glob would also deny `packages/client/src/data/**` — the client's own data tier (the
 * bus room registry, the auth bootstrap) — and the dev server would stop serving its own source.
 *
 * THERE IS NO ALLOW-LIST BACK IN, by derivation rather than by omission: nothing under `data/` is a module
 * or a static asset the dev server serves. Uploaded images reach the app through the owner-gated
 * `/api/blob` route (which is exactly the ownership check a raw `/@fs/` read would bypass), and the
 * database is reached through the API server. Should something under `data/` ever genuinely need serving,
 * it cannot be re-allowed via `fs.allow` — Vite checks `deny` FIRST and returns immediately — so the
 * carve-out must be a negated glob in this list, with its own reason.
 *
 * Named (rather than inlined at the call site) so the ONE list feeds both the dev server below and
 * `devServerServes` — the pin has no second copy of it to drift against.
 */
function devFsDeny(workspaceRoot: string): readonly string[] {
  return [
    ".env",
    ".env.*",
    "*.{crt,pem,key,p12,pfx,cer,der}",
    ".npmrc",
    ".yarnrc.yml",
    "**/.git/**",
    "**/.credentials-key",
    "**/*.db",
    "**/*.db-wal",
    "**/*.db-shm",
    "**/*.sqlite",
    "**/*.sqlite-*",
    `${workspaceRoot}/data/**`,
  ];
}

let fsFilter: Promise<ResolvedConfig> | null = null;

/**
 * DOES THE DEV SERVER SERVE THIS ABSOLUTE PATH? — the `/@fs/` filter's own question, answered by VITE'S
 * resolver (`isFileLoadingAllowed` over a `resolveConfig`'d allow/deny pair — the exact predicate the dev
 * middleware consults), never by a re-implementation of picomatch.
 *
 * It lives here, as an export, because the pin cannot ask vite itself: `vite` is a dependency of
 * `@orb/client`, not of the workspace root, so a bare `import … from "vite"` inside a root-tier test does
 * not resolve. Asking through this module is also the stronger arrangement — the predicate is built from
 * the SAME `devFsDeny` + root-`allow` pair the server config below uses, so there is no second copy of the
 * list for a pin to agree with while the real server disagrees.
 *
 * `tests/tooling/vite-fs-deny.test.ts` is the reader.
 */
export async function devServerServes(absolutePath: string): Promise<boolean> {
  fsFilter ??= resolveConfig(
    {
      configFile: false,
      root: WORKSPACE_ROOT,
      logLevel: "silent",
      plugins: [],
      server: { fs: { strict: true, allow: [WORKSPACE_ROOT], deny: [...devFsDeny(WORKSPACE_ROOT)] } },
    },
    "serve",
  );
  return isFileLoadingAllowed(await fsFilter, absolutePath);
}

export default defineConfig({
  resolve: {
    // pnpm can hoist devtools' peer deps under their own node_modules → TWO React instances →
    // invalid-hook-call errors. Force the bundler to a single instance.
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    // React Compiler (stable 1.0, FULL-compile per D54) runs as a @rolldown/plugin-babel preset —
    // plugin-react v6 dropped internal Babel, so the compiler needs its own Babel pass. Order matches
    // the canonical react.dev / plugin-react snippet (`react()` then `babel()`) and is COSMETIC here:
    // the compiler plugin is `enforce:"pre"`, plugin-react's `viteBabel` has NO transform hook (it only
    // configures oxc), and oxc lowers JSX in Rolldown CORE after all pre-plugins — so the compiler sees
    // UNMODIFIED source regardless of array position (verified in installed source 2026-07-02). The
    // preset's filter is code-content + client-env-scoped + path-agnostic (@vitejs/plugin-react@6.0.3
    // reactCompilerPreset), so it compiles @orb/ui components too — provided @orb/ui is consumed as
    // SOURCE (see optimizeDeps.exclude below), the one real correctness guarantee here.
    // The babel pass is wrapped in the persistent content-hash transform cache (#593, see above) —
    // same plugin instance, same compiled output, just never compiled twice for the same input. The
    // preset options object is passed to BOTH so a config change is inside the cache key.
    react(),
    withCompilerTransformCache(babel({ presets: [reactCompilerPreset(REACT_COMPILER_OPTIONS)] }), REACT_COMPILER_OPTIONS),
    tailwindcss(),
    // Dev-only overlay: tsc + this eslint config (react-hooks/Compiler/TanStack) in-browser.
    // enableBuild:false — `pnpm check` owns gate-time. eslint auto-discovers the root eslint.config.js.
    checker({
      typescript: true,
      eslint: {
        useFlatConfig: true,
        lintCommand: "eslint 'src/**/*.{ts,tsx}'",
      },
      overlay: { initialIsOpen: false, position: "br" },
      enableBuild: false,
    }),
    // Dev-serve only: mirrors the backend's live, setting-dependent document CSP (see CSP_DEV_FALLBACK).
    devCspMirror(),
    // Dev-serve only: self-heals a live session across a workspace export move (#32, see above).
    orbWorkspaceExportsRestart(),
  ],
  optimizeDeps: {
    // Keep @orb/ui as SOURCE (never pre-bundled) so the React Compiler babel pass above actually
    // processes its components. A pre-bundled @orb/ui would be esbuild-optimized and BYPASS the
    // compiler — silently shipping un-memoized ui (the flagged correctness risk). @orb/ui's own
    // node_modules deps (base-ui, codemirror, streamdown, …) stay pre-bundled by default — we do NOT
    // want to recompile third-party libs. @orb/kit + @orb/contracts are also source-consumed by
    // default (workspace packages, not pre-bundled) — no React components in them, so the compiler
    // no-ops there harmlessly; they need no explicit exclude.
    exclude: ["@orb/ui"],
  },
  // Opt in to the next-major deprecation warnings (config/shared-options.md#future) so a vite major
  // lands as a warning in our dev log instead of a hard break. These are WARNINGS ONLY — nothing here
  // changes what gets built.
  //
  // This is `future: "warn"` (the shorthand that enables ALL of them) MINUS exactly one key, and the
  // exception is the whole reason it is spelled out. Measured on a cold dev boot 2026-08-07, vite 8.1.2
  // trips `removeServerWarmupRequest` AGAINST ITSELF: its own HTML middleware calls the deprecated
  // `server.warmupRequest` (`preTransformRequest`, vite/dist/node/chunks/node.js:24698) rather than
  // `environment.warmupRequest`. Nothing first-party is involved — we never call it (swept packages/,
  // scripts/, tests/: zero hits), and it is NOT `orb:dev-csp-mirror`, which only uses `configureServer`
  // + `server.middlewares`. Left on, it prints a warning with a stack on EVERY dev start that no one
  // here can act on, and a channel that always cries wolf is a channel developers filter out — which
  // would cost us the one warning that IS ours. So it is off, and every OTHER deprecation stays loud.
  //
  // RE-CHECK ON ANY VITE BUMP: if upstream migrates `preTransformRequest`, delete this object and go
  // back to the self-updating `future: "warn"` shorthand. Enumerating rots — vite's docs say the list
  // "may be updated, added, or removed at any time" — so this enumeration is a debt with a payoff date,
  // not a preference. Verified: with this object a cold dev boot + a full build emit ZERO `[vite future]`
  // lines.
  future: {
    removePluginHookHandleHotUpdate: "warn",
    removePluginHookSsrArgument: "warn",
    removeServerModuleGraph: "warn",
    removeServerReloadModule: "warn",
    removeServerPluginContainer: "warn",
    removeServerHot: "warn",
    removeServerTransformRequest: "warn",
    removeSsrLoadModule: "warn",
  },
  build: {
    // Fully es2025. NOTE (corrected 2026-08-07): this is lowered by OXC/Rolldown, NOT esbuild — vite 8
    // treats esbuild as an optional peer it only lazily imports for `cssMinify: "esbuild"` and the
    // deprecated `transformWithEsbuild`. The old comment here claimed the target rode a pnpm-workspace
    // `esbuild@^0.25.0 → 0.28.1` override "because 0.25.x rejects es2025"; that override has been
    // REMOVED and this build is green without it. cssTarget follows the same es2025 baseline.
    target: "es2025",
    cssTarget: "es2025",
    // es2025 browsers ship native modulepreload — drop the polyfill.
    modulePreload: { polyfill: false },
    // CRITICAL (D44): assetsInlineLimit:0 → NO `data:` URIs, so the app CSP `img-src` stays tight
    // (D44 `allowDataImages:false`). A few extra small-asset requests are fine on a self-hosted box;
    // a `data:` image would force loosening `img-src`, which D44 forbids.
    assetsInlineLimit: 0,
    // false — emit NO sourcemaps into the served dist. `"hidden"` only drops the
    // `//# sourceMappingURL` comment; the deterministic `<bundle>.js.map` still lands in the dir
    // `serveStatic` serves, so any anonymous visitor could `GET /assets/<bundle>.js.map` and recover the
    // entire first-party `src/**` via `sourcesContent` (pre-auth-attack-surface audit 2026-08-09, F1).
    // No out-of-band symbolication is wired today, so `false` is the KISS root fix; the spa.ts `.map`
    // belt is the defense-in-depth backstop. Reinstate `"hidden"` + a build-step map extraction only if
    // symbolication is ever wired — never leave maps in the served tree.
    sourcemap: false,
    // Emit the dependency-license artifact (AGPL hygiene). `{ fileName }` ending in `.json` gets the
    // RAW JSON metadata ({name, version, identifier, text}[]) instead of the `true` form's rendered
    // `.vite/license.md` — the licence set is an input to attribution tooling and audits, not prose to
    // read, and a bare markdown blob would have to be re-parsed to answer "which SPDX identifiers ship".
    // Same location as the `true` default (`.vite/` under outDir), so the SPA registrar's dist layout
    // is unchanged.
    license: { fileName: ".vite/license.json" },
    // Skip the per-build gzip-size calc (build speed; we don't gate on it).
    reportCompressedSize: false,
    // Vite generates index.html and Hono serves it as-is → no manifest needed. REVISIT if Hono ever
    // injects hashed asset tags server-side (then flip to true and read the manifest).
    manifest: false,
    // Sized to the ACCEPTED bundle, not to an aspiration (owner ruling 2026-09-05, #1752). The lazy
    // seals (echarts/codemirror class) were always large; what moved the number is that `@orb/client`
    // no longer declares `sideEffects`. That allowlist existed for the Aug-14 boot code-split
    // (d99b6586f: 4,936 kB → 1,056 kB by letting barrels shake), but Rolldown applies the NEAREST
    // package.json's `sideEffects` to the app's OWN files (vitejs/vite#22620), so every module imported
    // purely for effect had to be ENUMERATED — and when the CSS front door `src/styles/index.ts`
    // arrived on Aug 31, nobody added the entry. The bare `import "./styles/index.ts"` was shaken away
    // and the production bundle shipped with NO app stylesheet for five days (#1752): zero
    // `display:flex` in `dist`, and every chat room hit the MessageList unbounded-window guard. No gate,
    // typecheck or test could see it. The allowlist is gone rather than re-enumerated: an app is not a
    // library, and the enumeration duty was a silent-failure machine.
    // MEASURED here (`pnpm --filter @orb/client build`, 2026-09-05): largest chunk authed-app
    // 2,604 kB (was 3,360 kB with the allowlist — chunk boundaries moved), entry index 2,527 kB (was
    // 692 kB), boot payload 3,012,985 B (was 818,188 B). The limit sits above the largest chunk with
    // ~7% headroom; the real fence on the boot payload is `pnpm check:boot-chunk`, re-calibrated in the
    // same commit. (Use build.rolldownOptions — NEVER the deprecated rollupOptions — for any manual
    // output config; none needed today, Rolldown auto-chunks.)
    chunkSizeWarningLimit: 2800,
    // The canonical bundle location: the server's SPA registrar (entry/http/spa.ts) serves this dir —
    // CLIENT_DIST_DIR defaults to packages/client/dist and must move with any change here.
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: DEV_SERVER_PORT,
    // Fail loudly if the port is taken rather than silently hopping to a random port (stable dev origin
    // for the proxy + CSP + auth-redirect assumptions). The snap-stage picks a free offset port, so
    // strictPort stays on for it too.
    strictPort: true,
    proxy: {
      // Vite is the dev front door; the Hono server owns the API and serves the built bundle in prod
      // (entry/http/spa.ts — hashed-asset cache + index.html history fallback).
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
      // The /join/:token invite landing (entry/http/join.ts) — a server 302 into `/?join=<token>`, so a
      // dev-minted invite link opened against the vite origin still lands in the SPA.
      "/join": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
    // Pre-transform the shell entry + the route tree on server boot so the first paint isn't cold.
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/routes/router.tsx"],
    },
    // Monorepo file access — let Vite serve @orb/* source from outside packages/client (the workspace
    // root, discovered by walking up from this config). This root scope is REQUIRED (the workspace
    // packages live outside packages/client), so the guard is `deny` below, not a narrower `allow`.
    fs: {
      allow: [WORKSPACE_ROOT],
      // Spread: vite's `deny` is a MUTABLE `string[]`, and `devFsDeny` hands back a readonly view so no
      // caller can edit the list in place.
      deny: [...devFsDeny(WORKSPACE_ROOT)],
    },
    // Forward browser console → terminal (dev half of PD-58 client observability).
    forwardConsole: true,
    // NO `headers: { "Content-Security-Policy": … }` here ON PURPOSE — the `orb:dev-csp-mirror` plugin
    // owns the dev document CSP (see CSP_DEV_FALLBACK above). Vite's own header middleware runs AFTER
    // user middlewares and would overwrite the mirrored policy with a frozen literal.
  },
  // worker: reserve-flag `format: "es"` here IF client-side inline-plugin-snippet workers ever land
  // (D46 Tier-2 workers are server-side today) — intentionally NOT set now.
});
