# FINAL — Auth Modes & Onboarding

**Status:** The server-side auth robustness + provider-agnostic tier **LANDED + committed** (`eb5d6b3`,
ratified as **D65** in the ledger + `Spine-Identity-and-Auth.md` §2) — the full as-built + the complete
config surface is in **§6**, and it was adversarially verified (no bypass, mutation-proven). What "next-up"
now means is the **CLIENT auth feature + the multi-human TRANSPORT wiring** — the wave in **§7**.
**Source:** frontier stickler review of `packages/server/src/infra/auth/**` + `entry/auth|http|boot/**` +
`domain/sessions/**`, cross-referenced against SillyTavern `default/config.yaml`, neo-tavern's dropped
`features/auth/**`, and OpenWebUI's OIDC group/role model. The local-OIDC redirect-allowlist + owner-fallback
design is neo-derived (§6). The remaining gaps in §7 are "built but not wired to a reachable client/transport
surface," not logic bugs.

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
| **forward-header** | signed JWT+JWKS (fail-closed) OR unsigned trusted headers → `provisionIdentity`. Unsigned path now gates on the **TCP peer IP** (D65), configurable header names + generic `X-Forwarded-User`. | none (per-request) | first proxied req whose handle ∈ OWNER_HANDLES | implicit | N/A (proxy is the UI) | ✅ works |
| **oidc** | `/api/auth/oidc/login` → **per-request `deriveRedirectUri` + `OIDC_REDIRECT_URIS` allowlist** (works at FQDN AND LAN-IP/localhost — D65) → PKCE+state+nonce → IdP → callback → cookie. **Provider-agnostic** claims/scopes + group→role. GC reaps abandoned txns. | cookie | first SSO login matching owner policy (group→role, JIT) | implicit | **STUB** (client never calls `/oidc/login`) | ❌ **client-dead** |

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
  concept). **RULED (§9) + the group→role model is BUILT (§6, D65); only the `multiHumanCapable` gating-axis
  wiring + the `LOCAL_MULTI_USER` AppSettings toggle remain (§7 P1).**
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

## 6. LANDED this session (server robustness + provider-agnostic + D65) — committed `eb5d6b3`

All server-side, adversarially verified (no bypass, mutation-proven), non-breaking defaults (authentik
values are the defaults everywhere). Ratified as **D65** (`Core-Path-Registry-D65.md`, extends D17).

**Forward-header PEER-IP anti-spoof (fully closed):** the unsigned trusted-header gate now matches the raw
TCP **peer socket address** (`ingress.peerIp` → `getConnInfo().remote.address`, threaded
`entry/app.ts` → `entry/auth/seam.ts` → `ResolveDeps.peerIp` → `forward-header.ts`), NOT the spoofable
`X-Forwarded-For`; `clientIpFromHeaders` deleted. Fails closed when `FORWARD_AUTH_TRUSTED_PROXIES` is empty
(+ boot warning). Signed authentik+JWT path never touches the peer gate. Header names configurable +
generic `X-Forwarded-User`/`X-Forwarded-Groups` + email header (below). Mutation-proven: a forged XFF from
an off-allowlist peer is rejected before `provisionIdentity`.

**Local-OIDC (neo-derived redirect allowlist):** `OIDC_REDIRECT_URIS` is a real CSV allowlist again (the
interim singular rename was reverted). `deriveRedirectUri(headers, allowlist)` builds `${proto}://${host}/api/auth/oidc/callback` per request from `X-Forwarded-Proto` (defaults `https`, **never downgrades** —
CVE-2024-52289) + Host, exact-matches the allowlist, off-list → **400 before any IdP touch / no tx minted**;
the VALIDATED uri is stored in the PKCE tx + reconstructed for the token exchange. Result: OIDC works at the
public FQDN AND at LAN-IP/localhost (add each callback URL to the allowlist). The origin-gated owner-fallback
(`dispatch.ts` `isLocalOrigin` — raw Host never `X-Forwarded-Host`, private ranges) already coexists: OIDC
cookie > owner-fallback (local origin only).

**Provider-agnostic OIDC claims/scopes:** `identityFromClaims` reads configurable claim names via
`OidcClaimMap`; nested dot-path claims resolve (`user.memberOf` for Entra/AD FS). Non-authentik IdPs
(Okta/Azure/Keycloak) map by setting the claim vars.

**Group→role (D65 — admin grantable via IdP group):** `role-policy.ts` derives `admin` from
`OIDC_ADMIN_GROUPS`; `OIDC_ALLOWED_GROUPS` is a **fail-closed login gate** (in none → deny → 401, no JIT row).
Roles **re-derive every login** when group governance is active (else legacy `setRole` grants survive).
`ProvisionResult` is a `provisioned | denied` union. **Owner invariant:** the owner row (matched by
`existing.id === selectOwnerUserId()`, not a role literal) is never group-derived, gated, or downgraded;
single-owner triple-enforcement intact. JIT user creation on first OIDC login.

**Email (additive attribute):** nullable `users.email` + `ResolvedIdentity.email`, read from
`OIDC_EMAIL_CLAIM` / `FORWARD_AUTH_EMAIL_HEADER`, persisted keep-on-null. **Never an identity/join key** —
identity stays keyed on `users.id` + `externalId`. (Baseline squash-regen: `+ email text` only.)

**OIDC transaction GC scheduler (PD-5):** reaps abandoned/expired PKCE transactions on an hourly cadence
(`transport/jobs/oidc-gc-scheduler.ts`, reuses the catalog-refresh scheduler seam, clock-injected, armed
only in oidc mode). Defense-in-depth over the existing consume-time delete.

### 6.1 Config surface (as-built — the full env var list for an operator / the next builder)

ENV (pre-boot / first-time-setup, per the §3 config-surface principle):
- **Core:** `AUTH_MODE` (single-user|local|forward-header|oidc) · `SESSION_SECRET` (≥32ch; local+oidc) ·
  `OWNER_HANDLES` (CSV; the bootstrap owner) · `LOCAL_INITIAL_PASSWORD` (local seed).
- **OIDC:** `OIDC_ISSUER` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_REDIRECT_URIS` (CSV allowlist of
  FULL callback URLs — include LAN-IP/localhost callbacks for local-OIDC) · `OIDC_SCOPES` (default
  `openid profile email`) · `OIDC_USERNAME_CLAIM` (`preferred_username`) · `OIDC_UID_CLAIM` (`sub`) ·
  `OIDC_GROUPS_CLAIM` (`groups`, nested dot-path ok) · `OIDC_EMAIL_CLAIM` (`email`) · `OWNER_GROUP` (owner) ·
  `OIDC_ADMIN_GROUPS` (CSV → admin) · `OIDC_ALLOWED_GROUPS` (CSV login gate; unset → all authed allowed).
- **forward-header:** `FORWARD_AUTH_TRUSTED_PROXIES` (CSV/CIDR of allowed PEER IPs — REQUIRED for the unsigned
  path, else fail-closed) · `FORWARD_AUTH_USER_HEADER`/`GROUPS_HEADER`/`UID_HEADER`/`EMAIL_HEADER` (header
  names) · `FORWARD_AUTH_VERIFY_JWT` (default true; the signed authentik path).
- **local-origin trust (shared by owner-fallback + local-OIDC):** `TRUSTED_LOCAL_HOSTS` (CSV hostnames) ·
  `TRUSTED_PRIVATE_RANGES` (CSV CIDR, on top of the built-in 127/8·10/8·172.16/12·192.168/16·100.64/10 CGNAT
  + IPv6 loopback/ULA/link-local) · `AUTH_FALLBACK` (owner|deny).

AppSettings (runtime toggles — the wave adds these, NOT env): `LOCAL_MULTI_USER` (the multi-human gate, §7
P1) · discreet-login (§7 P2).

## 7. THE GAME PLAN — the remaining wave (ranked)

The server auth tier is DONE (§6). This wave is purely **client + transport + the one gating knob** — no
new auth crypto/claims/session work. B1 (peer-IP), B2 (provider-agnostic), B3 (allowlist), email, and the
group→role model all LANDED in §6; what remains below is reachability.

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

## 10. Build notes for the next agent (gotchas that cost real time)

- **Test-infra (both bit the D65 green-up — see the `boot-lifecycle-int-test-gotchas` memory):**
  (a) The SSRF egress firewall is installed at boot and firewalls the **test process's own global `fetch`** —
  any int test that boots the real lifecycle and polls its server over localhost needs
  `vi.stubEnv("EGRESS_ALLOWLIST", "localhost")` (do NOT disable the firewall). (b) Any unit test driving
  `createApp` via `app.fetch(req)` must pass a **conninfo env** (`{ incoming: { socket: { remoteAddress,
  remotePort, remoteFamily } } }`) or `getConnInfo` throws and every request 500s (the peer-IP read).
- **The client can't talk tRPC before auth** — that's WHY the P0 `/api/auth/config` + `/api/auth/me` are
  raw Hono (pre-tRPC): `sessions.me` is an authed procedure that 401s when logged out, so the client can't
  discover its mode or auth state through tRPC. Build the two Hono endpoints FIRST; the client login UI
  bootstraps off `/config`.
- **`/me` must resolve through the SAME `entry/auth/seam.ts` resolver** the tRPC context uses — a second
  resolution path is how server/client identity drift creeps in (the same class of bug D65's parity work
  killed on the macro side).
- **The gating axis (P1) depends on a runtime AppSetting**, so it can NOT be a frozen boot-time constant like
  today's `singleUserMode` (`entry/app.ts:191`). Resolve `multiHumanCapable` per-request (or reactively off
  the AppSettings read). The group→role model it composes with is already built (§6) — do not rebuild it.
- **neo reference files** (borrow the shapes, don't cargo-cult): `neo-tavern/src/server/http/auth-meta.ts`
  (the `/config` + `/me` pattern) + `neo-tavern/src/client/features/auth/surfaces/*` (the 10 per-mode login
  surfaces + dispatcher + route guard). orb's server foundation is BETTER (§8) — this is a client + wiring
  port, not a server rewrite.
