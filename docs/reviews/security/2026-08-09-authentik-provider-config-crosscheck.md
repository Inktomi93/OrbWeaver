---
kind: review
status: active
updated: 2026-08-14
---

# Authentik OIDC provider config crosscheck (READ-ONLY)

Ground truth is the **live discovery doc**, captured this session:
`curl -s https://authentik.inktomi.tech/application/o/orbweaver/.well-known/openid-configuration`
and `…/jwks/`. No auth code was changed. Where a value lives in the *deployed env* (not in the repo) I
cannot read it from here and say so explicitly — those are VERIFY items, not confirmed OKs.

No live SSO round-trip was possible from here (an interactive login can't be driven), so the two claims
that need a real token — `sub` stability and whether the `groups`/`sub` claims actually ride the token —
are in the FLOORS section, each narrowed to the exact Authentik setting that decides them.

---

## Owner action items (do these first)

1. **\[HIGH · verify OURS]** Confirm the deployed `OIDC_ISSUER` is EXACTLY
   `https://authentik.inktomi.tech/application/o/orbweaver/` — **with the trailing slash**. openid-client's
   `discovery()` (oauth4webapi 3.8.6) does a strict string compare of the discovered `issuer` against the
   URL you configure; a missing slash makes `discovery()` throw at first login and every OIDC login 400s.
2. **\[HIGH · verify BOTH sides]** Confirm `https://orbweaver.inktomi.tech/api/auth/oidc/callback` is in
   **our** `OIDC_REDIRECT_URIS` (exact-match, comma-list) **and** in the **Authentik** provider's Redirect
   URIs. Both gates are exact-match; a mismatch on either side fails the flow.
3. **\[verify AUTHENTIK]** Provider → Advanced protocol settings: (a) a **Signing Key is selected** — it is,
   the JWKS serves an RS256 `use:sig` key today; do NOT clear it or A5 + id\_token validation break; and
   (b) **Subject mode = "Based on the User's hashed ID"** (the stable default) — this closes the #53 open
   item; if it's set to username/email, rename-safety and the bind-once model break.
4. **\[verify AUTHENTIK]** Confirm the Authentik `profile` scope mapping actually emits **`groups`**. We
   request `openid profile email` and read groups from the `profile`-carried `groups` claim; if the mapping
   omits it, `OIDC_ADMIN_GROUPS` / `OWNER_GROUP` / `OIDC_ALLOWED_GROUPS` all silently see `[]`.
5. **\[AUTHENTIK · only if enabling A5]** If you set `OIDC_BACKCHANNEL_LOGOUT=on`, register the provider's
   back-channel logout URI = `https://orbweaver.inktomi.tech/api/auth/oidc/backchannel-logout`, and confirm
   the logout\_token carries **`sub`** (not sid-only) — a sid-only token is a validated no-op for us.
6. **\[OURS · optional papercut]** Logout today drops the user on Authentik's generic logout-confirm page
   with no return path (we hold no id\_token to pass as `id_token_hint`). Decide if that's acceptable; the
   seamless fix is a design change (store the id\_token), not a config tweak. See Q4.

Nothing below is a live security hole. The items are correctness/config-drift risks and one UX papercut.

---

## Endpoint crosscheck — live discovery vs owner-provided vs our code

All owner-provided URLs match the live discovery doc byte-for-byte:

| Field (discovery) | Live value | Matches owner doc | How WE consume it |
| - | - | - | - |
| `issuer` | `https://authentik.inktomi.tech/application/o/orbweaver/` (trailing slash) | yes | `OIDC_ISSUER` env → `discovery(new URL(OIDC_ISSUER), …)` (`entry/lifecycle.ts:399-400,428`) |
| `authorization_endpoint` | `…/application/o/authorize/` | yes | discovered, not configured by us |
| `token_endpoint` | `…/application/o/token/` | yes | discovered |
| `userinfo_endpoint` | `…/application/o/userinfo/` | yes | discovered (we read claims from the ID token, `tokens.claims()`, `auth-routes.ts:123`) |
| `end_session_endpoint` | `…/application/o/orbweaver/end-session/` | yes | `serverMetadata().end_session_endpoint` (`auth-routes.ts:161`) |
| `jwks_uri` | `…/application/o/orbweaver/jwks/` | yes | `serverMetadata().jwks_uri` for A5 (`auth-routes.ts:557-559`); openid-client uses it for the code-exchange sig too |
| `id_token_signing_alg_values_supported` | `["RS256"]` | — | asymmetric (see Q3) |
| `scopes_supported` | `["openid","email","profile"]` | — | we request `openid profile email` (Q6) |
| `code_challenge_methods_supported` | `["plain","S256"]` | — | we pin `S256` unconditionally (Q9) |
| `backchannel_logout_supported` / `_session_supported` | `true` / `true` | yes | A5 (Q5) |

JWKS: one key, `kty:RSA`, `alg:RS256`, `use:sig`, `kid:3aad3a0a…` — i.e. a Signing Key **is** selected on
the provider and asymmetric verification is live.

---

## The nine questions — verdict + receipt

### Q1 · Issuer match — VERIFY-OURS (HIGH)

Discovery `issuer` = `https://authentik.inktomi.tech/application/o/orbweaver/` (trailing slash). We build
the config with `discovery(new URL(env.OIDC_ISSUER), clientId, clientSecret)`
(`entry/lifecycle.ts:399-400,428`). We do **not** hand-validate `iss` — openid-client v6.8.4 /
oauth4webapi 3.8.6 does it for us: `discovery()` compares the discovered `issuer` against the URL you pass
(strict `.href` string compare), and `authorizationCodeGrant()` (`auth-routes.ts:118-122`) validates the
`iss` claim on every exchange against that same discovered issuer.

**Consequence of a slash mismatch:** if the deployed `OIDC_ISSUER` omits the trailing slash,
`new URL(...).href` yields the no-slash form, oauth4webapi's discovery sees `discovered.issuer !==
expected.href`, throws, `getConfig()` throws, and the callback converts it to a fail-closed
`token_exchange_failed` — **every** login fails. This is the single highest-value thing to confirm because
it's invisible until someone tries to log in. I cannot read the deployed env value from here → **verify it
equals the discovery `issuer` string exactly.** No code defect; the code is correct.

### Q2 · Redirect URI — VERIFY BOTH SIDES (HIGH)

Our side gates exact-match against `OIDC_REDIRECT_URIS` (`auth-routes.ts:424-434`, `deriveRedirectUri`):
the callback URL is derived per-request from `X-Forwarded-Proto`/`-Host` (proto defaults to `https`,
never downgraded) and accepted **only** on exact membership in the comma-list; off-list ⇒ 400 +
`securityEvent("oidc_redirect_uri_rejected")`, no transaction minted (`auth-routes.ts:439-451`). The
validated URI is stored in the txn and reused at exchange so it matches what the IdP saw behind the proxy.

Both `OIDC_REDIRECT_URIS` (our deployed env) and the Authentik provider Redirect URIs are runtime config I
can't read here. **Verify `https://orbweaver.inktomi.tech/api/auth/oidc/callback` is present, exact, in
both.** Code is correct.

### Q3 · Signing — OK (do not regress)

Discovery advertises **RS256 only** and the JWKS serves an RSA `use:sig` key → a Signing Key is selected;
tokens are signed **asymmetrically** and JWKS-verifiable. This is exactly what our verification assumes:

- id\_token / code-exchange: openid-client verifies against the discovered JWKS.
- A5 back-channel logout: `createBackchannelLogoutVerifier` pins asymmetric algs `["RS256","ES256"]` and
  verifies against the issuer JWKS (`infra/auth/backchannel.ts:24,72,79`); jose also blocks `alg:none` and
  key-class confusion.

**Verdict OK.** One-line warning for the owner: if the provider's Signing Key is ever cleared, Authentik
falls back to symmetric (HS256 over the client secret), the JWKS empties, and **both** id\_token validation
and A5 break — our code will (correctly) fail closed, not fall open. Keep the Signing Key selected.

### Q4 · End-session (A6) — OK for logout, PARTIAL for UX (ADJUST-OURS, optional)

We drive RP-initiated logout off the discovered `end_session_endpoint`: `POST /api/auth/logout` returns
`{ endSessionUrl }` from `serverMetadata().end_session_endpoint` (`auth-routes.ts:161,404`) and the client
navigates there after the local revoke (`account-surface.tsx:23-24` → `endSessionUrl ?? "/login"`). The URL
resolves to the exact `…/orbweaver/end-session/` discovery value.

**We pass NO params** — no `id_token_hint`, no `post_logout_redirect_uri`. Effect: the local session is
already dead (cookie cleared + row revoked), and the user lands on Authentik's *generic logout-confirm
page* with no automatic return to orbweaver. That ends the upstream SSO session (after the click), so the
"sign out → Continue → instantly back in" bug is fixed — but it's not seamless.

Why we can't just add the params: a clean redirect-back needs `id_token_hint` so Authentik can associate
the request with this client and honor `post_logout_redirect_uri`. **We deliberately don't retain the
id\_token** (DB-backed BFF sessions; tokens are discarded after `tokens.claims()`), so we have no hint to
pass. Making logout seamless is a *design change* (persist the id\_token in/beside the session row to pass as
hint, then register the post-logout redirect on Authentik) — not a config tweak. **Verdict: OK as a
security/logout matter; ADJUST-OURS only if the papercut is worth the id\_token-retention change.** If pursued
it also needs an ADJUST-AUTHENTIK: register `https://orbweaver.inktomi.tech/login` (or wherever) as a
post-logout redirect URI on the provider.

### Q5 · Back-channel logout (A5) — OK (code), ADJUST-AUTHENTIK (register URI + confirm `sub`)

Endpoint `POST /api/auth/oidc/backchannel-logout` is registered only when `OIDC_BACKCHANNEL_LOGOUT=on`
(`auth-routes.ts:537-539`, `lifecycle.ts:434`). Validation (`infra/auth/backchannel.ts`) matches the OIDC
BCL 1.0 §2.4 checklist and what Authentik sends: signature vs issuer JWKS with pinned asymmetric alg
(`:79`), `iss` + `aud`==our client\_id (jose, `:79`), `iat` present (`:97`), the `backchannel-logout` event
member in `events` (`:48-54,101`), **no `nonce`** (`:89`), and `sub`-or-`sid` present (`:57-65,109`). Any
violation ⇒ null ⇒ 400, with a `securityEvent` naming the reason. No Redis, idempotent (a re-delivered
token just re-revokes).

**sid-only is still a validated no-op** (`auth-routes.ts:567-573`): we revoke by `revokeByExternalId(sub)`
because sessions key on `external_id == sub` and we store no per-session IdP `sid`. This is correct and
acceptable **iff Authentik includes `sub` in the logout\_token**. `backchannel_logout_session_supported:
true` tells us it sends `sid`; it does not, by itself, tell us it sends `sub`. If the provider is configured
to send sid-only, A5 validates the token and revokes nothing.

**ADJUST-AUTHENTIK (only if enabling):** set the provider's back-channel logout URI to our endpoint, and
confirm the emitted logout\_token carries `sub`. **Code verdict OK.**

### Q6 · Scopes — OK (verify the groups mapping)

We request `OIDC_SCOPES` default `"openid profile email"` (`env/index.ts:379`). Discovery
`scopes_supported` = `["openid","email","profile"]` — all three available. We do **not** request
`offline_access`, and correctly so: sessions are HttpOnly DB-backed BFF rows re-validated every request
(`validate` re-checks revoked/expired/`enabled`), so we rely on **no** refresh token. Requesting
`offline_access` would be needless token surface. **Verdict OK — do not add `offline_access`.**

Groups: we read them from the `groups` claim (default `OIDC_GROUPS_CLAIM=groups`, `env/index.ts:382`),
which in Authentik rides the **`profile`** scope. Discovery `claims_supported` lists `groups`, but that's a
capability advertisement, not a guarantee the `profile` mapping emits it for this provider. **Verify the
Authentik `profile` scope mapping includes `groups`** (owner action #4). A4 tolerance is in place: a
`;`-joined string is split (`normalizeGroups`, `auth-routes.ts:582-593`; `OIDC_GROUPS_SEPARATOR` default
`;`), so a property mapping emitting a joined string no longer silently yields `[]`.

### Q7 · `email_verified` = False default (2025.10) — OK (we never read it)

Two independent sweeps: `grep -rn "email_verified\|emailVerified" packages/ --include=*.ts --include=*.tsx`
returns **zero** hits. We bind identity on `sub` (→ `externalId`), and `users.email` carries no UNIQUE and
is never an identity/join key (schema decision cited in the prior study, `db/src/schema/users.ts:41-44`).
`identityFromClaims` reads only username/uid/groups/email as attributes (`auth-routes.ts:631-654`);
provisioning does not gate on `email_verified`. Authentik's new `email_verified=False` default therefore
**cannot break our login** — we ignore the claim entirely. **Verdict OK, explicitly.**

### Q8 · `sub` stability — FLOOR, narrowed (verify AUTHENTIK subject mode)

We assume `sub` is the stable, rename-surviving user id (`OIDC_UID_CLAIM=sub`, `env/index.ts:381`), and the
whole bind-once model rests on it (`isSubjectMismatch`). Discovery gives `subject_types_supported: ["public"]` and `claims_supported` includes `sub` — but "public" is about *cross-client* sameness, not
*stability across rename*, so **discovery alone cannot close #53.** The deciding factor is the Authentik
provider's **Subject mode**:

- "Based on the User's hashed ID" (default) or "…UUID" ⇒ stable across username/email changes ⇒ our model
  holds.
- "Based on the User's username" or "…email" ⇒ `sub` changes on rename ⇒ a renamed user's next login
  presents a new subject; our bind-once guard then treats it as a *different* identity landing on the old
  handle → **denied** (the documented rename-window behavior), and the old row is orphaned.

**Action:** confirm Subject mode = "Based on the User's hashed ID" in the provider's Advanced protocol
settings (owner action #3b). A live login inspecting the raw `sub` shape (a 32+ char hex hash vs a
username) would also confirm it — see FLOORS.

### Q9 · PKCE — OK

Discovery `code_challenge_methods_supported` includes `S256`. We use PKCE **unconditionally**: fresh
`randomPKCECodeVerifier` + `calculatePKCECodeChallenge`, sent with `code_challenge_method=S256`
(`auth-routes.ts:41,453-454,471`), and `authorizationCodeGrant` verifies the verifier on exchange
(`:118-122`). No knob, no plain fallback. **Verdict OK — nothing to add.**

---

## Two-sided punch-list (summary)

**ADJUST-OURS (env / deployment — no code change needed):**

- Verify `OIDC_ISSUER` == `https://authentik.inktomi.tech/application/o/orbweaver/` incl. trailing slash \[Q1, HIGH].
- Verify `OIDC_REDIRECT_URIS` contains `https://orbweaver.inktomi.tech/api/auth/oidc/callback` exactly \[Q2, HIGH].
- Confirm `OIDC_SCOPES` unchanged from `openid profile email` (do not add `offline_access`) \[Q6].
- If enabling A5: set `OIDC_BACKCHANNEL_LOGOUT=on` \[Q5].

**ADJUST-OURS (code — optional, only if pursued):**

- Seamless logout return needs id\_token retention to pass `id_token_hint`+`post_logout_redirect_uri` \[Q4].
  This is a design change; today's behavior is correct-but-not-seamless. *Report only — no code changed.*

**ADJUST-AUTHENTIK (provider settings in the admin UI):**

- Keep a **Signing Key** selected (currently is) \[Q3].
- Set **Subject mode = "Based on the User's hashed ID"** \[Q8].
- Confirm the **`profile` scope mapping emits `groups`** \[Q6].
- Add the Authentik provider Redirect URI `https://orbweaver.inktomi.tech/api/auth/oidc/callback` \[Q2].
- If enabling A5: set the **back-channel logout URI** to our endpoint and confirm the logout\_token carries
  `sub` \[Q5].
- If pursuing seamless logout (Q4): register a **post-logout redirect URI**.

**OK — confirmed correct, no change:**

- Endpoint set matches discovery exactly (all six URLs).
- Asymmetric RS256 signing, JWKS-verifiable; our verifier pins asymmetric algs \[Q3].
- `end_session_endpoint` driven off discovery \[Q4, security aspect].
- A5 validation matches OIDC BCL §2.4 and Authentik's shape; sid-only no-op is intentional \[Q5].
- We never read `email_verified` → the 2025.10 default cannot break login \[Q7].
- PKCE S256 unconditional \[Q9].
- No `offline_access` requested; DB-backed sessions don't need refresh tokens \[Q6].

---

## FLOORS — what needs a live test-login to confirm (I could not do these from here)

1. **`sub` stability across a rename (#53).** Discovery can't show it; it's the provider Subject-mode
   setting (Q8). A definitive close is: log in, read the raw `sub` from the ID token (or the `users.external_id`
   row it lands in), rename that user in Authentik, log in again, and confirm the same `sub` and the same
   `users` row. I confirmed only the *capability* (claim present, subject type public), not the *behavior*.
2. **Whether `groups` actually arrives on the token.** `claims_supported` lists it; whether the `profile`
   mapping emits it for a real user needs one login's decoded claims (Q6). Until then, `OIDC_ADMIN_GROUPS`/
   `OWNER_GROUP`/`OIDC_ALLOWED_GROUPS` behavior is unverified end-to-end.
3. **Whether the A5 logout\_token carries `sub`.** `backchannel_logout_session_supported:true` proves `sid`;
   only a real IdP-initiated logout (or the provider's logout-token config) shows if `sub` is included (Q5).
4. **No interactive SSO flow was driven.** Every sequencing claim above is read off source + the live
   discovery/JWKS docs; the code-exchange, PKCE verification, and nonce/state binding are asserted by
   openid-client and by our tests, not exercised against the real Authentik here.
5. **Deployed env values** (`OIDC_ISSUER`, `OIDC_REDIRECT_URIS`, `OIDC_CLIENT_ID/SECRET`, the A1/A2/A5
   toggles) are runtime config, not in the repo — Q1/Q2 are VERIFY items for exactly this reason.

---

## No code defects found

I looked specifically for the "iss validated without the trailing slash" class of bug. There is none: we
delegate `iss` validation to openid-client/oauth4webapi (Q1), which does the strict compare correctly; the
only trailing-slash risk is in the *env value*, not the code. The bind-once guard, fail-closed gates, PKCE,
JWKS pinning, and the A5 checklist are all correct as written. Nothing in this pass warrants a code lane —
the deliverables are the env/provider verifications above.
