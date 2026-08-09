---
kind: security-review
status: findings
scope: pre-auth (no-session) HTTP attack surface — routes + servable files
date: 2026-08-09
verified-against: working tree @ main; live probe of the running stack on http://127.0.0.1:8788
---

# Pre-auth attack surface — the unauthed-reachable route + file inventory

**Read-only audit.** No code changed. Fixes are proposed, not applied.

Owner concern: everything a no-session client reaches (login shell, favicon/icons, bootstrap
routes) must not be a deep-probe foothold. This enumerates and minimizes that surface.

## TL;DR (outcome first)

- **ONE sharp finding, live-confirmed: production sourcemaps ship into the served `dist/` and are
  fetchable unauthenticated.** `GET /assets/index-BwanMldm.js.map` → `200`, `application/json`,
  **20.3 MiB**, contains `sourcesContent` for **811 first-party `src/**` files** — i.e. the entire
  client app's original TypeScript/TSX (every authed route's logic, comments, internal API shapes)
  reconstructable by any anonymous visitor. `sourcemap: "hidden"` only drops the `//# sourceMappingURL`
  comment; the `.map` file still lands in the dir `serveStatic` serves, and the name is deterministic
  (`<bundle>.js` → `<bundle>.js.map`), so no guessing is needed. **This is the item to fix.**
- **Dev/debug routes are correctly absent/gated in prod.** `/@fs`, `/@vite` are vite-dev-only (no such
  handler in the prod Hono app); `/api/_debug/*` requires an admin session or `x-debug-token`
  (live: `401` with no token; the `via:"fallback"` origin-owner is explicitly NOT a debug credential).
- **No data leaks without a session on the API.** Every binary/ingest route (`blob`, `card-frame`,
  `upload`, `export`, `import*`) gates `principal === null → 401`; tRPC exposes only three
  anonymous-allowed procedures, none of which touch data (`health`, `echo`, `clientError`).
- **One deploy-posture invariant must be stated (C13):** the origin-gated owner-fallback trusts the
  client-controlled `Host` header, so if the server port is directly reachable by an untrusted
  network, the unauthed world can mint itself as owner on the data routes. By design; must be fenced
  at the deployment boundary.

---

## 1. The unauthed-reachable route + file set (exhaustive)

Registration order is `entry/app.ts` (SPA registers LAST; every API route wins by order). The
per-request middleware `entry/app.ts:175` resolves a `Principal | null` onto context but **does not
reject** — gating is per-route.

### 1a. Truly anonymous (no principal required)

| Surface | What it is | Exposes | Should be reachable sans session? |
| - | - | - | - |
| `GET /` + `/assets/*` + `/favicon.svg` + `/backgrounds/*` + `/poses/library/*` + copied `public/*` | Static bundle via `serveStatic({root: distDir})` (`spa.ts:59`) | The login/app shell HTML, hashed JS/CSS, **and `.map` sourcemaps (see F1)** | Yes for the shell/assets; **NO for `.map`** |
| `GET /healthz` (`healthz.ts`) | Liveness | `{status, harness}` — `ok` / `shutting_down` / `credentials_key_mismatch`; no secret | Yes |
| `GET /api/auth/config` (`auth-meta.ts:51`) | Auth bootstrap the client boots off | `mode, requiresLogin, oidc/localEnabled, oidcProviderName, localFirstRun, discreetLogin, defaultHandle, multiHumanCapable, forbidExternalMedia, trustHtml, upload caps` | Yes (by design — client can't discover mode via tRPC pre-login) |
| `GET /api/auth/me` (`auth-meta.ts:72`) | Session-state echo | `{authenticated, handle, role}` — reflects the resolved principal (nulls when anonymous) | Yes |
| `POST /api/auth/login` (`auth-routes.ts:310`, local) | Password login | — | Yes; belted: body cap + per-IP throttle (`login-ip` scope, `AppSettings.rateLimits.login`) |
| `POST /api/auth/first-run` (`auth-routes.ts:340`, local) | Owner-password setup | — | Yes; belted: **origin gate** (`ownerFallbackAllowed`) + body cap + throttle + refuses to overwrite an existing owner cred |
| `POST /api/auth/logout` (`auth-routes.ts:388`) | Session revoke | — | Yes |
| `GET /api/auth/oidc/login` + `/callback`, `POST /api/auth/oidc/backchannel-logout` (`auth-routes.ts:438+`, oidc) | OIDC flow | redirect | Yes; `redirect_uri` derived per-request and accepted only on exact-match to `OIDC_REDIRECT_URIS` (no open redirect / origin reflection — `auth-routes.ts:12,419`) |
| `GET /join/:token` (`join.ts`) | Invite landing → `302 /?join=<token>` | Bounces token into SPA | Yes; `404` when not multi-human-capable (leak-free), token is `encodeURIComponent`'d into a fixed path (no open redirect) |
| tRPC `health`, `echo`, `clientError` (`router.ts:43-51`, `publicProcedure`) | Anonymous-allowed diagnostics | `health`→`{ok}`; `echo`→reflects input string; `clientError`→fire-and-forget error report | Yes by design (a pre-auth render crash must be reportable). `echo` is a pure reflection diagnostic — candidate for removal (INFO). |

### 1b. Reachable but GATED (return `401`/`404` without a credential — NOT part of the anonymous surface)

| Surface | Gate | Verified |
| - | - | - |
| `GET /api/blob/:hash` (+`?w=`) | `principal === null → 401`; unowned blob is `404` (no existence leak) — `blob.ts:57` | code + live |
| `POST /api/card-frame`, `GET /api/card-frame/:id` | `principal === null → 401`; POST also needs CSRF header; per-user 128-bit handle store — `card-frame.ts:203,240` | code + live |
| `POST /api/upload/*`, `/api/export/*`, `/api/import*` | `principal === null → 401` before body read — all files | code |
| `/api/trpc/*` (all except the 3 above) | `authedProcedure` / `multiHumanProcedure` / admin — `trpc.ts:100,113` | code |
| `/api/_debug/*` | admin session **or** `x-debug-token` (timing-safe); un-credentialed → `401`, or `404` if `DEBUG_TOKEN` unset. `via:"fallback"` is explicitly NOT a credential (`DEBUG_GATE_CREDENTIALED`, AUTHFIX-2) | code + live (`401`) |

**Deliverable #3 settled:** the anonymous surface is exactly {static shell + hashed assets (+ the
leaking `.map`), the auth bootstrap/login/oidc/join routes, and 3 non-data tRPC procedures}, and
NOTHING else — no data tRPC, no directory listing (`GET /assets/` → `404`, live), principal-scoped
blob returns nothing to a session-less caller.

---

## 2. Findings

### F1 — [HIGH] Production sourcemaps are served to unauthenticated clients — full first-party source recovery

**What.** The prod client build emits `.map` files INTO the served `dist/assets/` dir.
`sourcemap: "hidden"` (`packages/client/vite.config.ts:255`) suppresses only the
`//# sourceMappingURL` comment in the bundle (verified: `grep -c sourceMappingURL index-*.js` → `0`),
not the file. `spa.ts:59` serves the whole `distDir` via `serveStatic`, and its cache branch even
tags `/assets/*.map` `immutable` (`spa.ts:64`).

**Evidence (build + live).**
- `packages/client/dist/assets/`: 18 `.map` files beside 19 `.js`.
- `index-BwanMldm.js.map`: `sourcesContent` present; `"sources"` lists 811 unique `../../src/**`
  first-party files plus every `node_modules/.pnpm/**` dep path (directory layout + exact dep
  versions).
- `index.html` (served at `/`) references `assets/index-BwanMldm.js` → attacker appends `.map`, no
  guessing.
- **Live:** `curl http://127.0.0.1:8788/assets/index-BwanMldm.js.map` → `200`,
  `content-type: application/json`, `content-length: 21279556` (20.3 MiB), body begins with a valid
  source-map and contains `sourcesContent`. `GET /assets/` (listing) → `404`.

**Exploit.** Any anonymous visitor: `GET /` → read the bundle name from the `<script>` tag →
`GET /assets/<bundle>.js.map` → recover the entire client codebase (auth flow, every authed route's
logic, internal tRPC/wire shapes, comments, any client-embedded constants). This is precisely the
"deep-probe foothold" the owner is worried about, and it is origin-independent (static files need no
principal), so it leaks in every AUTH_MODE.

**Minimal fix (pick one; belt-and-suspenders recommended):**
1. **Do not ship maps in the served dir.** Set `sourcemap: false` for the build that produces the
   container's `dist/`, OR keep `hidden` and move/delete `*.map` out of `dist/` in the build/container
   step (retain them out-of-band for symbolication if wanted). This is the root fix and the one to
   land first. Note D21's own stated intent (`vite.config.ts:254` — "don't expose source layout to
   clients") is currently NOT achieved by `hidden` alone.
2. **Belt in `spa.ts`:** before `serveStatic`, 404 any non-`/api` path ending in `.map` (and, cheaply,
   `.ts`/`.tsx`). Defense-in-depth so a future build config regression can't re-leak.

### F2 — [INFO] Dev/debug routes confirmed dev-only / gated in prod

- `/@fs`, `/@vite` are vite-dev-server routes only; the prod Hono app has no such handler (only
  `serveStatic`). Live on the dev origin `:5173`, `GET /@fs/etc/passwd` → `403` (vite `server.fs.deny`
  in `vite.config.ts:320` works — it re-lists vite's default floor plus `.credentials-key`, `*.db*`,
  `data/assets/**`).
- `GET /.vite/license.json` → `404` (the dependency-license manifest that lives in `dist/.vite/` is
  NOT served — `serveStatic` does not serve the dot-dir). No dep-inventory leak via that path.
- `/api/_debug/*` → `401` unauthed (live). No action.

*Deploy note:* the vite dev server (`:5173`) must never be network-exposed in a production deploy;
it is the dev front door and has no place in prod (there is no vite in the prod image).

### F3 — [MEDIUM, deploy-posture / C13] Host-header owner-fallback = the unauthed world is owner on data routes if the port is directly reachable

**What.** `ownerFallbackAllowed` (`infra/auth/dispatch.ts:47`) grants the un-credentialed
`via:"fallback"` owner identity when `AUTH_FALLBACK=owner` AND the origin is trusted. `isLocalOrigin`
(`dispatch.ts:59`) reads the **client-controlled `Host` header** — `localhost`, a configured trusted
host, or a private/loopback range. In `single-user` mode it is unconditional. The seam then mints a
full owner `Principal` from that (`entry/auth/seam.ts:161`), which passes the `principal !== null`
gate on `blob` / `card-frame` / `upload` / `export` / `import*` / every `authedProcedure`.

**Live corroboration.** On the running stack, unauthed `curl /api/blob/abc` → `404` (not `401`): a
principal WAS minted for the session-less local request. Same for `/api/card-frame/<id>` → `404`.

**Why it's contained (and where it isn't).** The `/api/_debug` gate excludes `fallback`
(`DEBUG_GATE_CREDENTIALED`, AUTHFIX-2), so debug stays closed. The design comment (`dispatch.ts:6-13`)
notes a proxy-rewritten `Host` "can only REMOVE trust". True for a proxy — but a remote attacker who
reaches the server **port directly** (bypassing the proxy) sets `Host: localhost` themselves and, in
any `AUTH_FALLBACK=owner` deployment, is minted owner on the data routes. In `single-user` this is
the whole model; in SSO modes it's the fallback.

**Fix / invariant (C13 deploy posture, not a code change):** the server port MUST NOT be directly
reachable from untrusted networks — front it with the reverse proxy and/or set `IP_ALLOWLIST`
(`entry/app.ts:169`). State this as a deployment invariant. No code defect; documenting the
assumption is the deliverable.

### F4 — [INFO] Debug gate holds against the fallback owner

Confirmed: `via:"fallback"` is not a debug credential and unsetting `DEBUG_TOKEN` yields `404`, not an
open gate (the AUTHFIX-2 regression is closed and pinned by
`tests/server/entry/debug-gate.suite.test.ts`). No action.

---

## 3. Prioritized strip/deny list (feeds fix lanes + C13)

1. **[HIGH] Strip prod `*.map` from the served `dist/`** — root fix in the build/container step
   (`sourcemap: false` for the shipped build, or delete/move maps out of `dist/`), PLUS a `.map`/`.ts`
   404 belt in `spa.ts`. Achieves the D21 intent the config comment already claims.
2. **[MEDIUM] C13 invariant:** server port not directly reachable by untrusted networks; the
   Host-based owner-fallback assumes a proxy-fronted port + `IP_ALLOWLIST`. Document it.
3. **[INFO] Code-split (#43):** today the client largely downloads as one bundle, so an unauthed
   visitor pulls the whole app's JS (all authed routes' code, readable) regardless of F1. Landing #43
   route-level code-splitting shrinks the pre-auth JS the anonymous world receives — a security win
   (smaller readable pre-auth surface), not just perf. Independent of F1, which must be fixed anyway.
4. **[INFO] Optional:** drop the tRPC `echo` reflection procedure (`router.ts:46`) if it has no
   consumer — a pure input-reflection endpoint on the anonymous surface earns its keep only if used.

---

## 4. Honest floors — what I did NOT verify

- **Auth mode of the probed stack was not confirmed.** The `:8788` stack minted a fallback owner for
  session-less local requests (blob/card-frame → `404` not `401`), which implies `single-user` or
  `AUTH_FALLBACK=owner` on a local origin. I did **not** drive a real remote/public-FQDN origin to
  demonstrate the `Host: localhost` owner-mint end-to-end (F3) — that claim is reasoned from source
  (`dispatch.ts` + `seam.ts`), not live-reproduced.
- **The inspected `dist/` was built 2026-08-04.** A fresh build could differ in hashes, but the
  `.map` emission is deterministic from `vite.config.ts` (`sourcemap: "hidden"`), so F1 holds for any
  build produced with the current config.
- **tRPC procedure census was structural, not exhaustive per-router.** I confirmed only `health`,
  `echo`, `clientError` use `publicProcedure` (9 total `publicProcedure` refs, all in
  `trpc.ts`/`router.ts`) and that a sample protected query leaked nothing; I did not read every domain
  router to re-confirm each uses `authedProcedure`+.
- **`serveStatic` traversal hardening** relied on its documented guard + the `/assets/` `404` (no
  listing) probe; I did not fuzz encoded-traversal variants against the live static server.
- **`clientError` input handling** (what an anonymous caller can push into logs) was not audited for
  log-injection/DoS; it is fire-and-forget by design but the payload shape/size bounds were not
  checked.
