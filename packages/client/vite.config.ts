import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import checker from "vite-plugin-checker";

// @orb/client build — fully es2025, React-Compiler full-compile from day one (D54). Config-only for
// now: it LOADS + `vite build` fails ONLY at the missing `index.html` entry. The app entry
// (index.html + src/main.tsx) and the hand-written code-based route tree (src/routes/ — no file-based
// codegen, UI-Arch §6.1) are the client-app's first task. Every non-default option below is annotated
// with its why; the full rationale + cites live in proposed/client-tooling-setup.md §7.
//
// Intra-package imports use the package.json `#*` subpath field (resolved natively by Vite) — there is
// NO `@`/tsconfig-paths alias (orbweaver principle #2). No `base` (served at root), no version
// `define`s (foundation/env owns runtime config), no hand-written `manualChunks` (Rolldown
// auto-chunks; heavy seals — echarts/code-editor/sandbox-frame — are lazy-imported at call sites).
export default defineConfig({
  resolve: {
    // pnpm can hoist devtools' peer deps under their own node_modules → TWO React instances →
    // invalid-hook-call errors. Force the bundler to a single instance.
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    // React Compiler (stable 1.0) as a Rolldown-Babel preset — plugin-react v6 dropped internal Babel
    // for oxc, so `babel()` MUST precede `react()` for the compiler to see UNMODIFIED source. The
    // preset's filter is code-content-based + client-env-scoped + path-agnostic (verified in
    // @vitejs/plugin-react@6.0.3), so it compiles @orb/ui components too — provided @orb/ui is consumed
    // as SOURCE (see optimizeDeps.exclude below), which is the one real correctness guarantee here.
    babel({ presets: [reactCompilerPreset()] }),
    react(),
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
  build: {
    // Fully es2025 (rides esbuild 0.28.1 — the pnpm-workspace override exists precisely because
    // 0.25.x rejects the es2025 target). cssTarget follows the same es2025 baseline (runtime CSS-target
    // validation happens once there's CSS to transform — the build short-circuits at the missing entry
    // today).
    target: "es2025",
    cssTarget: "es2025",
    // es2025 browsers ship native modulepreload — drop the polyfill.
    modulePreload: { polyfill: false },
    // CRITICAL (D44): assetsInlineLimit:0 → NO `data:` URIs, so the app CSP `img-src` stays tight
    // (D44 `allowDataImages:false`). A few extra small-asset requests are fine on a self-hosted box;
    // a `data:` image would force loosening `img-src`, which D44 forbids.
    assetsInlineLimit: 0,
    // 'hidden' — sourcemaps for our own debugging, NOT referenced from the shipped bundle (D21
    // privacy: don't expose source layout to clients).
    sourcemap: "hidden",
    // Emit the dependency-license file (AGPL hygiene).
    license: true,
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
    // Provisional output dir — reconciled with the server's static-serve path when the entry lands.
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken rather than silently hopping to a random port (stable dev origin
    // for the proxy + CSP + auth-redirect assumptions).
    strictPort: true,
    proxy: {
      // Vite is the dev front door; the Hono server owns the API and serves the built bundle in prod.
      // PROVISIONAL: the server HTTP transport isn't wired yet — target/prefix are placeholders
      // (mirrors neo's split) and get reconciled when the server entry lands.
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
    // Pre-transform the shell entry on server boot so the first paint isn't cold. The router-root file
    // path is added here once the hand-written routes land (both are pending the app entry).
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
    // Monorepo file access — let Vite serve @orb/* source from outside packages/client (the workspace
    // root, discovered by walking up from this config).
    fs: {
      allow: [searchForWorkspaceRoot(import.meta.dirname)],
    },
    // Forward browser console → terminal (dev half of PD-58 client observability).
    forwardConsole: true,
    // headers: TODO(D44/CSP) — mirror the PROD Hono document CSP here in dev so D44 violations
    // (sandbox-frame / MessageMedia / inline-asset) surface during development. The canonical
    // app-document CSP is NOT YET DEFINED anywhere (packages/server has no HTTP transport; only the
    // per-frame sandbox CSP exists — ui/src/content/sandbox-frame/srcdoc.ts). Known D44 constraints
    // for the app CSP when authored:
    //   • img-src: NO `data:` (D44 allowDataImages:false — assetsInlineLimit:0 above guarantees none);
    //   • object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
    //   • the DEV CSP is the prod one LOOSENED for Vite HMR (script 'unsafe-inline'/'unsafe-eval',
    //     connect-src ws:/wss:) — so it is NOT byte-identical to prod. Reference shape: neo-tavern
    //     src/server/app.ts `secureHeaders({ contentSecurityPolicy: isProd ? … : … })` — but do NOT
    //     copy neo's `img-src … data:` (neo allows data: images; orbweaver D44 forbids them).
    // FLAGGED to Alex — fill in once the server document CSP is authored.
  },
  // worker: reserve-flag `format: "es"` here IF client-side inline-plugin-snippet workers ever land
  // (D46 Tier-2 workers are server-side today) — intentionally NOT set now.
});
