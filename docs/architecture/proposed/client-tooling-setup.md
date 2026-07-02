# Client-side tooling — the ESLint gate + the @orb/client Vite build

The committed setup for the two client-side toolchains: the ESLint supplement to Biome, and the
Vite + Babel + React-Compiler build for `@orb/client`. Recorded so the choices survive a cold read.
Installed + verified against the live registry 2026-07-02.

## 1. The doctrine — ESLint is the NARROW supplement to Biome

Biome owns formatting + 400+ correctness rules (`biome.json` + ~20 grit plugins). ESLint exists ONLY
for the rules Biome can't do yet: React-hooks + the React-Compiler Rules-of-React diagnostics,
TanStack Query/Router discipline, and Tailwind compiled-class validation. Config lives at the repo
root (`eslint.config.js`) — orbweaver keeps all config at root (biome.json, tsconfig.json,
playwright*.ts, vitest*.ts), so root is the native home (neo's `.config/` is neo's convention, not a
requirement to mirror).

**Explicit-rules-only.** Every rule is listed by name — never a `...recommended` bundle — so a plugin
upgrade can't silently add a new gate to the shared `pnpm check`. The one exception is
eslint-plugin-react-hooks (below), whose recommended set IS a pure correctness bundle.

**Wiring.** `lint:eslint` = `eslint packages/ui packages/client tests/ui`, appended to the `check`
chain as its own stage right after Biome: `lint → lint:eslint → typecheck → test:types →
check:structure → depcruise`. No `--max-warnings=0` — see §2's `incompatible-library` decision.

## 2. eslint-plugin-react-hooks v7 (the React Compiler diagnostics)

Scope: `packages/ui/src` (gated NOW — @orb/ui must be Compiler-clean, D54) + `packages/client/src` +
the browser component tests (`tests/ui/**/*.{ct,fixtures}.tsx`). We spread
`reactHooks.configs["recommended-latest"].rules` (v7's flat-config bundle: rules-of-hooks +
exhaustive-deps + the full Rules-of-React set — purity, immutability, refs, set-state-in-{effect,
render}, static-components, use-memo, void-use-memo, preserve-manual-memoization, globals,
error-boundaries, gating, config). This IS a correctness bundle, not style — so spreading is correct.

**Severity overrides** (the recommended set ships three rules at `warn`):

- `exhaustive-deps` → **error** (real effect-dep bugs — hard-gate).
- `unsupported-syntax` → **error** (real — hard-gate).
- `incompatible-library` → **warn** (kept). This is INFORMATIONAL, not a defect: it fires when the
  Compiler CORRECTLY skips compiling a component that wraps a third-party API it can't memoize — i.e.
  our sealed satellites. Today the only hit is `virtual-list.tsx` (wraps TanStack Virtual's
  `useVirtualizer`, which returns non-memoizable functions by design). Un-sealing to satisfy it is
  impossible + wrong; the seal is the intended architecture. Kept at the plugin's recommended `warn`
  (surfaced for review, non-blocking). This is a reasoned deviation from neo's blunt
  `--max-warnings=0` (which would hard-fail every legitimate library seal): we hard-block real bugs
  (everything else is `error`) and let expected seal-skip notices through. Flip to `error` only if a
  gate on NEW incompatible libraries is wanted (then each seal needs an inline ack).

**Parser note.** Shipped src parses type-aware (`projectService`, for `no-deprecated`). The browser
tests parse WITHOUT `projectService`: they live under `tests/` (owned by @orb/ui's tsconfig via a
reach-back include), so projectService's upward search lands on the ROOT tsconfig — which excludes
them. react-hooks rules are syntactic, so no type info is needed there.

**Green status:** `pnpm lint:eslint` exits 0 across the full current @orb/ui (incl. the in-flight
W3 primitives) + client + CT tests — one `incompatible-library` warning (virtual-list), zero errors.

## 3. TanStack ESLint plugins (client only — dormant until routes/queries land)

### 3.1 @tanstack/eslint-plugin-query (v5.101.2 — 8 rules available)

ON: `exhaustive-deps`, `no-unstable-deps`, `no-void-query-fn`, `stable-query-client`,
**`prefer-query-options`** (the last is NEW vs neo's snapshot — a type-safety/discipline rule that
fits our tRPC-proxy = queryKey+queryFn factory; enabled).
DROPPED: `infinite-query-property-order`, `mutation-property-order` (property ordering → Biome-owned
territory), `no-rest-destructuring` (destructure style → ergonomic).

### 3.2 @tanstack/eslint-plugin-router (v1.162.0 — 2 rules available)

ON: **`create-route-property-order`** ONLY. Neo dropped this as "ordering," but that was a
misclassification — the rule's own meta says *"define route options in a specific order to ensure the
type inference works correctly"* (`recommended: error`), and it targets `createRoute`/`createRootRoute`
— exactly the HAND-WRITTEN code-based tree orbweaver uses (§4). It's type-inference correctness Biome
cannot replicate, so it's kept.
DROPPED: `route-param-names` — file-based `$param`↔`useParams` naming; with no file-based route files
(§4) it has nothing to match → pure no-op. (The plugin earns its keep on the one applicable rule; had
both been no-op/ergonomic it would have been skipped entirely.)

### 3.3 Custom zustand escape-hatch guard (client only)

`no-restricted-syntax` bans `useFooStore.setState(...)`/`.getState()` on a store's static API outside
`packages/client/src/state/`. Ported from neo. Dormant until `state/` exists.

## 4. TanStack Router — committed-minimal RUNTIME, file-based codegen DROPPED

`@tanstack/react-router` (the runtime library) is KEPT and first-class production (UI-Arch KEEP list
"Router-minimal"; catalog + `@orb/client` dependency). It is used MINIMALLY — ~3 hand-written
code-based routes (`/`, `/login`, `/admin/*`).

The FILE-BASED codegen path — `@tanstack/router-plugin`, `@tanstack/router-cli`, `routeTree.gen.ts`,
`src/routes/` file discovery — is DELIBERATELY DROPPED per UI-Architecture-and-Layout.md §6.1 and
UI-Lib-TanStack-Router.md decision B#3/B#4: hand-written code-based tree; type-safety = inference +
one `declare module { Register }`, NOT codegen. Therefore the Vite build does NOT wire
`tanstackRouter()`, and neither router-plugin nor router-cli is installed. Router is
committed-minimal-runtime everywhere — never speculative, but never file-based.

## 5. eslint-plugin-better-tailwindcss (v4.6.0 — @orb/ui gated NOW; 14 rules available)

`entryPoint: packages/ui/src/styles/globals.css` (Tailwind v4 + the generated `@theme` from
`theme.css`) — validates class strings against the classes the v4 engine ACTUALLY registers.
ON (3 correctness rules): `no-unknown-classes` (unregistered utility = wrong token namespace),
`enforce-consistent-variable-syntax` `{ syntax: "shorthand" }` (blocks v3 `w-[--v]` that the browser
silently drops under v4; auto-fixes to `w-(--v)`), `no-deprecated-classes` (v3 utilities v4 dropped).
DROPPED (11, Biome owns class style/format/order): `enforce-consistent-class-order`,
`-line-wrapping`, `-variant-order`, `-important-position`, `enforce-canonical-classes`,
`enforce-shorthand-classes`, `enforce-logical-properties`, `no-duplicate-classes`,
`no-unnecessary-whitespace`, `no-restricted-classes` (needs a policy), `no-conflicting-classes`.
NOTE: `no-conflicting-classes` + `no-duplicate-classes` are correctness-adjacent (not pure style) and
available — deliberately deferred until @orb/ui's class surface stabilizes; revisit then.

## 6. @typescript-eslint (parser + one type-aware rule)

typescript-eslint 8.62.1 is the PARSER for all linted `.{ts,tsx}` (there is NO v9; peer
`typescript >=4.8.4 <6.1.0` → our 6.0.3 is in range). Its recommended RULE set stays OFF (tsc + Biome
own type/style). We keep neo's one type-aware rule: `@typescript-eslint/no-deprecated` = error on
shipped src (`packages/{ui,client}/src`) — makes the doctrine's `@deprecated` tag a gate. This turns
on `projectService` (one TS program per package, ~small build cost); accepted as proven-in-neo.

## 7. The Vite + Babel + React-Compiler build (`packages/client/vite.config.ts`)

Fully optimized, fully es2025. Config-only today — it LOADS cleanly and `vite build` fails ONLY at
the expected `Cannot resolve entry module index.html` (verified — no option/config error surfaces
before that). Every option below was verified against the installed Vite 8.1.2 `.d.ts` (the coordinator
asked me to flag any that differ — none did; all names/shapes match at the pinned version). It builds
once the app entry (`index.html` + `src/main.tsx`) + the hand-written `src/routes/` tree land.

### 7.1 Plugins (order is load-bearing)

- **`babel({ presets: [reactCompilerPreset()] })` BEFORE `react()`** — plugin-react v6 dropped internal
  Babel for oxc, so the React Compiler runs as a `@rolldown/plugin-babel` preset and MUST see
  unmodified source. FULL-compile from day one (D54). Then `tailwindcss()`, then `vite-plugin-checker`
  (dev overlay: tsc + this eslint config; `enableBuild:false` — `pnpm check` owns gate-time).
- **NO `tanstackRouter()`** (§4 — file-based codegen dropped). **NO `@`/tsconfig-paths alias** —
  intra-package imports use the package.json `#*` field (Vite resolves it natively). NO `base`, NO
  version `define`s (foundation/env owns runtime config), NO hand-written `manualChunks`.

### 7.2 The React-Compiler-sees-@orb/ui correctness guarantee (the one real risk)

`reactCompilerPreset()` (verified in @vitejs/plugin-react@6.0.3) filters by **code content**
(`rolldown.filter.code` = a React-component regex), **client-env-scoped**
(`applyToEnvironmentHook: env.consumer === "client"`), and **path-agnostic** — so it compiles any file
whose source looks like React, INCLUDING @orb/ui components, *as long as @orb/ui is consumed as
SOURCE*. We make that explicit with **`optimizeDeps.exclude: ["@orb/ui"]`**: a pre-bundled @orb/ui
would be esbuild-optimized and BYPASS the babel/compiler pass, silently shipping un-memoized ui.
@orb/ui's own node_modules deps stay pre-bundled (we don't recompile third-party libs); @orb/kit +
@orb/contracts are source-consumed by default (no React components → compiler no-ops).

### 7.3 `build` — every non-default option + why

- `target: 'es2025'` + `cssTarget: 'es2025'` — fully es2025 (rides esbuild 0.28.1; the workspace
  esbuild override exists precisely because 0.25.x rejects es2025). CSS-target runtime validation
  happens once there's CSS to transform (build short-circuits at the missing entry today).
- `modulePreload: { polyfill: false }` — es2025 browsers ship native modulepreload.
- `assetsInlineLimit: 0` — **CRITICAL D44 interaction**: no `data:` URIs → the app CSP `img-src` stays
  tight (D44 `allowDataImages:false`). A few extra small-asset requests are fine on a self-hosted box.
- `sourcemap: 'hidden'` — maps for our debugging, NOT referenced from the shipped bundle (**D21**
  privacy).
- `license: true` — emit the dep-license file (AGPL hygiene).
- `reportCompressedSize: false` — skip the per-build gzip-size calc (build speed).
- `manifest: false` — Vite generates `index.html`, Hono serves it as-is. **REVISIT** if Hono ever
  injects hashed asset tags server-side.
- `chunkSizeWarningLimit: 1500` — provisional; the lazy-imported seals (echarts/codemirror class) are
  large-but-legit. Retune against real bundle sizes. Any manual output config goes in
  **`build.rolldownOptions`** — NEVER the deprecated `rollupOptions` (both exist in Vite 8; we use
  neither today — Rolldown auto-chunks).
- `outDir: 'dist'` + `emptyOutDir: true` — provisional; reconciled with the server static-serve path.

### 7.4 `server` (dev) — every non-default option + why

- `strictPort: true` — fail loudly rather than hop ports (stable dev origin for proxy/CSP/auth).
- `proxy: { '/api': → 127.0.0.1:8788 }` — Vite is the dev front door (neo's shape). **PROVISIONAL** —
  the server HTTP transport isn't wired; target/prefix reconciled when the server entry lands.
- `warmup: { clientFiles: ['./src/main.tsx'] }` — pre-transform the shell entry on boot. The
  router-root path is added when the routes land.
- `fs: { allow: [searchForWorkspaceRoot(import.meta.dirname)] }` — monorepo access so Vite can serve
  @orb/* source from the workspace root.
- `forwardConsole: true` — browser console → terminal (dev half of **PD-58** client observability).
- `headers` (CSP) — **NOT SET; a TODO + flag** (see §9). The canonical app-document CSP is not defined
  anywhere yet, so per the full-treatment doctrine the config carries the D44 directive list + the
  dev-vs-prod-HMR nuance rather than an invented string.
- `worker.format: 'es'` — reserve-flagged in a comment only (D46 Tier-2 workers are server-side today).

## 8. Versions + release-age step-downs (`minimumReleaseAge: 1440`)

All in the `pnpm-workspace.yaml` catalog, referenced via `catalog:`. Root devDeps: the ESLint gate
tools. `@orb/client` devDeps: the Vite build tools. `@orb/client` dep: `@tanstack/react-router`.

| Package | Pinned | Note |
| --- | --- | --- |
| eslint | ^10.6.0 | all plugins peer-support eslint ^10 (verified) |
| typescript-eslint | ^8.62.1 | no v9; TS peer <6.1.0 covers our 6.0.3 |
| eslint-plugin-react-hooks | ^7.1.1 | ships the Compiler diagnostics |
| @tanstack/eslint-plugin-query | ^5.101.2 | |
| @tanstack/eslint-plugin-router | ^1.162.0 | |
| eslint-plugin-better-tailwindcss | ^4.6.0 | tailwindcss peer ^4.1.17 → our ^4.3.2 OK |
| @vitejs/plugin-react | ^6.0.3 | peer vite ^8 → client vite 8.1.2 OK |
| babel-plugin-react-compiler | ^1.0.0 | stable 1.0 |
| @rolldown/plugin-babel | ^0.2.3 | |
| vite-plugin-checker | ^0.14.4 | |
| @tanstack/react-router | ^1.170.16 | **STEP-DOWN**: 1.170.17 published <24h ago (release-age-blocked); caret adopts it once mature |
| vite | ^8.1.2 | **STEP-DOWN**: 8.1.3 published <24h ago (release-age-blocked); caret adopts it once mature |

## 9. Open items / flags for Nate

- **plugin-react peer warning (unresolved by choice).** `@vitejs/plugin-react@4.7.0` (a transitive of
  `@playwright/experimental-ct-react`, used by the CT harness's OWN internal bundler) unmet-peers vite
  8.1.2 (wants ^4–7). It's cosmetic — install succeeds, `pnpm check` is unaffected (CT isn't in
  check), and the client build uses its own `6.0.3` (vite-8-compatible). Forcing the transitive to 6.x
  would silence it but is a MAJOR bump on a working, actively-churned test harness that deliberately
  pins 4.7.0 (the config comment warns against a second plugin-react double-transforming). Left as-is;
  it's a one-line `overrides` if we accept the CT-harness risk (validate against `pnpm test:ct` first).
- **CSP-string gap (dev `server.headers`).** The coordinator wanted dev to set the SAME CSP the prod
  Hono will set, so D44 violations surface in dev. But NO canonical app-document CSP is defined
  anywhere yet — `packages/server` has no HTTP transport, and the only CSP in-tree is the per-frame
  sandbox CSP (`ui/src/content/sandbox-frame/srcdoc.ts`, D44 §12.2). Per the coordinator's own
  fallback, `server.headers` is a TODO carrying the known D44 directive list (img-src NO `data:`;
  object-src/frame-ancestors `'none'`; base-uri/form-action `'self'`) + the note that the DEV CSP must
  be the prod one LOOSENED for Vite HMR (script `'unsafe-inline'`/`'unsafe-eval'`, connect `ws:`/`wss:`).
  Reference shape: neo-tavern `src/server/app.ts` `secureHeaders({ contentSecurityPolicy: isProd ? … })`
  — but neo allows `img-src … data:`, which orbweaver D44 forbids, so it is NOT copy-pasteable. FILL IN
  once the server document CSP is authored.
- **Dormant-until-consumer:** all query rules, the router `create-route-property-order` rule, and the
  zustand guard no-op on the empty client today — live the moment client code lands.
- **@orb/ui gated NOW:** the one `incompatible-library` warning (virtual-list) is expected seal
  behavior, not a defect (§2).
