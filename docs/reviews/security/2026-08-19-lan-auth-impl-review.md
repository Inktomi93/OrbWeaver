---
kind: review
status: active
updated: 2026-08-19
---

# LAN/hosted auth unification — cold security review of `wt/agent-aaeeb6b5c3dc02237` (#298/#300)

Reviewer: `security-executor`, fresh context, review-only (no source edits). Branch: two commits on
`wt/agent-aaeeb6b5c3dc02237` over base merge `ef4424fa4` — `46a262793` (peer-IP re-gate + multipart
CSRF) and `4a828a534` (prod boot-guard + break-glass). Every touched `.ts` read in full, plus the seams
they call.

## Verdict

**HOLES — one P1, plus two P2 hardening/doc notes. The core re-gate (commits 46a262793 + 4a828a534) is
sound; the P1 is a route the #300 multipart-CSRF sweep MISSED, not a defect the sweep introduced.**

- **P1 — `/api/import/bundle` (`entry/http/import.ts`) still gates CSRF on `via === "cookie"` only, not
  `via !== "header"`.** The loopback-owner `fallback` arm is CSRF-unprotected on a CORS-simple ingest
  route. This is the exact bug the #300 fix closed on its three siblings; the fourth was left behind.
- **P2 (defense-in-depth) — the prod boot-guard's sole discriminator is `NODE_ENV==="production"`.** A
  hand-rolled prod launch that omits it, behind a same-host loopback proxy, with the default
  `AUTH_FALLBACK=owner`, is a silent SSO bypass that boots clean.
- **P2 (doc) — the break-glass recovery procedure does not tell the operator to stop/bypass the
  front proxy.** While break-glass is active behind a same-host loopback proxy, the whole #298 hole is
  reopened for every LAN user, not just on-box loopback.

Everything else enumerated in the brief (peer-IP provenance, four-mode cohesion, bootstrap seeding, the
tRPC JSON-preflight claim, SSO graduation / owner-takeover, CSP) is **confirmed sound** with receipts
below.

---

## 1. Peer-IP gate provenance (brief Q1) — SOUND

`ownerFallbackAllowed(peerIp)` (`infra/auth/dispatch.ts:52`) matches only `LOOPBACK_RANGES`
(`127.0.0.0/8`, `::1/128`) and fails closed on `undefined`. The value it receives is the raw TCP socket
peer at every call site that can reach it:

- `entry/app.ts:193` — `const peer = peerIp(c)` → `infra/network/ingress.ts:56` →
  `getConnInfo(c).remote.address`. **No XFF precedence.** Threaded into `resolvePrincipal` as `peerIp`
  (`app.ts:194-195`), through the seam (`seam.ts:334`) into `resolve` deps, consumed by the fallback arm
  (`infra/auth/index.ts:53`).
- `entry/http/auth-routes.ts:451` (first-run) and `lifecycle.ts:385,388` (localFirstRun) both call
  `ownerFallbackAllowed(peerIp(c))` on the same raw-socket helper.
- The XFF-trusting resolver `clientIp()` (`ingress.ts:45`, honors leftmost XFF only when the peer is
  private/loopback/trusted) is used **only** for the rate-limit key and the `IP_ALLOWLIST` belt
  (`app.ts:234`, `trpc.ts:104`, `ingress.ts:70`) — **never** for the fallback decision. `peerIp` and
  `clientIp` are cleanly separated: the two helpers live side-by-side in `ingress.ts` with the anti-spoof
  distinction documented, and no fallback path reads `clientIp`.
- The forward-header unsigned path also gates on the raw peer (`modes/forward-header.ts:141`,
  `isInRanges(peerIp, forwardTrustedProxies)`), never on `X-Forwarded-For`/`X-Real-IP`.

No path lets a forged `X-Forwarded-For` or `Host` header reach the fallback decision. The old
`isLocalOrigin`/`trustedLocalHosts`/`trustedPrivateRanges` (Host-header) gate is fully removed.

## 2. Boot-guard combination table (brief Q2) — SOUND on the supported path; P2 residual

Guard (`foundation/env/index.ts:533`): fatal iff
`NODE_ENV==="production" && AUTH_MODE!=="single-user" && AUTH_FALLBACK==="owner" && !AUTH_BREAK_GLASS`.

An ambient owner-mint requires BOTH `config.fallback==="owner"` (`infra/auth/index.ts:53`) AND a loopback
peer. Enumerating the prod (`NODE_ENV=production`) space by (mode × fallback × break-glass):

| mode | fallback | break-glass | boots? | ambient owner-mint on loopback peer? | verdict |
| - | - | - | - | - | - |
| single-user | owner | any | yes (exempt) | yes — by design (no SSO; fallback IS the auth) | warned at `lifecycle.ts:530` on public bind |
| single-user | deny | any | **no** (`env.ts:505`) | n/a | single-user's only credential is the fallback → fatal |
| local/oidc/forward-header | owner | false | **no** (`env.ts:533`) | would-be yes → prevented | correct: the #298 fatal |
| local/oidc/forward-header | owner | true | yes | **yes** — deliberate break-glass | warned every boot (`lifecycle.ts:402`); see §3 |
| local/oidc/forward-header | deny | any | yes | no (fallback short-circuited) | secure prod default |

The guard covers **all three** SSO modes (`AUTH_MODE !== "single-user"`), not just oidc — verified against
`AUTH_MODES`. No prod (mode,fallback,break-glass) combination yields an ambient owner-mint yet boots,
except the two intended ones (single-user, and explicit break-glass), both of which warn loudly.

**Is `NODE_ENV` a sufficient discriminator? — P2 residual.** The supported prod launchers
(`pnpm stack up prod` and `pnpm stack start-fg prod`, both via `buildProdSpawnPlan` since the
launch-centralize consolidation removed `pnpm start`, #309) are the ONLY place `NODE_ENV=production` is
set; the dev stack (`pnpm stack up`) / the e2e webServer set none → `development`
(`containerize-prod-image-spec.md`; `Dockerfile` sets `ENV NODE_ENV=production`). So the *supported* prod
path is safe. But the design leans entirely on that:
a hand-rolled prod launch (bare `node …/index.js`) that forgets `NODE_ENV=production`, behind a same-host
Caddy/nginx proxying to `127.0.0.1`, with `AUTH_FALLBACK` left at its **default `owner`**, is a full SSO
bypass that:

- does NOT trip the boot-guard (`NODE_ENV!=="production"`),
- binds loopback-only (`bind.ts:120-124`, non-prod default) — so no `publicBind` warning fires
  (`bind.ts:143` returns `[]`), yet the same-host proxy still reaches it, and
- mints owner for every LAN user on the resulting loopback peer.

This is the recurrence of the 2026-08-09 "dev process served prod" incident shape via the loopback-proxy
vector that `bind.ts` itself acknowledges it cannot close (`env.ts:522-527`). The env comment explicitly
weighs and rejects the `publicBind` and "behind a proxy" alternatives, so this is a *considered* tradeoff,
not an oversight — but it is a single-point-of-failure worth a hardening note: consider also warning (not
fatal) when `AUTH_MODE!=="single-user" && AUTH_FALLBACK==="owner" && !break-glass` regardless of
`NODE_ENV`, so a mislaunched prod box at least emits a standing SECURITY line. Not blocking.

## 3. Break-glass (brief Q3) — WORKS AS DESIGNED; P2 doc gap on the recovery procedure

`AUTH_BREAK_GLASS=true` unlocks the guard but does not itself enable the fallback (`AUTH_FALLBACK=owner`
is still required — `env.ts:383-388`, `seam.ts:187-194`). It opens **no new hole beyond what a loopback
peer already grants** — the mint still runs through `ownerFallbackAllowed` (loopback only) and the same
`principalFromRow` + `enabled` gate.

BUT the brief's exact scenario is real and the design admits it: **with break-glass set in prod behind a
same-host Caddy over loopback, every LAN user's request is a loopback peer → owner.** `lifecycle.ts:404`
warns precisely this ("SSO is bypassed for any request on a loopback socket (incl. a same-host reverse
proxy)"). During the break-glass window the entire #298 hole is reopened — that is the inherent nature of
the escape hatch, gated by operator opt-in + a loud every-boot warning + "revert when done."

The residual is procedural, not code: the recovery instructions (`seam.ts:190-194`,
`containerize-prod-image-spec.md §4`) tell the operator to `curl http://127.0.0.1:8788/...` (hit node
directly) but do **not** instruct them to STOP or firewall the front proxy first. An operator who flips
break-glass while Caddy keeps forwarding hands owner to the whole LAN for the duration. **Recommend the
docs state: during break-glass, stop the front proxy or bind the port to loopback-with-no-proxy, and hit
node directly.** P2 doc hardening; the code is behaving as specified.

## 4. CSRF coverage (brief Q4) — HOLE (P1) + tRPC claim SOUND

**Inventory of every state-changing route on the app** (`app.ts` mounts; `.post`/`.put`/`.delete` swept
across `entry/http` + `entry/import`; blob/export/auth-meta/join confirmed GET-only):

| route | file:line | CSRF gate | ambient `fallback` arm protected? |
| - | - | - | - |
| `POST /api/assets/upload` | `upload.ts:102` | `via !== "header"` | yes ✅ |
| `POST /api/databank/upload` | `upload.ts:135` | `via !== "header"` | yes ✅ |
| `POST /api/import` | `upload.ts:161` | `via !== "header"` | yes ✅ |
| `POST /api/import/tree` | `import-tree.ts:299` | `via !== "header"` | yes ✅ |
| `POST /api/import/chat` | `import-chat.ts:142` | `via !== "header"` | yes ✅ |
| **`POST /api/import/bundle`** | **`import.ts:65`** | **`via === "cookie"` only** | **NO ❌ — the hole** |
| `POST /api/card-frame` | `card-frame.ts:250` | `!hasCsrfHeader` (all arms) | yes ✅ (stricter) |
| `POST /api/auth/logout` | `auth-routes.ts:499` | `!hasCsrfHeader` (all arms) | yes ✅ |
| `POST /api/auth/login` | `auth-routes.ts:409` | none (pre-auth, throttled) | n/a — login CSRF is a distinct lower class |
| `POST /api/auth/first-run` | `auth-routes.ts:451` | loopback-peer gate + one-shot | yes ✅ |
| `POST /api/auth/oidc/backchannel-logout` | `auth-routes.ts:674` | signed `logout_token` (JWKS) | n/a — server-to-server |
| tRPC mutations | `app.ts:219` / `trpc.ts:132` | `via === "cookie"` (JSON→preflight) | see below ✅ |

### P1 — `/api/import/bundle` CSRF hole (concrete exploit)

`import.ts:65`:

```
if (principal.via === "cookie" && !hasCsrfHeader(c.req.raw.headers)) { return c.body(null, FORBIDDEN); }
```

This exempts the `fallback` (loopback owner) arm. The route reads `c.req.raw.body` as a raw stream
(`import.ts:68`) and never checks `Content-Type`, so it is a CORS-"simple" (no-preflight) route exactly
like its multipart siblings. The #300 fix upgraded upload/import-tree/import-chat to `via !== "header"`
for precisely this reason (a `fallback` request is forgeable by a cross-site page because "the browser
auto-sends its loopback socket" — `upload.ts:74-82`), but `import.ts` was not touched by this branch
(confirmed: `import.ts` is absent from `diff main...HEAD`; the `via === "cookie"` line dates to
`b808f7604`, pre-branch). So it is a **pre-existing gap that the branch's own multipart-CSRF sweep should
have caught and did not** — the branch description enumerates the three siblings and omits the fourth.

Exploit (default single-user deployment, the primary mode):

1. Operator runs orbweaver single-user (default). The owner is always the loopback `fallback` arm.
2. A browser on the box visits `evil.com`, which runs:
   `fetch("http://127.0.0.1:8788/api/import/bundle", {method:"POST", body: new Blob([attackerZipBytes], {type:"text/plain"})})`
   — CORS-simple, no preflight, no `x-orb-csrf` header.
3. The request's TCP peer is `127.0.0.1` → `ownerFallbackAllowed` true → `via:"fallback"`, owner minted.
4. `import.ts:65` checks only `via === "cookie"`, so the fallback owner passes with no CSRF header.
5. A per-owner `import-bundle` workload starts (`import.ts:84`, HTTP 202) and writes attacker-controlled
   characters / presets / world-info / chats / personas into the owner's library — including, e.g., an
   interactive/HTML card or world-info entry that later executes in the owner's own rendering context.

The three sibling routes correctly reject this (they require `x-orb-csrf`, which a cross-site `fetch`
cannot set without the preflight the app never grants). `/api/import/bundle` does not. **Minimal fix:**
change `import.ts:65` to `if (principal.via !== "header" && !hasCsrfHeader(...))`, matching the sibling
`authCsrfGuard`.

Why no test caught it (brief Q6): the only bundle-route coverage,
`tests/server/entry/http/portability-routes.suite.int.test.ts`, drives the route with a `via:"header"`
principal (line 151: *"header principal → CSRF gate inert"*). No test exercises the `via:"fallback"` arm
against the bundle route, whereas this branch added fallback-CSRF assertions to the three siblings
(`upload.test.ts +18`, `import-tree.test.ts +9`, `import-chat.test.ts +20` in the diff). The bundle route
got none. **A regression test asserting `via:"fallback"` + no header → 403 on `/api/import/bundle` should
land with the fix.**

### tRPC "JSON forces preflight" claim — SOUND

`trpc.ts:132` gates only `via === "cookie"`, exempting `fallback`. This is correct: every tRPC call
(query/mutation/batch) is dispatched by the tRPC fetch client with `Content-Type: application/json`, which
is NOT a CORS-safelisted content-type, so a cross-origin `fetch` triggers a preflight — and the app mounts
NO CORS middleware (`app.ts` has no `cors()`), so the preflight is never granted. A cross-site page
therefore cannot drive ANY tRPC mutation on ANY `via` arm, so the `fallback` arm needs no header there.
Edge cases checked: batching still POSTs `application/json` (same preflight); there are no GET-ified
mutations (mutations are POST in tRPC; only queries can be GET, and queries are not state-changing and are
CSRF-irrelevant); the 1 MiB body cap (`app.ts:217`) is content-type-agnostic and doesn't weaken this. The
asymmetry between the multipart routes (`via !== "header"`) and tRPC (`via === "cookie"`) is deliberate and
correct — multipart/form-data + text/plain are CORS-simple, JSON is not.

## 5. Four-mode cohesion + bootstrap (brief Q5) — SOUND

- **deny + oidc seeds a reachable owner with no fallback dependency.** `seedOwner`
  (`entry/boot/seed-owner.ts:87`) ensures the `OWNER_HANDLES` row at `role=owner, enabled=true`
  idempotently on every boot, independent of `AUTH_FALLBACK`. `lifecycle.ts:198-217` seeds it and
  boot-fatals on a phantom/empty owner. The owner then logs in via OIDC and the first qualifying login
  binds the subject (§7). deny only disables the ambient fallback arm; it never touches the seed or the
  OIDC login path. Confirmed orthogonal.
- **single-user public bind is gated + warned.** `env.ts:505` boot-fatals `single-user + deny` (leaves no
  credential). A `single-user` + public bind emits the standing SECURITY warning at `lifecycle.ts:530`
  ("this box has NO login … any caller that reaches it … is the OWNER"). It is intentionally exempt from
  the boot-guard (it has no other door) and is reachable only in a config the guard is not meant to catch
  (single-user has no SSO to bypass). Adequate: warned, not silent.

## 6. SSO graduation + owner takeover (brief Q7) — SOUND (files untouched by the diff)

`provision-identity.ts`, `substrate/role-policy.ts`, `admin/verbs/link-sso-identity.ts` are all absent
from `diff main...HEAD`. The peer-IP/deny changes are orthogonal to OIDC provisioning. Verified:

- **Graduation survives deny.** `tryAdoptUnboundOwner` (`provision-identity.ts:195-212`) runs on the OIDC
  login → `provisionIdentity` path (`auth-routes.ts:642`), NOT the loopback fallback. With
  `oidc + AUTH_FALLBACK=deny`, a first qualifying SSO login still adopts the unbound seeded owner row
  (binds `externalId`, keeps `role=owner`). The two paths never intersect. Removing the fallback did not
  sever it.
- **Adoption is gated on the OWNER CLAIM, not first-to-arrive.** `tryAdoptUnboundOwner` requires
  `identity.externalId !== null && ownerId !== undefined && isOwnerByPolicy(handle, groups)`
  (`:201`). `isOwnerByPolicy` (`role-policy.ts:93`) = `OWNER_GROUP` membership OR handle ∈ `OWNER_HANDLES`.
  A non-owner SSO identity can NEVER win adoption — it falls through to the non-owner tail
  (`resolveNonOwnerProvision`), where `denyOnCollision` (`:321`) hard-denies a handle/email collision
  (no auto-link — the W1 takeover refusal) and `reconcileOwnerSingleton` (`:237`) downgrades any
  policy-second-owner to `user`. No "first login wins the owner row" race exists.
- **No re-unbind race.** `seedOwner` sets only `role`/`enabled`/(first-boot)`password` and never touches
  `externalId` (`seed-owner.ts:110-113`), so a bound owner row stays bound across reboots; the row is
  unbound only pre-first-SSO-login. Even then, adoption needs the owner claim.
- **admin-can't-link-owner intact.** `link-sso-identity.ts:38` refuses `target.role === OWNER_ROLE`
  ("choosing the owner's subject here would be box takeover"). Untouched by the diff. Checked
  `setRole`/`create-user` paths for owner-target leaks via `linkSsoIdentity`'s injected `linkExternalId`
  (the single externalId writer, bind-once) — no new binding path. The one trust assumption (unchanged by
  this branch): `OWNER_HANDLES` is trusted env; if it names a handle an attacker can register at the IdP
  and `OWNER_GROUP` is unset, the attacker could claim owner on first login. That is the existing
  documented model, not a regression.

## 7. CSP for OIDC-on-LAN (brief Q8) — SOUND, no change needed

The OIDC flow is entirely **server-mediated top-level navigation + server-side token exchange**:

- `GET /api/auth/oidc/login` → `c.redirect(url.href, 302)` to the IdP authorize endpoint
  (`auth-routes.ts:590`) — a top-level browser navigation, not a fetch/form-POST/iframe.
- IdP → `GET /api/auth/oidc/callback` (top-level nav), then `c.redirect("/", 302)` (`:659`).
- The code→token exchange (`exchangeCodeForClaims` → openid-client) runs in the **node process**, not the
  browser (`:627`). JWKS fetch is server-side too.
- Back-channel logout is server-to-server IdP→app (`:674`), no browser involvement.

The browser therefore makes NO `fetch`/XHR/WebSocket to the IdP, mounts no IdP iframe, and submits no
form to the IdP. So `connect-src`, `frame-src`, and `form-action` do NOT need the Authentik origin. And
every CSP directive in `security-headers.ts:97-118` is `'self'`-based (`defaultSrc`/`scriptSrc`/
`connectSrc`/`formAction`/`frameSrc`/`baseUri` all `['self']`; `objectSrc`/`frameAncestors` `['none']`) —
**origin-agnostic**, so the LAN/prod origin `orbweaver.inktomi.tech` works unchanged with no hardcoded
origin to violate. `strictTransportSecurity:false` is deliberate for plain-http LAN (`:120`). The vite dev
CSP (`packages/client/vite.config.ts`) is dev-only and does not govern the prod/LAN document.

**CSP is correct as-is for the server-mediated redirect flow; the diff correctly omitted any CSP change.**
Watch-item only (not a finding): if a future front-channel logout iframe or a browser-side silent-refresh
to the IdP is ever added, `frame-src`/`connect-src` would then need the Authentik origin.

---

## Summary of required action

1. **P1 (fix before merge):** `entry/http/import.ts:65` — change `principal.via === "cookie"` to
   `principal.via !== "header"`, matching the sibling `authCsrfGuard`. Add a `via:"fallback"` + no-header
   → 403 regression test on `/api/import/bundle` (the sibling suites are the template).
2. **P2 (hardening, non-blocking):** consider a standing SECURITY boot-WARN for
   `AUTH_MODE!=="single-user" && AUTH_FALLBACK==="owner" && !break-glass` regardless of `NODE_ENV`, to
   cover a mislaunched prod box that never set `NODE_ENV=production`.
3. **P2 (doc, non-blocking):** the break-glass recovery procedure (`seam.ts` docblock +
   `containerize-prod-image-spec.md §4`) should instruct the operator to stop/bypass the front proxy and
   hit node directly on loopback while break-glass is active.

Security-relevant assumptions stated for checking: (a) `getConnInfo().remote.address` returns the true
kernel socket peer under the deployed `@hono/node-server` — if a future adapter ever populated it from a
forwarded header, the whole re-gate collapses (worth a standing test); (b) the app mounts no CORS
middleware anywhere (verified on this tree) — the tRPC preflight argument depends on it; (c) `OWNER_HANDLES`
is trusted env not attacker-registrable at the IdP absent `OWNER_GROUP` (existing model).
