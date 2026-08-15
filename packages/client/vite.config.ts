import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import checker from "vite-plugin-checker";

// Dev-server port + API-proxy target are env-overridable so `snap --isolated` can boot a SECOND, fully
// isolated dev stack at a frozen HEAD worktree on OFFSET ports (scripts/probes/_kit/snap-stage.ts) without
// fighting the primary dev stack's HMR/crash-loops. Unset = the canonical dev origin, byte-for-byte
// unchanged; the stage exports VITE_PORT + VITE_API_TARGET pointed at ITS own backend. The presence of the
// `VITE_API_TARGET` env read below is ALSO the snap-stage version tripwire — a stage ref that predates this
// line is rejected up front (a silent proxy-to-the-dev-server would defeat isolation), so keep the literal.

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
  const workspaceRoot = searchForWorkspaceRoot(import.meta.dirname);
  // db/server are excluded ON PURPOSE — client never imports through them (package cake:
  // kit ← contracts ← db ← server ← client, + the sealed ui: kit ← ui ← client).
  const watchedPkgJson = new Set(["kit", "contracts", "ui"].map((pkg) => `${workspaceRoot}/packages/${pkg}/package.json`));
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
        server.config.logger.info(`orb: ${file.slice(workspaceRoot.length + 1)} changed — restarting dev server so workspace-export moves take effect`, {
          timestamp: true,
        });
        void server.restart();
      });
    },
  };
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
export default defineConfig({
  resolve: {
    // pnpm can hoist devtools' peer deps under their own node_modules → TWO React instances →
    // invalid-hook-call errors. Force the bundler to a single instance.
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    // TanStack devtools bridge (T5). FIRST in the array — its transforms want raw source (it also
    // owns `removeDevtoolsOnBuild`, default true: the belt that strips a <TanStackDevtools> usage
    // from prod builds; main.tsx's literal `import.meta.env.DEV` dead-branch is the primary strip).
    // Does NOT touch the react()/babel() Compiler arrangement below — plugin-react's compiler pass
    // is `enforce:"pre"` and position-independent (see that comment).
    // Two sub-features OFF by design:
    //   • consolePiping — server.forwardConsole below already forwards browser console → terminal
    //     (PD-58); both on would double every line.
    //   • enhancedLogs — prefixes console lines with source locations, which would mangle the
    //     one-line `%c`-styled [trpc]/[perf] channels (lib/trpc-devlog.ts, lib/long-task-tracer.ts).
    devtools({
      consolePiping: { enabled: false },
      enhancedLogs: { enabled: false },
    }),
    // React Compiler (stable 1.0, FULL-compile per D54) runs as a @rolldown/plugin-babel preset —
    // plugin-react v6 dropped internal Babel, so the compiler needs its own Babel pass. Order matches
    // the canonical react.dev / plugin-react snippet (`react()` then `babel()`) and is COSMETIC here:
    // the compiler plugin is `enforce:"pre"`, plugin-react's `viteBabel` has NO transform hook (it only
    // configures oxc), and oxc lowers JSX in Rolldown CORE after all pre-plugins — so the compiler sees
    // UNMODIFIED source regardless of array position (verified in installed source 2026-07-02). The
    // preset's filter is code-content + client-env-scoped + path-agnostic (@vitejs/plugin-react@6.0.3
    // reactCompilerPreset), so it compiles @orb/ui components too — provided @orb/ui is consumed as
    // SOURCE (see optimizeDeps.exclude below), the one real correctness guarantee here.
    react(),
    babel({ presets: [reactCompilerPreset()] }),
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
    // Provisional — the lazy-imported seals (echarts/codemirror class) produce large legitimate
    // chunks; raised from the 500kB default so those don't nag. Retune against real bundle sizes once
    // the app builds. (Use build.rolldownOptions — NEVER the deprecated rollupOptions — for any manual
    // output config; none needed today, Rolldown auto-chunks.)
    chunkSizeWarningLimit: 1500,
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
      allow: [searchForWorkspaceRoot(import.meta.dirname)],
      // The `/@fs/` dev route would otherwise expose EVERY file under the workspace root — including
      // orbweaver's on-disk secrets/data. Setting `deny` REPLACES Vite's built-in default, so the first
      // block re-lists that default floor verbatim (`.env`/keys/certs/.npmrc/.git — Vite 8.1 default),
      // and the second block adds the orbweaver-specific secrets the root `allow` exposes:
      //   • `.credentials-key` — infra/crypto's auto-generated 32-byte credential-encryption key
      //     (`<dirname(DATABASE_URL)>/.credentials-key`, mode 0o600). NOT covered by the default
      //     `*.{…,key,…}` glob — that matches a `.key` EXTENSION; this filename ends in `-key`.
      //     Leaking it decrypts every stored provider API key, so it is the single highest-value target.
      //   • `*.db` (+ `-wal`/`-shm`) / `*.sqlite*` — the SQLite database (all user data AND the encrypted
      //     credential blobs). `DATABASE_URL` defaults to `file:./data/orbweaver.db` (under the gitignored
      //     `data/` dir at the workspace root, beside the CAS blob store).
      //   • `data/assets/**` — the CAS blob store (user-uploaded images). Served in-app ONLY via the
      //     owner-gated `/api/blob` route; raw `/@fs/` access would bypass that ownership check.
      deny: [
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
        "**/data/assets/**",
      ],
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
