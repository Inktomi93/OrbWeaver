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
**We spread rather than list-by-name (the usual doctrine) DELIBERATELY:** `recommended-latest` includes
`void-use-memo`, a RecommendedLatest-only rule the plugin's own README manual-config example omits (that
example is the plain `recommended` set) — hand-listing would silently drop it. If ever de-bundled,
enumerate from the shipped package source, not the README. (Verified 2026-07-02 against the
`eslint-plugin-react-hooks@7.1.1` tarball: 2 classic + 14 `Recommended` + `void-use-memo`, all `error`
except the three `warn` below.)

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

**Compiler-config + defaults (verified 2026-07-02; set nothing).** Each `react-hooks/*` rule
independently accepts the babel React-Compiler options (`compilationMode`/`target`/`panicThreshold`/
`sources`/…) as `context.options[0]` — undocumented on react.dev, confirmed in the shipped source. We
pass NONE, and the babel preset also runs all-defaults, so lint and build agree by construction. Mirror
an option into these rule entries ONLY if the babel preset ever takes a non-default one (else lint
silently drifts from the build); passing defaults into all 17 entries just invites per-rule typo drift.
The defaults, all correct for us as-is: `target:'19'` (right for React 19.2 — never pin a patch),
`compilationMode:'infer'` (already full-compiles every eligible component per D54; `'all'` is explicitly
not recommended), `sources` = "not under `node_modules`" (so @orb/ui compiles as source, kit/contracts
no-op for lack of JSX). `react-compiler-healthcheck` is intentionally NOT adopted — its checks are
redundant with these rules and it's dropped from the current official onboarding flow.

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

### 7.1 Plugins (canonical order; react/babel pair is order-independent)

- **`react()` then `babel({ presets: [reactCompilerPreset()] })`** — matches the canonical react.dev /
  plugin-react snippet. plugin-react v6 dropped internal Babel, so the React Compiler runs as its own
  `@rolldown/plugin-babel` preset (FULL-compile from day one, D54). **The order is cosmetic** (NOT
  load-bearing, despite an earlier note): verified in installed source (2026-07-02) that the compiler
  plugin is `enforce:"pre"`, plugin-react's `viteBabel` has NO `transform` hook (it only configures
  oxc), and oxc lowers JSX in Rolldown **core** after all pre-plugins — so the compiler sees unmodified
  source regardless of array position. Then `tailwindcss()`, then `vite-plugin-checker` (dev overlay:
  tsc + this eslint config; `enableBuild:false` — `pnpm check` owns gate-time).
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

### 7.5 The reference CSP — neo's verified policy + the orbweaver deltas

The canonical orbweaver app-document CSP is still unauthored (§9 — it lands with the `packages/server`
HTTP transport). Until then, this is the **verified** starting point. Source: neo `src/server/app.ts`
(Hono `secureHeaders`, checked 2026-07-02 at `/home/inktomi/inktomi-stack/development/neo-tavern`).
Neo is a **shape reference, not copy-paste** — two directives change for D44 (marked ⚠️).

**PROD** (what the Hono transport should emit; the dev `server.headers` mirrors it, loosened):

| directive | neo prod | orbweaver | why the delta |
| --- | --- | --- | --- |
| `default-src` | `'self'` | `'self'` | — |
| `script-src` | `'self'` + sha256 of the anti-FOUC inline script | `'self'` + hashes | **steal the hash trick** (below); NO `'unsafe-inline'`/`'unsafe-eval'` in prod |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline'` | **Tailwind AND Base UI** both inject inline `<style>` — Base UI's `ScrollArea.Viewport` + `Select.Popup/List` emit scrollbar-removal styles (used by scroll-area/select/dialog/drawer/toast) |
| `img-src` | `'self' data: blob:` | ⚠️ `'self' blob:` | **drop `data:`** — D44 `allowDataImages:false` + `assetsInlineLimit:0` means the build emits no `data:` URIs and untrusted content can't use them; keep `blob:` for legit client-generated media object-URLs |
| `connect-src` | `'self'` | `'self'` | SSE rides plain HTTP; **no ws/wss in prod** (verified: neo has zero WebSocket server — all streaming is tRPC `httpSubscriptionLink`/SSE) |
| `font-src` | `'self'` | `'self'` | — |
| `object-src` | `'none'` | `'none'` | — |
| `base-uri` | `'self'` | `'self'` | — |
| `form-action` | `'self'` | `'self'` | — |
| `frame-ancestors` | `'none'` | `'none'` | — |

**DEV** = prod LOOSENED for Vite HMR (the ONLY place ws/wss belongs):
- `script-src`: add `'unsafe-inline' 'unsafe-eval'` (HMR runtime).
- `connect-src`: add `ws: wss:` (Vite HMR socket — **the sole reason ws ever appears in a CSP**).
- everything else = prod.

**`style-src 'unsafe-inline'` is a DELIBERATE, reasoned choice — do NOT "harden" it to a nonce.** Both
Tailwind and Base UI (ScrollArea/Select scrollbar-removal) inject *first-party* inline `<style>`. Going
nonce-based would need per-request server HTML templating + Vite `html.cspNonce` + Base UI's `CSPProvider`
— real infra to defend a WEAK threat class (injected `<style>` can't execute code; worst case is CSS
exfiltration / UI-redressing) on a single-operator self-hosted app. The real guard is the **strict
`script-src`** (hash-allowlisted, no `'unsafe-inline'`) — that stays locked, and that's where code-exec
injection is actually stopped. Untrusted content (message media, HTML cards) is isolated by the per-frame
**sandbox** CSP + iframe (D44 §12.2), NOT this app-document `style-src`. Revisit only if orbweaver ever
goes public/multi-tenant — and even then, `script-src` is the lever, not `style-src`. A future agent that
tries to nonce this to "harden" it will only break Base UI's scroll primitives for no real security gain.

**The two patterns worth porting verbatim:**
- **Inline-script hash-allowlist (not `'unsafe-inline'`).** neo carries exactly ONE intentional inline
  script (the anti-FOUC theme initializer — must run pre-first-paint, can't be external) and
  **computes its sha256 from the built `index.html` at boot** (`inlineScriptHashes('./dist/client/index.html')`),
  so editing the script can never silently break prod CSP and a build with no inline scripts adds nothing.
- **Sibling security headers** (same `secureHeaders` call, port as-is): `strictTransportSecurity` gated
  OFF for single-user (plain-http LAN self-host), `xFrameOptions:'DENY'`, `xContentTypeOptions:'nosniff'`,
  `referrerPolicy:'strict-origin-when-cross-origin'`, `crossOriginOpenerPolicy:'same-origin'`.

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
  Hono will set, so D44 violations surface in dev. But NO canonical app-document CSP is authored yet —
  `packages/server` has no HTTP transport, and the only CSP in-tree is the per-frame sandbox CSP
  (`ui/src/content/sandbox-frame/srcdoc.ts`, D44 §12.2). **§7.5 now carries the full verified reference
  policy** (neo's real prod/dev CSP diffed against the two D44 deltas — drop `img-src data:`, no ws in
  prod). `server.headers` stays a TODO until the server document CSP is authored from §7.5; then dev =
  that policy loosened for HMR. The whole thing lands with the `entry/http` transport wave (Phase 6).
- **Dormant-until-consumer:** all query rules, the router `create-route-property-order` rule, and the
  zustand guard no-op on the empty client today — live the moment client code lands.
- **@orb/ui gated NOW:** the one `incompatible-library` warning (virtual-list) is expected seal
  behavior, not a defect (§2).
- **`vite:preloadError` recovery — DO WHEN `main.tsx` HAS CONTENT.** Long-lived SSE sessions + hashed
  chunks + a deploy = an open page requests a chunk hash that no longer exists → `Failed to fetch
  dynamically imported module` → white screen, no recovery. Add a `window.addEventListener(
  'vite:preloadError', …)` in the client entry that triggers ONE soft reload (guard with a
  sessionStorage flag so a genuinely-missing chunk can't reload-loop). Committed client-foundation item;
  not buildable until the entry has real dynamic imports. (Vite guide: Build / Troubleshooting.)
- **`server.fs.deny` — REVISIT WHEN `packages/server` LANDS.** Dev `fs.allow` currently opens the whole
  workspace root over `/@fs/`. Vite's default deny already covers `.env*`, `*.{pem,crt}`, `.git` (our
  secrets are env-based, so we're covered TODAY), but when the server package adds any non-`.env`-named
  secret config, either narrow `fs.allow` to the packages the client actually needs or add explicit
  `fs.deny` globs. D21 no-leak alignment. (`allowedHosts`/DNS-rebinding is moot — dev binds 127.0.0.1.)
- **`html.cspNonce` — wire WITH the §7.5 CSP work.** Built-in hook that stamps a nonce on Vite's
  injected `<script>`/`<style>`/`<link>` tags; the clean path for a nonce-based `script-src` when the
  server document CSP is authored. Don't add before the CSP lands. **Caveat:** Vite's nonce covers only
  Vite's OWN injected tags. Base UI ALSO injects inline `<style>` at runtime (ScrollArea/Select
  scrollbar-removal) — if `style-src` ever drops `'unsafe-inline'` for a nonce-based policy, Base UI needs
  its own `CSPProvider` (`nonce` or `disableStyleElements`) too, or those primitives break under CSP.
  Both are covered by the current `'unsafe-inline'` policy, so neither is needed until/unless we tighten.
