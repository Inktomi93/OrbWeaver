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

---

# Appendix A — Edge layer (Caddy) review (2026-08-09, owner follow-up)

The deploy-serving layer in front of the surface audited above. Read-only.

## Location

**There is NO Caddyfile in the orbweaver repo.** The real one lives in the sibling stack repo:
`/home/inktomi/inktomi-stack/caddy/conf/Caddyfile`. The orbweaver site block is **lines 370-392**
(`@orbweaver host orbweaver.inktomi.tech`). The stack compose
(`/home/inktomi/inktomi-stack/docker-compose.yaml`) publishes Caddy on `80:80`, `443:443`,
`443:443/udp` (lines 140-142) and gives it `extra_hosts: host.docker.internal:host-gateway`
(line 151-152) — i.e. **orbweaver runs bare on the host and Caddy proxies
`host.docker.internal:8788`.** The orbweaver repo's own `docker-compose.yaml` +
`docs/design/containerize-prod-image-spec.md` describe the *target* containerized posture that has
NOT yet been applied (Caddy still targets `host.docker.internal`).

## Verdict: Caddyfile — adjust X · add carve-out Y · already-correct Z

### Already-correct (Z) — leave as-is

- **The public FQDN closes F3 (the core protection).** `@orbweaver host orbweaver.inktomi.tech`:
  Caddy routes strictly by Host and forwards the real `Host` + `X-Forwarded-Proto/Host/For` by
  default. A public request carries `Host: orbweaver.inktomi.tech` → app `isLocalOrigin` false →
  owner-fallback **DENIED** → SSO (Authentik OIDC) mandatory. A remote client **cannot Host-spoof
  through Caddy** — a `Host: localhost` request doesn't match `@orbweaver` and falls to the honeypot
  handle. This is exactly the F3 invariant, and on the FQDN path it holds.
- **OIDC carve-out is covered by default.** The app derives `redirect_uri` from `X-Forwarded-Proto`
  (=https) + Host and validates against `OIDC_REDIRECT_URIS`; Caddy sets those headers by default, so
  no `header_up` is needed (app-side: ensure `OIDC_REDIRECT_URIS` includes
  `https://orbweaver.inktomi.tech/api/auth/oidc/callback`).
- **Back-channel-logout passes.** The catch-all `reverse_proxy` covers
  `POST /api/auth/oidc/backchannel-logout`; there is no `forward_auth` on orbweaver to block the
  IdP's server-to-server call. Auth bootstrap / login / oidc-callback / join all pass (catch-all).
- **CSP: NO clash — Caddy sets zero CSP on orbweaver; the app's strict policy passes through
  untouched.** Verified across the whole file: the `handle @orbweaver` block (`:370-392`) sets no
  CSP (comment `:373` — "CSP is set by the app… duplicating it here creates drift"); the
  `security_headers` snippet (`:91-100`) sets only non-CSP siblings; the site-wide wildcard `header`
  block (`:155-159`) sets HSTS/nosniff/`-Server`, no CSP. The ONLY `Content-Security-Policy` lines in
  the file are scoped inside `handle @searxng` (`:327`, `:331`) — a different host. Caddy's `header`
  directive only affects headers it names, so the app's `Content-Security-Policy` **and the
  card-frame's tighter per-document CSP** (`/api/card-frame/:id`) flow through the reverse_proxy
  unmodified. The app's script-src `'self'` policy is not weakened or overwritten at the edge.
  **Do not** add a `header Content-Security-Policy …` to the snippet or the orbweaver block — keep CSP
  app-owned. (SAMEORIGIN X-Frame-Options is compatible with the card-frame, which the app embeds
  same-origin.)
- **HSTS split is right.** Caddy owns HSTS (`max-age=31536000; includeSubDomains; preload`) at the
  HTTPS edge; the app deliberately sets `strictTransportSecurity:false` (`security-headers.ts:96`)
  because it is also served plain-http on LAN. Caddy is the correct owner of HSTS here.
- **`/api/*` excluded from `encode`** (`@orbweaver_compressible not path /api/*`) + `flush_interval -1`
  + `1800s` timeouts — the D118 multiplexed-SSE requirement (caddy#6293). Correct.
- **Perimeter defenses front orbweaver:** CrowdSec bouncer + per-IP `rate_limit` (skips private
  ranges) + the scanner honeypot fallback + `request_body max_size 1GB`.
- **h3/QUIC in place** (launch checklist): global `protocols h1 h2 h3` (`Caddyfile:13`) + stack compose
  publishes `443:443/udp`. **TLS:** DNS-01 wildcard via Cloudflare, auto-managed. Both satisfied.

### Adjust (X)

1. **[MEDIUM] Close the direct-port bypass — this is the live F3 hole.** Caddy targets
   `host.docker.internal:8788`; the app is bound bare on the host. The Caddyfile's OWN comment
   (`:365-366`) states it plainly: *"owner on the raw LAN IP (which bypasses caddy)."* Anyone on the
   LAN hitting `http://<host-lan-ip>:8788` sends a private-range `Host` → `isLocalOrigin` true
   (`dispatch.ts:59`) → minted **owner** via `AUTH_FALLBACK=owner` (`seam.ts:161`), bypassing Caddy,
   CrowdSec, `rate_limit`, and OIDC entirely. The public FQDN is safe; **the LAN is not.** Rated
   MEDIUM (trusted-LAN, single-user homelab) but it is precisely the F3 invariant.
   **Fix (the orbweaver spec's own D4 recommendation):** containerize orbweaver onto `inktomi-net`
   with `expose: 8788` (NEVER `ports:`) and repoint
   `reverse_proxy host.docker.internal:8788` → `reverse_proxy orbweaver:8788` (keep `flush_interval -1`
   + `1800s` timeouts). **Interim belts if the bare-host layout stays:** bind the app to
   `127.0.0.1:8788` only (not `0.0.0.0`), OR set the app's `IP_ALLOWLIST` to loopback/proxy only, OR
   run an SSO mode with `AUTH_FALLBACK=deny`.
2. **[LOW] Header drift from the shared `security_headers` snippet (SET semantics = it replaces the
   app's).** `X-Frame-Options: SAMEORIGIN` OVERRIDES the app's intended `DENY`
   (`security-headers.ts:98`) — a legacy-header downgrade only; the app's `frame-ancestors 'none'`
   CSP (which Caddy doesn't touch) still enforces DENY in modern browsers, so practical impact ≈ nil.
   `Referrer-Policy: no-referrer` likewise overrides the app's `strict-origin-when-cross-origin`
   (stricter, harmless). If tidying: drop these two from orbweaver's header set and let the app own
   them. Not urgent.

### Add carve-outs (Y) — defense-in-depth edge blocks

Add inside `handle @orbweaver`, wrapped in a `route {}` so they fire BEFORE the catch-all
`reverse_proxy` (Caddy's directive order sorts `respond` oddly relative to `reverse_proxy` — the
Caddyfile's own honeypot lesson at `:453-455` documents this trap; `route` preserves written order).
Build-ready shape:

```caddy
handle @orbweaver {
    import security_headers
    request_body { max_size 1GB }
    route {
        # F1 second belt: never serve sourcemaps from the public edge, even if a build re-ships them.
        @orb_deny path *.map /@fs/* /@vite/* /@id/* /api/_debug/*
        respond @orb_deny 404

        @orbweaver_compressible not path /api/*
        encode @orbweaver_compressible zstd gzip
        reverse_proxy host.docker.internal:8788 {
            flush_interval -1
            transport http { read_timeout 1800s; write_timeout 1800s }
        }
    }
}
```

- **`*.map`** — the second belt for F1 (sourcemap leak), alongside the app-side build fix. Cheap and
  build-config-independent.
- **`/@fs/*`, `/@vite/*`, `/@id/*`** — vite-dev routes; absent in a prod build, so this is pure
  insurance against a dev-image misdeploy.
- **`/api/_debug/*`** — the app already gates this on an admin session or `x-debug-token`; blocking it
  at the public edge (404, preserving the no-existence-leak posture) means operators reach it only
  over the LAN/loopback (or the containerized network), never the FQDN. **Only add this if no operator
  workflow needs `_debug` via the public FQDN** — they shouldn't.

## Honest floors — what I could NOT verify

- **On-disk config ≠ running config.** I read the Caddyfile + stack compose as they sit on disk today;
  I did not probe Caddy's admin API (localhost:2019, not reachable from here) to confirm the loaded
  config matches, nor that Caddy was reloaded after the last edit.
- **App bind address unconfirmed.** The LAN-bypass claim rests on the Caddyfile's own comment
  (`:365-366`) + the containerize spec ("8788 is bound on the host and the owner hits the LAN IP") —
  both first-party. I did NOT inspect the bare-host launch unit/systemd to see whether 8788 binds
  `0.0.0.0` vs a specific interface; that lives outside the repo.
- **No live remote/LAN Host-spoof test.** I have no LAN origin to `curl http://<lan-ip>:8788` with a
  spoofed `Host` — the owner mint on that path is reasoned from `dispatch.ts:47,59` + `seam.ts:161`,
  not reproduced.
- **The D4 containerization has NOT happened yet** — the Caddyfile still targets
  `host.docker.internal:8788`, so the recommended target posture is not the deployed one.
- **Caddy `header` SET-vs-add** for X-Frame-Options is asserted from Caddy v2 default semantics, not
  runtime-confirmed against the served orbweaver response.
