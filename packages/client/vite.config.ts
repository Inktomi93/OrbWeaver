import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

// @orb/client build. Config-only for now: the app entry (index.html + src/main.tsx) and the
// hand-written code-based route tree (src/routes/ — createRoute/createRootRoute + one
// `declare module { Register }`, NO file-based codegen per UI-Arch §6.1) are the client-app's first
// task. This config is wired so `vite`/`vite build` work the moment those land — it does NOT run today.
//
// Intra-package imports use the package.json `#*` subpath field (resolved natively by Vite) — there is
// NO `@`/tsconfig-paths alias (orbweaver principle #2). `dedupe` is the one resolve concern we keep.
export default defineConfig({
  resolve: {
    // pnpm hoists devtools' peer deps under their own node_modules, which can produce TWO React
    // instances at runtime → invalid-hook-call errors from any component resolved through the nested
    // copy. Forcing the bundler to a single instance is the fix.
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    // React Compiler (stable 1.0) — FULL-compile from day one (D54): auto-memoizes components/hooks
    // that follow the Rules of React, bails silently on violations (the eslint gate — react-hooks v7 —
    // is the compile-time safety net; Biome doesn't ship Compiler rules yet). It runs as a
    // Rolldown-Babel preset because plugin-react v6 dropped internal Babel for oxc, so `babel()` MUST
    // precede `react()` for the compiler to see UNMODIFIED source.
    // https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react@6.0.0
    babel({ presets: [reactCompilerPreset()] }),
    react(),
    tailwindcss(),
    // Dev-only overlay: surface tsc + eslint (react-hooks/Compiler/TanStack) errors in-browser so we
    // don't alt-tab to the terminal. `enableBuild: false` keeps it out of the prod build — `pnpm check`
    // owns gate-time (it runs tsc + this eslint config repo-wide). eslint auto-discovers the root
    // eslint.config.js by walking up from this package.
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
  server: {
    port: 5173,
    proxy: {
      // Vite is the dev front door; the Hono server owns the API and serves the built bundle in prod.
      // PROVISIONAL: the server HTTP transport isn't wired yet — the target port / path prefix here
      // are placeholders (mirrors the standard split) and get reconciled when the server entry lands.
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Provisional output dir — reconciled with the server's static-serve path when the entry lands.
    outDir: "dist",
    emptyOutDir: true,
  },
});
