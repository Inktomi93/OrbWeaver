# FINAL — Auth Modes & Onboarding (the next wave)

**Status:** NEXT-UP build spec. Server-side hardening + provider-agnostic tier is being fixed
**this session** (see §6); the client-auth + multi-human-transport wave in §7 is the outstanding work.
**Source:** frontier stickler review of `packages/server/src/infra/auth/**` + `entry/auth|http|boot/**` +
`domain/sessions/**`, cross-referenced against SillyTavern `default/config.yaml` and neo-tavern's dropped
`features/auth/**`. 195 auth tests pass; the gaps below are almost entirely "built but not wired to a
reachable surface," not logic bugs.

---

## 1. Verdict

The **server-side** auth foundation is excellent and BETTER than neo/ST — keep it (§8). The problem is
entirely at the edges: two of four modes have **no client login UI and no public bootstrap endpoint**, and
**multi-human group chat is unreachable in every mode** because the membership domain is bound to zero
transport procedures. "Four modes in lockstep + comprehensive" is a real build wave, not a patch.

## 2. The four modes (as-built)

`AUTH_MODES = ["single-user","local","forward-header","oidc"]` (`packages/contracts/src/identity/index.ts:65`).
`cookie-session.ts` is shared session infra, not a mode. Identity resolves ONCE at `entry/auth/seam.ts` into
an immutable `Principal` (the D40 verify→resolve→mint tier split is real and clean). Owner is a single row
enforced three-deep (env superRefine, `reconcileOwnerSingleton`, `users_single_owner_unique` index).

| Mode | Auth flow | Session | First owner | Multi-user | Client login UI | End-to-end? |
|---|---|---|---|---|---|---|
| **single-user** | resolver → null → unconditional owner fallback. No login. | none | boot `seedOwner` backfills owner | N/A (one human) | N/A | ✅ works |
| **local** | password form → `sessions.authenticate` (scrypt+pepper+dummy-hash) → cookie | cookie, 30d slide | `seedOwner` + `LOCAL_INITIAL_PASSWORD` | server-complete (`admin.createUser`) | **STUB** ("auth isn't wired yet") | ❌ **client-dead** |
| **forward-header** | signed JWT+JWKS (fail-closed) OR unsigned trusted headers → `provisionIdentity` | none (per-request) | first proxied req whose handle ∈ OWNER_HANDLES | implicit | N/A (proxy is the UI) | ✅ works (⚠ B1) |
| **oidc** | `/api/auth/oidc/login` → PKCE+state+nonce → IdP → callback → cookie. GC reaps abandoned txns (#62). | cookie | first SSO login matching owner policy | implicit | **STUB** (client never calls `/oidc/login`) | ❌ **client-dead** |

## 3. The owner's vision (target spec)

A single coherent auth SPECTRUM, least→most, each tier a superset of trust below:

1. **single-user** — not auth; one human, no login. Inherently no multi-human group chat.
2. **local** — username/password, **multi-user with discreet login** (each user logs in separately; login
   screen can hide the user list, à la ST `enableDiscreetLogin`). Must support per-user passwords + multiple
   accounts + discreet login.
3. **forward-header (forward proxy)** — a step BELOW oidc, ABOVE plain username/password multi-user: a
   reverse proxy (authentik Proxy-Provider outpost, Authelia, oauth2-proxy, Traefik/nginx `auth_request`)
   authenticates and injects a trusted identity header. **This is what ST does with its Authentik/Authelia
   SSO auto-login.**
4. **oidc** — full SSO (Authentik/Authelia/Okta/Azure/Keycloak/…).

**Neither `forward-header` nor `oidc` may be hardcoded to one provider** — the owner uses Authentik, but the
system must be first-class for anyone's proxy/IdP.

**Group-chat gating rule (owner-RULED 2026-07-10):** the block is on **multi-HUMAN**, NOT on group chat
itself. **Multi-CHARACTER group chat (one human + N AI characters) ALWAYS works — every mode, including local
single-user.** What's gated is inviting/seating additional **humans**: you can't invite a human to a room if
the install isn't set up for multi-user. Gate on **`multiHumanCapable`** (can ≥2 humans authenticate), never
on `mode`/`isGroup`:
- **single-user** → false (one human; multi-character group chat still fine).
- **local** → the **`LOCAL_MULTI_USER` AppSettings toggle** (default OFF → single-human local; flip ON to
  allow human invites).
- **forward-header / oidc** → true.

**Config-surface principle (owner-RULED):** **AppSettings wherever possible.** ENV flags are ONLY for things
that must be set before the server boots, or first-time setup (e.g. `AUTH_MODE`, `SESSION_SECRET`, the OIDC
issuer/client/secret + its claim/scope mapping which is consumed at boot-time discovery, `LOCAL_INITIAL_PASSWORD`).
Runtime-flippable knobs (`LOCAL_MULTI_USER`, discreet-login, etc.) are AppSettings toggles, not env.

## 4. Findings (ranked)

- **B5 — HIGH (completeness): multi-human group chat is unreachable in EVERY mode.** The entire
  invite/roster/kick/host-handoff domain (`domain/chat/verbs/invites.ts` + roster verbs) is built + tested +
  classified in the authority matrix, but bound to **zero** transport procedures. `routers/chat.ts` surfaces
  34 verbs, none a membership verb; no `/join/:token` route, no invites router. So `startChat` always makes a
  single-human room. The notifications inbox IS wired but its sole producer (`createInvite`) is unreachable.
  Tracked as PD-106 (`Tier-4-Transport.md:41`). **This is the single biggest gap — all the group-chat
  identity/memory/crown-jewel work has no way to seat a second human yet.**
- **B6 — HIGH (completeness/NUX): no client auth feature, no public bootstrap endpoint → `local`/`oidc`
  boot to a dead client.** `client/src/routes/login-page.tsx` is a stub; the only identity read is the
  *authed* `sessions.me` (401s when logged out); there's no `/api/auth/config` or `/api/auth/me`. **neo HAD
  all of this** (`http/auth-meta.ts` + 10 `features/auth/surfaces/*`) and orb dropped it (tracked UIP-405 /
  J11).
- **B1 — HIGH (security): forward-header unsigned path has no source-IP gate by default.** The signed path
  only engages when authentik's `x-authentik-jwt` is present, so for every non-authentik proxy the unsigned
  trusted-header path runs with zero source verification — any client that can reach the app socket can
  `curl -H 'Remote-User: owner'` and become owner. ST defaults `trustedProxies` to loopback +
  `enableForwardedWhitelist: true`; orb inverts to opt-in-and-default-empty. **→ fixed this session (§6).**
- **B4 — MEDIUM (vision mismatch): multi-human gated on the wrong axis.** `entry/app.ts:191` derives
  `singleUserMode = AUTH_MODE === 'single-user'`; the owner's rule needs "can ≥2 humans authenticate." The
  called-out case — local + single account = should-block — isn't representable (no `enableUserAccounts` off
  concept). **Needs an owner design ruling (§9) before build.**
- **B2 — MEDIUM (provider-agnostic): OIDC claim mapping + scopes hardcoded to authentik.** Username claim
  `preferred_username`, id `sub`, groups `groups`, scope `openid profile email` all hardcoded
  (`auth-routes.ts:259-267`, `lifecycle.ts:260`). Okta/Azure/Keycloak can't map identity or the owner group.
  `OWNER_GROUP` mapping is configurable; the claim it reads from is not. **→ fixed this session (§6).**
- **B3 — MEDIUM: `OIDC_REDIRECT_URIS` documented as an allowlist but only `[0]` is used**
  (`lifecycle.ts:259` vs `env/index.ts:198`). **→ fixed this session (§6).**
- **forward-header provider gaps:** no email header mapping; fallback order bakes authentik→authelia; a
  generic `X-Forwarded-User`-only proxy isn't auto-detected. **→ fixed this session (§6).**
- **Doc drift:** `auth-routes.ts:22-27` still claims OIDC store/client "not built (PD-5)" — stale. **→ fixed
  this session (§6).**

## 5. First-run / NUX (the fresh-install feel)

Default OOTB: `AUTH_MODE=single-user`. Mode is chosen **env-only** — no setup wizard, no UI mode picker.

- **single-user (default):** boot → owner seeded → open browser → you're the owner. Zero-friction. Good path.
- **local:** set mode + `SESSION_SECRET` + `LOCAL_INITIAL_PASSWORD` (or boot fatal) → browser → `sessions.me`
  401 → **dead stub page. No way to log in.** Adding a 2nd user needs a raw tRPC `admin.createUser` call.
- **forward-header:** set mode + point a proxy at it. Authentik-with-JWT → safe. Any other proxy → works but
  spoofable by default (B1). No UI needed.
- **oidc:** set mode + 5 envs (or boot fatal) → `/oidc/login` works if hit directly, but the client has no
  button → **dead stub page.**

**Headline: two of four modes can't complete a first login through the UI.**

## 6. Fixed THIS session (server hardening + provider-agnostic tier) — LANDED

Server-side, tested (116/116 auth tests), non-breaking defaults (authentik values stay the defaults):
- **B1** — forward-header `resolveUnsignedHeader` now FAILS CLOSED when `forwardTrustedProxies` is empty
  (was silent-trust) + boot warning in `lifecycle.ts`. Signed authentik+JWT path unaffected. Spoof test added.
  **PARTIAL — see the residual in §7 P1:** the gate reads the spoofable leftmost XFF/X-Real-IP header, so even
  with the allowlist set a direct-socket attacker can forge the hop. Full close = gate on the TCP PEER IP
  (`resolveClientIp`/PD-52, `infra/network/ingress.ts`) threaded into the auth resolver → needs transport wiring.
- **B2** — `OIDC_SCOPES`/`OIDC_USERNAME_CLAIM`/`OIDC_UID_CLAIM`/`OIDC_GROUPS_CLAIM` env vars, defaults =
  authentik values; `identityFromClaims` now configurable + exported; wired via `OidcClaimMap` on
  `OidcRoutesDeps`. Azure-shaped claim test passes.
- **B3** — `OIDC_REDIRECT_URIS` → `OIDC_REDIRECT_URI` (singular, honest rename — the plural only ever used
  `[0]`). **BREAKING env change** — a deployment with `OIDC_REDIRECT_URIS` set must update its `.env`.
- **forward-header 4b** — generic `X-Forwarded-User`/`X-Forwarded-Groups` first-class in the unsigned fallback.
- **Doc truthing** — `auth-routes.ts:22-27` stale PD-5 block corrected.
- **4a (email header) NOT built — deferred to the wave (§7):** there is NO email field anywhere in the identity
  pipeline (`ResolvedIdentity`, `users` table, `provisionIdentity`, OIDC all lack it). `FORWARD_AUTH_EMAIL_HEADER`
  would be dead config. Carrying email for real is a cross-tier schema change + a design call: does identity gain
  an email axis?

## 7. THE GAME PLAN — the remaining wave (ranked)

- **P0 — Build the client auth feature.** Port neo's `features/auth/**` shape: per-mode surfaces
  (`login-local` password form, `login-oidc` SSO button → `/api/auth/oidc/login`, `login-forward-header`
  explainer, `login-single-user` passthrough, `login-loading`) + a dispatcher + `account-surface` + a route
  guard. Replace the `login-page.tsx`/`admin-page.tsx` stubs. *Highest leverage — two modes go from dead to
  alive.* Files: `client/src/routes/login-page.tsx`, new `client/src/features/auth/**`, `routes/router.tsx`
  beforeLoad gate.
- **P0 — Public bootstrap endpoints `GET /api/auth/config` + `GET /api/auth/me`** (Hono, pre-tRPC, like neo's
  `auth-meta.ts`). `/config` → `{ mode, requiresLogin, localEnabled, oidcEnabled, defaultHandle }`; `/me` →
  `{ authenticated, handle, role }` through the SAME seam resolver (no drift). The P0 client can't bootstrap
  without these. Files: new `entry/http/auth-meta.ts`, register in `entry/app.ts`.
- **P1 — Cut the transport surface for the multi-human membership verbs** (unblocks group chat — the core
  promise). New invites/roster router surfacing createInvite/previewInvite/redeemInvite/revokeInvite/
  declineInvite/kick/selfLeave/nominateHostHandoff/acceptHostHandoff, all on `multiHumanProcedure`, + a
  `/join/:token` HTTP landing. Domain + authority matrix + notifications inbox are already built + tested —
  **pure wiring** (PD-106). Files: new `routers/invites.ts`, `entry/http` join route, `routers/chat.ts`.
- **P1 — Fix the multi-human gating axis (B4). RULED — ready to build.** Replace `singleUserMode =
  mode==='single-user'` with a derived `multiHumanCapable`: single-user → false; local → the
  **`LOCAL_MULTI_USER` AppSettings toggle** (default OFF); forward-header/oidc → true. Compute it where the
  toggle + mode are both available (it depends on a runtime AppSetting now, not just boot env — so it can't
  be a frozen boot-time constant; resolve it per-request or reactively off the AppSettings read). Gate the
  human-invite/human-seat surface (`multiHumanProcedure` → the P1 membership verbs + `/join`) on it.
  **CRUCIAL: do NOT gate `startChat`/multi-character rooms** — a one-human + N-character group chat must work
  in every mode including local-single-user. The gate is only on seating a SECOND human. Add `LOCAL_MULTI_USER`
  as an AppSettings toggle (per the config-surface principle — NOT an env var). Files: `entry/app.ts:191`
  (stop deriving from env alone), `transport/trpc/{context,trpc}.ts`, the AppSettings schema.
- **P2 — Discreet login (local).** Once the login UI exists, add ST's `enableDiscreetLogin` equivalent: a
  blank username+password form (no user-list enumeration). Pairs with the `/api/auth/config` flag.
- **P3 — First-run setup experience.** A `/api/auth/config`-driven "you're in X mode; here's how to add
  users / configure SSO" panel beats env-only. Optional: guided owner-password-set on first local boot
  instead of `LOCAL_INITIAL_PASSWORD` (removes a boot-fatal footgun). Out-polishes neo.

## 8. Keep — already better than neo/ST (do NOT rebuild)

scrypt N=2^15 + per-user salt + SESSION_SECRET HMAC pepper + constant-time dummy-hash burn (kills username
enumeration — ST has none); the D40 verify/resolve/mint tier split (neo's "validate threw the id away" bug is
structurally impossible); single-owner triple-enforcement; origin-gated owner fallback (SSO on the FQDN +
owner on the raw LAN IP, safe by construction); fail-closed JWT/JWKS (5 ways); the `__agent__`
reserved-namespace refusal.

## 9. Owner rulings (2026-07-10) — P1 is unblocked

1. **`LOCAL_MULTI_USER` = AppSettings toggle** (runtime-flippable), NOT an env var. Governing principle:
   **AppSettings wherever possible; ENV only for pre-boot / first-time-setup.**
2. **The block is static/config-based** — "the `LOCAL_MULTI_USER` setting is off," not a live account count.
   Default OFF: a fresh local install is single-human until the owner flips the toggle.
3. **The block is on multi-HUMAN only.** Multi-CHARACTER group chat (one human + N characters) works in EVERY
   mode including local-single-user — do NOT gate `startChat`/multi-character rooms. Gate only the
   human-invite / human-seat surface (`multiHumanProcedure` → the P1 membership verbs + `/join`).
