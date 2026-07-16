---
kind: spec
status: implemented
updated: 2026-07-11
---

# Client-side tooling — the ESLint gate + the @orb/client Vite build

> **AS-BUILT (2026-07-11): the ESLint lane, the @orb/client Vite build, and the §7.5 CSP all shipped.** Archived as the as-built design record; the code is now the doc.

> **BUILT (incl. the CSP, §7.5/§9 — 2026-07-11):** the ESLint lane lives in `eslint.config.js` and the Vite build in `packages/client/vite.config.ts` — **both files carry their full WHY inline; they are the doc for everything built.** The app-document CSP is now BUILT at `packages/server/src/entry/http/security-headers.ts` (prod, Hono `secureHeaders`, wired FIRST in `entry/app.ts`) + `packages/client/vite.config.ts` `server.headers` (dev, prod loosened for HMR) + `server.fs.deny` (the `/@fs/` secret sandbox). This file keeps only (a) the §-numbered rationale code comments cite (§7, §9 — do not renumber), (b) the verification detail not worth repeating in code, and (c) the reference CSP (§7.5) that the built policy was derived from. Installed + verified against the live registry 2026-07-02.

> **Triage 2026-07-09 (dispatch board — `README.md` §0):** AS-BUILT. The §7.5 CSP landed 2026-07-11 with the `entry/http` wave (see the §7.5/§9 BUILT notes below). §7/§9 numbers are code-cited: never renumber, never move this file.

## 1. The doctrine — ESLint is the NARROW supplement to Biome

Biome owns formatting + 400+ correctness rules (`biome.json` + the grit plugins). ESLint exists ONLY for the rules Biome can't do: React-hooks + React-Compiler Rules-of-React diagnostics, TanStack Query/Router discipline, Tailwind compiled-class validation, `@typescript-eslint/no-deprecated`, `tsdoc/syntax`. **Explicit-rules-only** (never a `...recommended` bundle — one reasoned exception, §2). Config at repo root; `lint:eslint` is a `pnpm check` stage. Rule-by-rule verdicts + drop reasons: the `eslint.config.js` header.

## 2. eslint-plugin-react-hooks v7 (the React Compiler diagnostics)

Live on `packages/ui/src` + `packages/client/src` + the CT tests. The spread-vs-list exception, the severity overrides, and the `incompatible-library`-stays-warn reasoning are in `eslint.config.js` inline. Verification detail worth keeping here:

- **Compiler-config parity (verified 2026-07-02; set nothing).** Each `react-hooks/*` rule accepts the babel React-Compiler options as `options[0]` (undocumented on react.dev; confirmed in shipped source). We pass NONE and the babel preset also runs all-defaults, so lint and build agree by construction. Mirror an option into the rule entries ONLY if the babel preset ever takes a non-default one. Defaults are correct as-is: `target:'19'`, `compilationMode:'infer'` (full-compiles every eligible component per D54; `'all'` explicitly not recommended), `sources` = not-under-node\_modules (so @orb/ui compiles as source). `react-compiler-healthcheck` deliberately NOT adopted (redundant with these rules; dropped from the official onboarding flow).
- Verified against the `eslint-plugin-react-hooks@7.1.1` tarball: 2 classic + 14 `Recommended` + `void-use-memo`.

## 3. TanStack ESLint plugins (client only — dormant until routes/queries land)

Rule selections + drop reasons: `eslint.config.js` header. The one reclassification worth recording: neo dropped `create-route-property-order` as "ordering," but the rule's own meta says it exists so **type inference works correctly** on `createRoute` trees — correctness, kept.

## 4. TanStack Router — committed-minimal RUNTIME, file-based codegen DROPPED

`@tanstack/react-router` is KEPT, used MINIMALLY — \~3 hand-written code-based routes (BUILT: `packages/client/src/routes/`). The file-based codegen path (`@tanstack/router-plugin`/`router-cli`, `routeTree.gen.ts`) is DELIBERATELY DROPPED per UI-Arch §6.1: type-safety = inference + one `declare module { Register }`, not codegen. The Vite build does NOT wire `tanstackRouter()`; neither plugin is installed.

## 5. eslint-plugin-better-tailwindcss (@orb/ui gated NOW)

3 correctness rules ON, 11 style rules dropped (Biome owns class style/order) — the list + entryPoint wiring: `eslint.config.js`. `no-conflicting-classes` / `no-duplicate-classes` are correctness-adjacent and deliberately deferred until @orb/ui's class surface stabilizes — revisit then.

## 6. @typescript-eslint (parser + one type-aware rule)

typescript-eslint is the PARSER for all linted `.{ts,tsx}` (no v9 exists); its recommended RULE set stays OFF (tsc + Biome own type/style). `@typescript-eslint/no-deprecated` = error on shipped src — the doctrine's `@deprecated` tag as a gate. Turns on `projectService` (accepted cost).

## 7. The Vite + Babel + React-Compiler build (`packages/client/vite.config.ts`)

BUILT — every non-default option is annotated inline in the config; read it, not this. Kept here: the verification notes the config summarizes.

### 7.1 Plugins

`react()` + `babel({ presets: [reactCompilerPreset()] })` + `tailwindcss()` + `vite-plugin-checker` (dev overlay only; `pnpm check` owns gate-time). **Plugin order is cosmetic, NOT load-bearing** (verified in installed source 2026-07-02): the compiler plugin is `enforce:"pre"`, plugin-react's `viteBabel` has no transform hook, and oxc lowers JSX in Rolldown core after all pre-plugins — the compiler sees unmodified source regardless of array position. No `tanstackRouter()` (§4), no `@` alias (`#` subpath imports), no `base`, no version `define`s, no `manualChunks`.

### 7.2 The React-Compiler-sees-\@orb/ui correctness guarantee (the one real risk)

`reactCompilerPreset()` filters by **code content**, client-env-scoped, path-agnostic — it compiles @orb/ui components *only if @orb/ui is consumed as SOURCE*. Hence **`optimizeDeps.exclude: ["@orb/ui"]`**: a pre-bundled @orb/ui would be esbuild-optimized and silently BYPASS the compiler (un-memoized ui). @orb/ui's own node\_modules deps stay pre-bundled; @orb/kit + @orb/contracts are source-consumed by default (no React components → compiler no-ops).

### 7.3 `build`

All rationale inline in the config. The two D-cited calls: `assetsInlineLimit: 0` (no `data:` URIs → the app CSP `img-src` stays tight, D44) and `sourcemap: 'hidden'` (D21 — maps never referenced from the shipped bundle). Any manual output config goes in `build.rolldownOptions`, never the deprecated `rollupOptions`.

### 7.4 `server` (dev)

All rationale inline in the config. `headers` (CSP) is a TODO — §7.5 is the reference policy; the dev CSP = prod loosened for HMR.

### 7.5 The reference CSP — neo's verified policy + the orbweaver deltas (BUILT 2026-07-11 — `entry/http/security-headers.ts` + `vite.config.ts`)

> **BUILT.** The prod policy is `packages/server/src/entry/http/security-headers.ts` (`securityHeaders({dev})`, Hono `secureHeaders`, wired `app.use("*")` FIRST in `entry/app.ts` so every response — including the ingress 403 and the SPA HTML served by `entry/http/spa.ts` — carries it). The dev mirror is `vite.config.ts` `server.headers`. The table below is the derived-from reference; the built code + its file header are the doc. **Deltas the AS-BUILT policy adds beyond this table** (derived by inspecting how the app renders, not from neo): `media-src 'self' blob:` (the §12.3 native-a/v backstop, same posture as img-src). All other directives match this table exactly. `style-src 'unsafe-inline'` is confirmed load-bearing by three first-party inline-style emitters: Tailwind, Base UI (ScrollArea/Select scrollbar removal), and the owner-theme `<style>` injector (`client/src/features/app-shell/components/custom-theme-style.tsx`, `el.textContent`). `script-src` is `'self'`-only in BOTH prod and (loosened) dev because the client ships ZERO inline scripts: `index.html` has one external module `<script src=/src/main.tsx>`, and `build.modulePreload.polyfill:false` means Vite injects no inline preload-polyfill script — so no nonce/hash is needed (§9 `html.cspNonce` note).

This is the **verified** starting point (source: neo `src/server/app.ts` Hono `secureHeaders`, checked 2026-07-02). Neo is a shape reference, not copy-paste — two directives change for D44 (marked ⚠️).

**PROD** (the Hono transport emits; dev mirrors it, loosened):

| directive | neo prod | orbweaver | why the delta |
| - | - | - | - |
| `default-src` | `'self'` | `'self'` | — |
| `script-src` | `'self'` + sha256 of the anti-FOUC inline script | `'self'` + hashes | steal the hash trick (below); NO `'unsafe-inline'`/`'unsafe-eval'` in prod |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline'` | Tailwind AND Base UI both inject first-party inline `<style>` (ScrollArea/Select scrollbar-removal) |
| `img-src` | `'self' data: blob:` | ⚠️ `'self' blob:` | drop `data:` — D44 `allowDataImages:false` + `assetsInlineLimit:0` means no `data:` URIs exist; keep `blob:` for client-generated object-URLs |
| `connect-src` | `'self'` | `'self'` | SSE rides plain HTTP; no ws/wss in prod (verified: neo has zero WebSocket server) |
| `font-src` / `base-uri` / `form-action` | `'self'` | `'self'` | — |
| `object-src` / `frame-ancestors` | `'none'` | `'none'` | — |

**DEV** = prod LOOSENED for Vite HMR (the ONLY place ws/wss belongs): `script-src` + `'unsafe-inline' 'unsafe-eval'`; `connect-src` + `ws: wss:`; everything else = prod.

**`style-src 'unsafe-inline'` is a DELIBERATE, reasoned choice — do NOT "harden" it to a nonce.** Both Tailwind and Base UI inject first-party inline `<style>`. Nonce-based would need per-request server HTML templating + Vite `html.cspNonce` + Base UI's `CSPProvider` — real infra to defend a WEAK threat class (injected `<style>` can't execute code) on a single-operator self-hosted app. The real guard is the strict `script-src` (hash-allowlisted). Untrusted content is isolated by the per-frame sandbox CSP + iframe (D44 §12.2), NOT this app-document `style-src`. A future agent that tries to nonce this will only break Base UI's scroll primitives for no real security gain.

**Two patterns worth porting verbatim from neo:**

- **Inline-script hash-allowlist (not `'unsafe-inline'`).** neo carries exactly ONE intentional inline script (the anti-FOUC theme initializer) and computes its sha256 **from the built `index.html` at boot** — editing the script can never silently break prod CSP.
- **Sibling security headers** (same `secureHeaders` call): `strictTransportSecurity` gated OFF for single-user plain-http LAN self-host, `xFrameOptions:'DENY'`, `xContentTypeOptions:'nosniff'`, `referrerPolicy:'strict-origin-when-cross-origin'`, `crossOriginOpenerPolicy:'same-origin'`.

## 8. Versions

All pins live in the `pnpm-workspace.yaml` catalog (the one home), referenced via `catalog:`. Two release-age step-downs were recorded at install (`@tanstack/react-router`, `vite` — both a patch behind, blocked by `minimumReleaseAge: 1440`; carets adopt them once mature).

## 9. Open items / flags

- **plugin-react peer warning (unresolved by choice).** `@vitejs/plugin-react@4.7.0` (a transitive of `@playwright/experimental-ct-react`'s own internal bundler) unmet-peers vite 8. Cosmetic — install succeeds, `pnpm check` unaffected, the client build uses its own 6.x. Forcing the transitive is a MAJOR bump on a working test harness; left as-is (a one-line `overrides` if we accept the CT-harness risk — validate against `pnpm test:ct` first).
- **CSP-string gap (dev `server.headers`) — BUILT 2026-07-11.** `vite.config.ts` `server.headers["Content-Security-Policy"]` now mirrors the prod policy (`entry/http/security-headers.ts`), loosened at exactly two directives for HMR (`script-src` + `'unsafe-inline' 'unsafe-eval'`; `connect-src` + `ws: wss:`) so D44 violations surface in dev. The two mechanisms can't share code (one-directional package cake — the client cannot import the server's Hono object), so the dev string and `security-headers.ts` must be edited in lockstep (both carry that note inline).
- **`vite:preloadError` recovery — DO WHEN `main.tsx` HAS CONTENT.** Long-lived SSE sessions + hashed chunks + a deploy → an open page requests a rotated chunk hash → white screen. Add a `window.addEventListener('vite:preloadError', …)` in the client entry that triggers ONE soft reload (sessionStorage flag so a genuinely-missing chunk can't reload-loop). Committed client-foundation item; not buildable until the entry has real dynamic imports.
- **`server.fs.deny` — BUILT 2026-07-11.** `fs.allow` still opens the workspace root (required — the `@orb/*` packages live outside `packages/client`), so `fs.deny` (which REPLACES Vite's default, not merges) now re-lists the Vite 8.1 default floor AND adds the orbweaver on-disk secrets the root scope exposes: `**/.credentials-key` (infra/crypto's auto key — NOT matched by the default `*.key` glob: it ends in `-key`, not `.key`; leaking it decrypts every stored provider key), `**/*.db{,-wal,-shm}` + `**/*.sqlite*` (the DB = all user data + encrypted credentials; `DATABASE_URL` defaults to `file:./orbweaver.db`), and `**/data/assets/**` (the CAS blob store, otherwise `/@fs/`-readable past the owner-gated `/api/blob`). D21 alignment.
- **`html.cspNonce` — NOT wired (correctly), decided with the §7.5 work 2026-07-11.** It's only needed if `script-src` uses a nonce; the built policy is `script-src 'self'`-only with ZERO inline scripts (external module entry + `modulePreload.polyfill:false`), so there is nothing to nonce and adding one would be dead config. Covers only Vite's OWN injected tags anyway; if `style-src` ever drops `'unsafe-inline'`, Base UI also needs its `CSPProvider` or the scroll primitives break. Neither is needed under the current policy.
