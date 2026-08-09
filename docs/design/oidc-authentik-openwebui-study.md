---
kind: design
status: draft
owner-review: REQUIRED (forks in §5)
updated: 2026-08-09
---

# OIDC / Authentik: the Open WebUI integration, read against ours

> COMPARATIVE STUDY. No product code was written, no auth code touched, nothing was exploited.
> Every claim about either codebase carries a `path:line` receipt. Where I did not read something,
> §6 says so.

**Study target:** `open-webui/open-webui`, shallow clone at `01f4282f1ffe` (2026-07-27), read at
`/tmp/claude-1000/.../scratchpad/open-webui`. Receipts prefixed `OW:` are that tree; unprefixed
receipts are ours (repo-relative, absolute root `/home/inktomi/inktomi-stack/development/orbweaver/`).

**Headline.** Open WebUI's OIDC is *broader* than ours (group→group sync, group auto-creation,
back-channel logout, picture ingestion, token-exchange, per-provider session store) and *weaker* at
every identity-binding trust boundary we care about. Three of their controls are genuinely worth
adopting; two of their patterns are strictly more dangerous than what we already ship and must not
be copied. Concretely: they have **no `email_verified` check anywhere in the repository**, their
`OAUTH_MERGE_ACCOUNTS_BY_EMAIL` path *re-binds* an existing account's subject rather than refusing
(the exact case our bind-once guard refuses), and both their role-deny and their group-removal arms
**fail open when the claim is absent**.

---

## 1. Their flow, in sequence, with receipts

### 1.0 Configuration / provider registration

Authentik is deployed through their **generic `oidc` provider**, not a named one: it registers only
when `OAUTH_CLIENT_ID and (OAUTH_CLIENT_SECRET or OAUTH_CODE_CHALLENGE_METHOD) and OPENID_PROVIDER_URL`
are all set (`OW:backend/open_webui/config.py:2678`), via authlib's `oauth.register(name="oidc", …,
server_metadata_url=OPENID_PROVIDER_URL)` (`OW:config.py:2680-2701`). There is exactly one string in
the whole repo mentioning Authentik, and it is a *forward-auth* comment, not OIDC
(`OW:src/lib/apis/index.ts:1470`).

Every OAuth knob is dual-tier: an env floor plus a DB `Config` override, resolved fresh per callback
by `get_oauth_runtime_config()` (`OW:backend/open_webui/utils/oauth.py:183-187`, key map at
`:123-176`). An admin can therefore flip `merge_accounts_by_email`, `allowed_domains`, `admin_roles`,
etc. at runtime through `POST /api/v1/auths/admin/config/oauth`
(`OW:backend/open_webui/routers/auths.py:1449`).

**PKCE is opt-in and off by default.** `OAUTH_CODE_CHALLENGE_METHOD` defaults to `None`
(`OW:config.py:2523`); `oauth_client_kwargs` only adds `code_challenge_method` when it is exactly
`"S256"`, and raises for any other value (`OW:config.py:2602-2616`). A default Authentik deployment
therefore runs authorization-code **without PKCE**. State and nonce are delegated wholesale to
authlib's starlette integration (`authorize_redirect` / `authorize_access_token`,
`OW:oauth.py:1751,1771`) — there is no explicit state or nonce handling in their code at all
(grep for `nonce` in `oauth.py` + `auths.py` returns only the *back-channel-logout* arm,
`OW:oauth.py:2222-2228`). The OIDC transaction state lives in a signed/Redis-backed starlette
session cookie `owui-session` (`OW:backend/open_webui/main.py:2485-2502`).

### 1.1 `GET /oauth/{provider}/login`

`OW:main.py:2647` → `OAuthManager.handle_login` (`OW:oauth.py:1731`):

1. `ENABLE_OAUTH` false → 404; unknown provider → 404; no client → 404 (`OW:oauth.py:1733-1740`).
2. `redirect_uri` = the provider's configured `redirect_uri` **or** `request.url_for(...)`
   (`OW:oauth.py:1741-1743`). **There is no redirect allowlist** — when `OPENID_REDIRECT_URI` is
   unset, the callback URL is derived from the request URL. The real gate is the IdP's own
   registered-redirect-URI check, not theirs.
3. Optional `audience` + arbitrary operator-supplied `OAUTH_AUTHORIZE_PARAMS`
   (`OW:oauth.py:1745-1751`).

### 1.2 `GET /oauth/{provider}/login/callback` — the whole flow

`OW:main.py:2652-2669` → `OAuthManager.handle_callback` (`OW:oauth.py:1753`). Their own docstring
at `OW:main.py:2662-2667` states the resolution order, including the caveat *"note: some providers
do not verify email addresses."*

| # | Step | Receipt | Notes |
|---|---|---|---|
| 1 | `ENABLE_OAUTH` / provider gate | `OW:oauth.py:1755-1758` | 404 |
| 2 | `authorize_access_token` (state+nonce+code exchange, authlib) | `OW:oauth.py:1771` | On `BadSignatureError` it **evicts the cached JWKS and retries once** — a nice key-rotation recovery (`:1772-1792`) |
| 3 | Claims: prefer `token["userinfo"]`, else call the userinfo endpoint; ID-token claims are **backfilled only for keys userinfo omitted** (userinfo wins) | `OW:oauth.py:1804-1819` | Preserves Entra-style role/group claims that only live in the ID token |
| 4 | `sub` extraction (`OAUTH_SUB_CLAIM` or provider default `sub`); missing → 400 | `OW:oauth.py:1826-1834` | |
| 5 | Email extraction from `OAUTH_EMAIL_CLAIM`; missing → GitHub-specific API fallback, else `ENABLE_OAUTH_EMAIL_FALLBACK` synthesizes `{provider}@{sub}.local`, else 400 | `OW:oauth.py:1841-1879` | Email is **mandatory** |
| 6 | Lowercase + `OAUTH_ALLOWED_DOMAINS` check (`*` default = everything) | `OW:oauth.py:1881-1888` | |
| 7 | **Lookup by `(provider, sub)`** | `OW:oauth.py:1891` → `OW:backend/open_webui/models/users.py:357-374` | JSON-column filter |
| 8 | **If not found and `OAUTH_MERGE_ACCOUNTS_BY_EMAIL`: lookup by email, then bind the sub onto that row** | `OW:oauth.py:1894-1899` → `update_user_oauth_by_id`, `OW:models/users.py:630-642` | **The takeover surface — §3** |
| 9 | Existing user: re-derive role; optionally update name / email / picture | `OW:oauth.py:1901-1946` | |
| 10 | New user: refuse if `ENABLE_OAUTH_SIGNUP` off (403); refuse if email already taken (400); else `Auths.insert_new_auth` with a random unused password | `OW:oauth.py:1948-1982` | |
| 11 | **First-user bootstrap: `get_num_users() == 1` *after* the insert → promote to `admin`** | `OW:oauth.py:1984-1989` | Deliberately post-insert to avoid a TOCTOU race; same shape as `signup_handler` (`OW:routers/auths.py:860-864`) |
| 12 | Default-group assignment + `USER_CREATED` event | `OW:oauth.py:1991-2000` | |
| 13 | Mint the app JWT (`create_token({'id': user.id})`) | `OW:oauth.py:2008-2011` | HS256 over `SESSION_SECRET`, `OW:utils/auth.py:222-233` |
| 14 | **Group sync (if `ENABLE_OAUTH_GROUP_MANAGEMENT`) — runs AFTER the token is minted** | `OW:oauth.py:2012-2018` | |
| 15 | On any exception: redirect `/auth?error=<urlencoded detail>` | `OW:oauth.py:2020-2034` | |
| 16 | Set cookie `token`, **`httponly=False`** ("Required for frontend access") | `OW:oauth.py:2044-2051` | **§3** |
| 17 | Optional `oauth_id_token` cookie (httponly) | `OW:oauth.py:2054-2062` | |
| 18 | Prune to `OAUTH_MAX_SESSIONS_PER_USER` (default 10), create the server-side OAuth session row, set `oauth_session_id` (httponly) | `OW:oauth.py:2064-2099` | This row exists to hold the *provider* refresh token, not the app session |

### 1.3 Role derivation — `get_user_role` (`OW:oauth.py:1463-1548`)

```
if user and user_count == 1:            -> "admin"     (self-repair for a single-user box) :1466
if not user and user_count == 0:        -> DEFAULT_USER_ROLE (promotion deferred)          :1470
if ENABLE_OAUTH_ROLE_MANAGEMENT:
    extract roles from OAUTH_ROLES_CLAIM (nested dot-path, then flat fallback)              :1488-1509
    if oauth_roles:                                                                          :1517
        match against OAUTH_ALLOWED_ROLES ("*" wildcard supported)  -> "user"                :1519-1524
        match against OAUTH_ADMIN_ROLES                             -> "admin"               :1525-1530
        no match                                                    -> 403                   :1531-1539
else:
    new user -> DEFAULT_USER_ROLE ; existing user -> keep user.role                          :1540-1546
```

`DEFAULT_USER_ROLE` defaults to `"pending"` (`OW:config.py:1699`), and `pending` fails
`get_verified_user` (`VERIFIED_USER_ROLES = {"user","admin"}`, `OW:utils/auth.py:492-501`). That is a
real deny-by-default admission arm: a JIT-created user exists but can do nothing until promoted.

The role is recomputed and **written on every login** (`OW:oauth.py:1902-1907`) — including
downgrades. There is **no admin-role protection**: an existing admin who loses `OAUTH_ADMIN_ROLES`
membership is demoted on their next login, and the only exemption is the `user_count == 1` self-repair.

### 1.4 Group sync — `update_user_groups` (`OW:oauth.py:1550-1681`)

Runs on **every login** when `ENABLE_OAUTH_GROUP_MANAGEMENT`. Groups are matched **by NAME**
(`OW:oauth.py:1631,1658`) against a real app-level `groups` table with its own permissions blob.

- Claim parse: nested dot-path over `OAUTH_GROUPS_CLAIM`; list, or string split on
  `OAUTH_GROUPS_SEPARATOR` (default `;`) (`OW:oauth.py:1563-1578`).
- `ENABLE_OAUTH_GROUP_CREATION`: auto-creates missing groups with `default_permissions`, attributed to
  the super-admin (falling back to the logging-in user) (`OW:oauth.py:1584-1620`).
- **Removal:** for each current group not in the claim and not blocked → `remove_users_from_group`
  (`OW:oauth.py:1627-1652`).
- **Addition:** for each available group in the claim not already held and not blocked →
  `add_users_to_group` (`OW:oauth.py:1654-1681`).
- `OAUTH_BLOCKED_GROUPS` supports exact / regex / fnmatch-wildcard patterns
  (`OW:oauth.py:317-355`) and pins those memberships against OIDC-driven removal.

### 1.5 Adjacent arms

- **Trusted-header mode** (`WEBUI_AUTH_TRUSTED_EMAIL_HEADER`) JIT-creates on `/signin`
  (`OW:routers/auths.py:728-772`), syncs groups from `WEBUI_AUTH_TRUSTED_GROUPS_HEADER`, and sets the
  role straight from `WEBUI_AUTH_TRUSTED_ROLE_HEADER` if it is in `{admin,user,pending}` — and
  `get_current_user` re-checks that the JWT's user email still matches the trusted header
  (`OW:utils/auth.py:387-393`), which is a nice belt.
- **Token exchange** `POST /api/v1/auths/oauth/{provider}/token/exchange`
  (`OW:routers/auths.py:1561`), off by default, rate-limited, optionally restricted by introspected
  client_id (`OW:routers/auths.py:1604-1616`). It **repeats the email-merge bind**
  (`OW:routers/auths.py:1671-1676`) but will **not** JIT-create.
- **Back-channel logout** `POST /oauth/backchannel-logout` (`OW:main.py:2677`) is fully spec-checked:
  issuer match, JWKS signature, `aud`/`iss`, required claims, the `backchannel-logout` event, nonce
  rejection, sub-or-sid presence (`OW:oauth.py:2105-2286`). It is the most rigorous validation in
  their whole auth surface — and it **degrades to no-op without Redis** (`OW:oauth.py:2256-2261`).
- **Revocation generally requires Redis.** `invalidate_token` writes a `jti` revocation key only
  `if request.app.state.redis` (`OW:utils/auth.py:284-297`); `is_valid_token` checks nothing when
  Redis is absent (`OW:utils/auth.py:251`). **Without Redis, sign-out only deletes the cookie — the
  JWT stays valid until `exp`.**

### 1.6 Their login UX (`OW:src/routes/auth/+page.svelte`)

- Provider buttons per configured provider with vendor SVGs; the generic OIDC button is a keyring icon
  labelled `Continue with {OAUTH_PROVIDER_NAME}` (`:538-567`).
- Divider "or" between the credential form and the provider list (`:443-454`).
- Errors: the callback's `?error=` param is surfaced as a `toast.error` on mount (`:166-169`).
- Auto-redirect to the single provider when `OAUTH_AUTO_REDIRECT` and the deployment is unambiguously
  SSO-only, suppressed by `?form=`, `?error=`, onboarding, trusted-header, or an existing token
  (`:178-193`) — a careful, well-conditioned piece of UX.
- Submitting state (`disabled` + spinner) on every submit button (`:386,400,410`).
- Markdown `login_footer` (DOMPurify-sanitized) (`:601-607`).
- On callback the page **reads the `token` cookie in JS and copies it into `localStorage`**
  (`:127-152`) — which is why cookie 16 above is `httponly=False`.

---

## 2. Our flow, in sequence, with receipts

Three tiers, one mint (`docs/architecture/core/Spine-Identity-and-Auth.md:11-32`):
VERIFICATION `infra/auth` (db-free) → RESOLUTION `domain/sessions` → CONSTRUCTION `entry/auth/seam.ts`.

### 2.1 `GET /api/auth/oidc/login` (`packages/server/src/entry/http/auth-routes.ts:296-334`)

1. `deriveRedirectUri(headers, allowlist)` — builds `{proto}://{host}/api/auth/oidc/callback` from
   `X-Forwarded-Proto`/`X-Forwarded-Host` (proto defaults to `https`, never downgraded) and accepts it
   **only on exact match against `OIDC_REDIRECT_URIS`** (`:282-292`). Off-allowlist → 400 plus a
   `securityEvent("oidc_redirect_uri_rejected")`, **with no transaction minted** (`:297-309`).
2. Fresh PKCE verifier + S256 challenge, `randomState()`, `randomNonce()` — **PKCE is unconditional,
   not a knob** (`:311-314`, `PKCE_METHOD = "S256"` at `:40`).
3. The transaction (state, verifier, nonce, validated redirectUri) is persisted server-side in the
   `oidc_transactions` table with a 600 s TTL
   (`packages/server/src/domain/sessions/persistence/oidc-store.ts:12,18-27`).
4. Redirect to the IdP with `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method`,
   `state`, `nonce` (`:322-333`).

### 2.2 `GET /api/auth/oidc/callback` (`auth-routes.ts:336-382`)

1. **Atomic single-use consume** of the state-keyed row: expired rows are swept first, then a
   `DELETE … WHERE state = ? AND expires_at > now RETURNING *` — take-and-delete, replay-proof
   (`oidc-store.ts:29-56`). Null → 401.
2. IdP `?error=` → sanitized against `/^[a-z_]{1,64}$/` and surfaced; no token exchange, no session
   (`auth-routes.ts:66-72,345-350`).
3. `authorizationCodeGrant` with `pkceCodeVerifier` + `expectedNonce` + `expectedState` — openid-client
   v6 verifies **all three** on the exchange (`auth-routes.ts:87-98`). Every throw is converted to a
   fail-closed sanitized code, never a 500 (`:84-98`).
4. `identityFromClaims` maps claims → `ResolvedIdentity` (`:413-442`). Claim names are injected
   (`OIDC_USERNAME_CLAIM`/`UID_CLAIM`/`GROUPS_CLAIM`/`EMAIL_CLAIM`, defaults
   `preferred_username`/`sub`/`groups`/`email`,
   `packages/server/src/foundation/env/index.ts:373-376`), each may be a dot-path (`:387-396`).
   A missing/empty username claim → null identity → 401. A missing subject emits
   `securityEvent("oidc_subject_claim_missing")` naming the misconfiguration (`:425-431`).
5. `provisionIdentity(identity)` (§2.3). `denied` → 401; `!enabled` → 403 (`:369-375`).
6. `sessions.create` → `__Host-orb_session` cookie: `Path=/; HttpOnly; Secure; SameSite=Lax`
   (`:42,113-116,376-380`), then 302 to `/`.

### 2.3 `provisionIdentity` — the JIT/link/role verb
(`packages/server/src/domain/sessions/verbs/provision-identity.ts`)

Ordering, exactly:

1. `findExisting`: **`externalId` first (rename-safe), then `handle`** (`:35-43`).
2. `reportNullSubjectOnBoundRow` — observability when a subject-less login lands on a bound row
   (`:244-253`).
3. **THE BIND-ONCE GUARD.** `isSubjectMismatch` (`:70-72`) — the handle fallback *binds an unbound row
   and never rebinds a bound one*. A subject-bearing login whose handle resolves to a row already bound
   to a **different** `externalId` is **refused, `{outcome:"denied"}`, with no row written**
   (`:277-283`). The comment at `:259-276` names both reachable attacks: (a) the owner row, whose
   handle is a publicly guessable `OWNER_HANDLES` constant, and (b) any user, through the window
   between an IdP rename and their next login, during which their old username is free to re-register.
   Operator recovery is deliberately manual (a documented `UPDATE users SET external_id = NULL`),
   owner-ruled 2026-08-08.
4. Owner exemption by **row identity** (`existing.id === ownerId`), never a role-literal compare — the
   owner is never denied and never re-derived downward (`:287-292`).
5. `deriveIdentityAccess` — the fail-closed login gate:
   `OIDC_ALLOWED_GROUPS` set and no intersection ⇒ `deny`, no row created or updated
   (`substrate/role-policy.ts:117-127`; verb `:296-303`).
6. **Owner-flip reconciliation** (`tryAdoptUnboundOwner`, `:173-208`): an owner-by-policy login binds
   onto the existing **unbound** owner row instead of minting a second one. Guarded three ways —
   needs a subject, needs the owner row to be unbound (`owner.externalId !== null` → bail), and bails
   when `existing` already matched by externalId. It cannot steal a bound identity.
7. `reconcileOwnerSingleton` (`:213-225`) — a second owner-by-policy identity is downgraded to `user`
   with a warn, backed by the DDL partial unique index `users_single_owner_unique`
   (`packages/db/src/schema/users.ts:73`).
8. `updateExisting` (`:82-129`) or `insertNew` (`:132-159`). Update refreshes
   `handle`/`externalId`/`email`, re-derives `role` only when governance is active, **never touches
   `enabled`**, and **never renames the owner off its `OWNER_HANDLES` seed key** (`:106-109`, with
   the full cascade rationale at `:92-105`).

### 2.4 Role derivation (`packages/server/src/domain/sessions/substrate/role-policy.ts`)

```
determineRole:  isOwnerByPolicy(handle, groups)     -> "owner"   :96-98
                groups ∩ OIDC_ADMIN_GROUPS ≠ ∅      -> "admin"   :99-101
                                                    -> "user"    :102
deriveIdentityAccess: privileged = owner ∨ admin-group           :122
                      !(privileged ∨ passesAllowedGate) -> deny  :123-125
reDeriveRoleOnLogin: true when OIDC_ADMIN_GROUPS or
                     OIDC_ALLOWED_GROUPS is set, else the
                     legacy RE_DERIVE_ROLE_ON_LOGIN flag         :136-152
```

`isOwnerByPolicy` = `OWNER_GROUP` membership **or** handle ∈ `OWNER_HANDLES` (`:81-87`).
`OWNER_HANDLES` is D17-singleton — `seedOwner` refuses more than one (`entry/boot/seed-owner.ts:86-90`).

### 2.5 Boot owner seeding (`packages/server/src/entry/boot/seed-owner.ts`)

`adoptMovedSeedKey` (`:58-80`) migrates the owner row when `OWNER_HANDLES` changes, refusing loudly if
another user holds the new key; it never touches `role`/`external_id`/`password_hash`/`enabled`. Then
`ensureUser(handle)` + a guarded `UPDATE … SET role='owner', enabled=true` that self-heals a
raw-write-disabled owner (`:107-110`), plus the first-boot local password seed guarded by
`isNull(password_hash)` (`:125-142`). `ensureUser` **fails loudly** rather than returning a fabricated
id when the insert was swallowed by a non-handle UNIQUE — the 2026-08-09 cascade fix
(`domain/sessions/verbs/ensure-user.ts:12-19,42-47`).

### 2.6 Session steady state

Cookie `__Host-orb_session`, raw token never stored (peppered HMAC `token_hash` is the lookup key);
`validate` re-checks **revoked / expired / `users.enabled` every request**, so disable/revoke/role
change propagate on the next request — we are not JWT-baked
(`domain/sessions/verbs/validate.ts:6-11,16-19`; spine invariant #8 at
`Spine-Identity-and-Auth.md:30`). Expiry slides with activity (throttled write, `:21-25`). Logout
requires the CSRF header and revokes through the **same cookie reader** the seam authenticated with
(`auth-routes.ts:249-263`, reader at `entry/auth/seam.ts:85-104`).

Client: `/api/auth/config` + `/api/auth/me` are the only pre-tRPC reads
(`entry/http/auth-meta.ts`); a mid-session tRPC `UNAUTHORIZED` triggers a one-shot hard redirect to
`/login` (`packages/client/src/data/stale-session.ts:32-41`).

### 2.7 Our login UX (`packages/client/src/features/auth/surfaces/login-surface.tsx`)

Per-mode dispatcher with an exhaustive switch (`:46-98`, `assertNeverMode` at `:101-103`): `local`
renders a credential form, `oidc` renders one **Continue** button doing a whole-window
`location.assign("/api/auth/oidc/login")` plus the line "You'll be redirected to your identity
provider, then back here" (`:54-72`), `forward-header` renders a proxy-config explainer naming
authentik/Authelia/oauth2-proxy and `FORWARD_AUTH_TRUSTED_PROXIES` (`:73-82`), `single-user` says
you're already in. Loading skeletons (`:105-112`) and an unreachable-server retry state (`:114-126`)
exist. The local form has pending state and a `role="alert"` error line
(`components/login-local-form.tsx:62-69`).

---

## 3. Where their pattern is WEAKER than ours

These are the ones that matter. Each is stated as an exploit path, not a vibe.

### W1 — Email-merge account takeover · HIGH · **do not adopt**

`OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true` + `Users.get_user_by_email(email)` +
`update_user_oauth_by_id(user.id, provider, sub)` (`OW:oauth.py:1894-1899`,
`OW:models/users.py:630-642`) with **zero `email_verified` check** and **zero previous-binding check**.

*Exploit:* Alice is `alice@corp.com` with `oauth.oidc.sub = A`. An attacker gets any identity in the
same IdP realm (or any additional configured provider) whose email claim reads `alice@corp.com` —
Authentik lets an admin set a user's email to an arbitrary string, and several IdPs let a user do it
themselves without verification. Log in. `get_user_by_oauth_sub` misses (sub = B), merge-by-email
hits Alice's row, `update_user_oauth_by_id` **overwrites** `oauth.oidc = {'sub': B}` — the attacker now
owns Alice's account and Alice's own sub no longer resolves. The same primitive is reachable through
`token_exchange` (`OW:routers/auths.py:1671-1676`).

*Verified absence:* `email_verified` appears **nowhere** in the repository —
`grep -arn email_verified --include={py,ts,svelte,md} .` exits 1 across their whole tree, and the
callback's own docstring acknowledges the hazard rather than checking it (`OW:main.py:2665`).

*Ours:* the identical shape is exactly what `isSubjectMismatch` refuses
(`provision-identity.ts:70-72,277-283`), and we key on `externalId`/`handle` — `users.email` carries
**no UNIQUE and is never an identity or join key** by explicit schema decision
(`packages/db/src/schema/users.ts:41-44`). **ALREADY-BETTER.**

### W2 — Role deny fails OPEN on an absent claim · MEDIUM

`if oauth_roles:` at `OW:oauth.py:1517` gates the entire allow/admin matching block. With
`ENABLE_OAUTH_ROLE_MANAGEMENT=true`, an ID token that simply **omits** `OAUTH_ROLES_CLAIM` (Authentik
scope misconfiguration, a property mapping that returns nothing, a group the claim mapper filters out)
produces `oauth_roles == []`, skips the 403 at `:1531-1539`, and lands on
`role = DEFAULT_USER_ROLE` (`:1485`). The blast radius is bounded only because that default is
`pending` (`OW:config.py:1699`) — an operator who set `DEFAULT_USER_ROLE=user` for convenience turns a
claim-mapping outage into "everyone in the IdP gets a working account".

*Ours:* `passesAllowedGate` returns false on an empty groups list whenever `OIDC_ALLOWED_GROUPS` is
set (`role-policy.ts:106-112`), and `deriveIdentityAccess` denies (`:123-125`) — an empty or
unparseable groups array **never** passes the gate. **ALREADY-BETTER.**

### W3 — Group removal fails OPEN on an absent claim · MEDIUM

`OW:oauth.py:1628-1633`: the removal loop's condition leads with `user_oauth_groups and …`. If the
claim is empty — i.e. **the user was removed from every group in Authentik** — no removal runs and
the user keeps every app group and its permissions indefinitely. De-provisioning is silently a no-op
in exactly the case it matters most.

*Ours:* we hold no group memberships to leak (§4/G4); role re-derivation reads the whole groups array
and downgrades to `user` when it no longer intersects `OIDC_ADMIN_GROUPS`, empty array included
(`role-policy.ts:99-102` + `provision-identity.ts:114-117`). **ALREADY-BETTER.**

### W4 — Session token readable by JavaScript · MEDIUM

The OAuth callback sets `token` with `httponly=False` and the comment "Required for frontend access"
(`OW:oauth.py:2044-2051`), and the frontend then copies it into `localStorage`
(`OW:src/routes/auth/+page.svelte:136-150`). Any XSS anywhere in the app — including the
DOMPurify-sanitized markdown surfaces — exfiltrates a bearer token valid for the full
`JWT_EXPIRES_IN`, and without Redis it cannot be revoked at all (§1.5). Note the inconsistency: the
*password* signin path sets the same cookie `httponly=True` (`OW:routers/auths.py:196-204`).

*Ours:* `__Host-` prefix + `HttpOnly` + `Secure` + `SameSite=Lax`, no JS read, no localStorage copy,
and a DB-backed session row that `validate` re-checks every request
(`auth-routes.ts:42,113-116`; `validate.ts:16-19`). **ALREADY-BETTER.**

### W5 — No redirect-URI allowlist on our side of the flow · LOW (mitigated by the IdP)

`OW:oauth.py:1741-1743` derives the callback from `request.url_for` when `OPENID_REDIRECT_URI` is
unset. Behind a proxy that rewrites Host, the app can compute a callback URL the operator never
declared; the only thing that stops the flow is Authentik's own redirect-URI registration. Ours gates
on `OIDC_REDIRECT_URIS` with an exact string match plus a security event
(`auth-routes.ts:276-292,297-309`). **ALREADY-BETTER.**

### W6 — PKCE off by default · LOW for a confidential client

`OAUTH_CODE_CHALLENGE_METHOD` default `None` (`OW:config.py:2523`). For a confidential client with a
secret this is not an authorization-code-injection hole on its own, but it removes a defence-in-depth
layer that costs nothing. Ours is unconditional S256 (`auth-routes.ts:40,311-329`). **ALREADY-BETTER.**

### W7 — Unfiltered dialect fallthrough in the sub lookup · INFORMATIONAL

`get_user_by_oauth_sub` builds `select(User)` and applies a `WHERE` only for `sqlite` and
`postgresql` (`OW:models/users.py:364-374`). Any other dialect returns `.scalars().first()` of an
**unfiltered** user table — i.e. an arbitrary user for any sub. Not reachable in a supported config
(no mysql/mariadb references exist under `backend/open_webui/internal/` or `env.py`), but it is a
query that fails open by construction rather than closed. Noted as a coding-pattern contrast, not a
live finding against them.

---

## 4. Gap table — capability by capability

Legend: **ADOPT** = take their idea · **IMPROVE** = we have it, theirs is better in some respect ·
**ALREADY-BETTER** = keep ours, do not copy theirs.

| # | Capability | Open WebUI | Orbweaver | Verdict | Security stance |
|---|---|---|---|---|---|
| G1 | JIT user creation | `insert_new_auth` from email + name + picture + role, random password (`OW:oauth.py:1971-1979`) | `insertNew` from handle + externalId + email + derived role (`provision-identity.ts:132-159`) | **ALREADY-BETTER** | We mint no password and no unused credential; email is an attribute, not a key |
| G2 | Creation gate | `ENABLE_OAUTH_SIGNUP` (default false) → 403 (`OW:oauth.py:2002-2006`) | No equivalent — any identity passing `OIDC_ALLOWED_GROUPS` is provisioned | **ADOPT (A1)** | Ours has a *group* gate but no "SSO signup off" switch; on a box with no `OIDC_ALLOWED_GROUPS` set, every IdP user gets an account |
| G3 | New-user quarantine role | `DEFAULT_USER_ROLE="pending"`, fails `get_verified_user` (`OW:config.py:1699`, `OW:utils/auth.py:492-501`) | New users land at `user` — fully functional immediately | **ADOPT (A2)** | Their deny-by-default admission arm is genuinely better for a shared box |
| G4 | Email-domain allowlist | `OAUTH_ALLOWED_DOMAINS` (`OW:oauth.py:1883-1888`) | None | **ADOPT (A3, cheap)** | A second independent admission axis; costs one env + one predicate |
| G5 | Identity binding | `sub` first, then **email-merge that rebinds** (`OW:oauth.py:1891-1899`) | `externalId` first, then handle — **binds once, never rebinds** (`provision-identity.ts:70-72,277-283`) | **ALREADY-BETTER** | §3/W1. Do not add an email-merge path in any form |
| G6 | Rename tracking | `OAUTH_UPDATE_NAME/EMAIL/PICTURE_ON_LOGIN`, each opt-in; email update refuses on collision (`OW:oauth.py:1909-1946`) | handle + email refresh on every login, keep-on-null; owner handle pinned (`provision-identity.ts:88-112`) | **ALREADY-BETTER** | Ours is rename-safe because identity is `externalId`, not the mutable attribute |
| G7 | Group→role mapping | `OAUTH_ROLES_CLAIM` × `ALLOWED_ROLES`/`ADMIN_ROLES`, nested claim, separator, wildcard (`OW:oauth.py:1478-1539`) | `OIDC_ADMIN_GROUPS` / `OWNER_GROUP` / `OIDC_ALLOWED_GROUPS` (`role-policy.ts:41-127`) | **IMPROVE (A4)** | Adopt their **nested dot-path + string-separator** claim parsing; we already read a dot-path for the claim *name* (`auth-routes.ts:387-396`) but require the value to be an array (`:432-433`) — an Authentik property mapping emitting a `;`-joined string yields `[]`, i.e. silent deny |
| G8 | Group→group sync | Full: create, add, remove, blocked-group pins, per-group permissions (`OW:oauth.py:1550-1681`) | **None** — no `groups` table exists (verified: exhaustive structural enumeration of all 85 `sqliteTable(...)` calls, `scannedFileCount=29`, plus a literal grep) | **OWNER FORK (F1)** | D65 rules "Orb builds NO app-level groups/group-ACL (no consumer)" (`Core-Path-Registry.md:170`). Their group model exists to drive per-group *permission blobs* we deliberately do not have |
| G9 | Sync cadence | Every login (`OW:oauth.py:2012-2018`) | Role re-derives every login when governance is active (`role-policy.ts:136-152`) | **PARITY** | Both are "IdP is the source of truth, next login applies" |
| G10 | Removal semantics | Removal loop fails open on an empty claim (`OW:oauth.py:1628-1633`) | Empty groups ⇒ `determineRole` → `user`, and the allowed-gate denies outright | **ALREADY-BETTER** | §3/W3 |
| G11 | Admin-role protection | **None** — an admin losing the claim is demoted; only the `user_count == 1` self-repair exempts (`OW:oauth.py:1466-1469,1902-1907`) | Owner is exempt by **row identity**, never re-derived, never denied, never renamed off its seed key (`provision-identity.ts:287-292`; `updateExisting` `:106-117`) | **ALREADY-BETTER** | Their model can lock an operator out of their own instance on an IdP claim outage |
| G12 | Admin bootstrap | First user post-insert `get_num_users()==1` → admin (`OW:oauth.py:1984-1989`), plus `create_admin_user` from env (`OW:utils/auth.py:524-556`) | `OWNER_HANDLES`/`OWNER_GROUP` policy + boot `seedOwner` with a DDL singleton index and a moved-key migration | **ALREADY-BETTER** | Ours is declarative and idempotent; theirs is "whoever logs in first" |
| G13 | Owner-flip / mode change | No concept | `tryAdoptUnboundOwner` binds the OIDC subject onto the existing unbound owner row (`provision-identity.ts:173-208`) | **ALREADY-BETTER** | Unique to us; solves single-user→OIDC without DB surgery |
| G14 | Session substance | Stateless HS256 JWT; revocation **requires Redis** (`OW:utils/auth.py:251,284-297`) | DB session row; revoked/expired/`enabled` re-checked per request (`validate.ts:16-19`) | **ALREADY-BETTER** | Ours revokes instantly with no extra infra |
| G15 | Cookie policy | `token` httponly=False on the OAuth path (`OW:oauth.py:2047`) | `__Host-` + HttpOnly + Secure + SameSite=Lax (`auth-routes.ts:42`) | **ALREADY-BETTER** | §3/W4 |
| G16 | CSRF | Not applied to the OAuth path (SameSite only) | `hasCsrfHeader` gate on logout; the transport ladder enforces on cookie mutations (`auth-routes.ts:249-253`) | **ALREADY-BETTER** | |
| G17 | PKCE / state / nonce | PKCE opt-in; state+nonce delegated to authlib session cookie | PKCE S256 unconditional; state+nonce in a server-side single-use row with TTL and atomic take-and-delete (`oidc-store.ts:29-56`) | **ALREADY-BETTER** | |
| G18 | Redirect allowlist | None on their side (`OW:oauth.py:1741-1743`) | Exact-match `OIDC_REDIRECT_URIS` + security event (`auth-routes.ts:282-309`) | **ALREADY-BETTER** | |
| G19 | Back-channel logout (RP-initiated by the IdP) | Full spec implementation (`OW:oauth.py:2105-2286`) | **None** | **ADOPT (A5)** | The one substantial *capability* they have that we lack; ours would be strictly simpler and stronger — revoke DB session rows, no Redis dependency |
| G20 | End-session / IdP logout on our logout | Discovers `end_session_endpoint`, returns a redirect (`OW:routers/auths.py:975-1004`) | Local revoke only | **ADOPT (A6)** | Today logging out of orbweaver leaves the Authentik session live, so "Continue" logs you straight back in — a real dogfood papercut |
| G21 | Error UX on the callback | Redirect `/auth?error=…` → toast (`OW:oauth.py:2032-2034`; `+page.svelte:166-169`) | **`c.json({error}, 401)` on a top-level browser navigation** — the user sees raw JSON (`auth-routes.ts:340,349,363,367,371,374`) | **ADOPT (A7)** | Not a security hole (the codes are already sanitized at `:70-72`), but it is our worst auth UX defect |
| G22 | Provider button / branding | Per-provider SVG + `OAUTH_PROVIDER_NAME` label (`+page.svelte:538-567`) | One unbranded "Continue" (`login-surface.tsx:61-70`) | **IMPROVE (A8)** | Cosmetic; an `OIDC_PROVIDER_NAME` would make the button say "Continue with Authentik" |
| G23 | Auto-redirect for SSO-only boxes | `OAUTH_AUTO_REDIRECT` with 8 suppression conditions (`+page.svelte:178-193`) | None — always one click | **IMPROVE (A9)** | Copy their suppression list verbatim; without `?error=`/`?form=` escapes it becomes an un-debuggable redirect loop |
| G24 | Avatar / picture ingestion | Fetch + SSRF-safe session + MIME allowlist + base64 data URL (`OW:oauth.py:1683-1729`) | None | **NOT RECOMMENDED** | Their implementation is careful (`get_ssrf_safe_session` pins the connect IP, `allow_redirects=False`, MIME validation) but it is an outbound fetch of an attacker-influenceable URL on the login path. Low value for us |
| G25 | Runtime-editable OIDC config | Full admin API over DB `Config` (`OW:routers/auths.py:1443-1452`) | Env-only, frozen at boot (`foundation/env/index.ts:364-376`) | **ALREADY-BETTER for security** | Env-only means auth posture cannot be changed by a compromised admin session. Do not move auth knobs into AppSettings |
| G26 | Token exchange endpoint | Off by default, introspection-gated (`OW:routers/auths.py:1561-1684`) | None | **NOT RECOMMENDED** | It repeats the email-merge bind and exists for a headless use case we do not have |
| G27 | Subject-less-login observability | None | Two security events at two tiers (`auth-routes.ts:425-431`; `provision-identity.ts:244-253`) | **ALREADY-BETTER** | We tell the operator when a guard has gone inert |

---

## 5. Proposed orbweaver flow — Authentik-first, build-ready

The target shape, stated once, then broken into ranked items. Everything below preserves the three-tier
spine and the one-mint invariant; nothing weakens the bind-once guard or the fail-closed gates.

```
/login  → mode=oidc → [Continue with Authentik]     (A8)
        → (optional) auto-redirect when SSO-only     (A9)
GET /api/auth/oidc/login
        → redirect_uri allowlist  → PKCE S256 + state + nonce → tx row (unchanged)
GET /api/auth/oidc/callback
        → single-use tx consume (unchanged)
        → authorizationCodeGrant verifies state+nonce+PKCE (unchanged)
        → claims → ResolvedIdentity   [+ groups may now be a separator-joined string   A4]
        → provisionIdentity:
             bind-once guard (unchanged)
             owner exemption (unchanged)
             + OIDC_SIGNUP=off ⇒ deny an identity with no existing row                  A1
             + OIDC_ALLOWED_EMAIL_DOMAINS ⇒ deny off-domain                             A3
             allowed-groups gate (unchanged)
             owner-flip adoption (unchanged)
             + first provisioning may land at role=pending                              A2
        → session cookie (unchanged)
        → 302 /            |  on ANY failure: 302 /login?authError=<sanitized code>     A7
POST /api/auth/logout
        → revoke (unchanged) + return the IdP end_session_endpoint for the client       A6
POST /api/auth/oidc/backchannel-logout
        → JWKS-verified logout_token → revoke every session row for that subject        A5
```

### Ranked build items

| Rank | Item | What | Cost | Owner fork |
|---|---|---|---|---|
| 1 | **A7 · Callback errors land on `/login`, not raw JSON** | Replace the six `c.json(…, 401/403)` returns in the OIDC callback with `302 /login?authError=<code>`; `LoginSurface` reads the param and renders a `role="alert"` line above the Continue button. The codes are already sanitized (`auth-routes.ts:70-72`) — no new leak surface. | S (~40 LOC + 1 CT + 1 e2e) | none |
| 2 | **A1 · `OIDC_SIGNUP` (default `on` to preserve today's behavior)** | When off, `provisionIdentity` returns `denied` for an identity with no existing row (place it after the bind-once guard, before the allowed-groups gate so the deny reason stays ordered). Distinct from `OIDC_ALLOWED_GROUPS`: that gates *who*, this gates *whether new rows appear at all*. | S (~25 LOC + int tests) | **Default.** `off` is the safer default and matches OW's `ENABLE_OAUTH_SIGNUP=False`; `on` preserves current behavior. My default: **`on`**, because flipping it silently locks out a working deployment. |
| 3 | **A6 · IdP end-session on logout** | `POST /api/auth/logout` additionally returns `{ endSessionUrl }` resolved from the cached openid-client `Configuration` (we already hold it, `lifecycle.ts:406-411`); the client navigates there after the local revoke. Fixes "log out, click Continue, instantly back in". | S (~35 LOC; needs one `serverMetadata().end_session_endpoint` read) | none |
| 4 | **A4 · Tolerant groups-claim parsing** | `identityFromClaims` (`auth-routes.ts:432-433`) accepts only `Array<string>`. Accept a string and split on `OIDC_GROUPS_SEPARATOR` (default `;`, matching OW's `OAUTH_GROUPS_SEPARATOR`, `OW:config.py:2559`), and accept a single string as a one-element list. **Security-relevant:** today a `;`-joined Authentik property mapping silently yields `[]`, which under `OIDC_ALLOWED_GROUPS` denies *every* login — a fail-closed misconfiguration that looks like a broken IdP. | S (~15 LOC + unit tests) | none |
| 5 | **A5 · OIDC back-channel logout** | `POST /api/auth/oidc/backchannel-logout`, off unless `OIDC_BACKCHANNEL_LOGOUT=on`. Validate the `logout_token` against the issuer JWKS (we already have `infra/auth/jwks.ts`), check `iss`/`aud`/`iat`, require the `backchannel-logout` event, **reject a `nonce`**, require `sub` or `sid`; then revoke every `sessions` row for the user whose `external_id` matches `sub`. Copy their validation checklist (`OW:oauth.py:2185-2239`) — it is correct and complete. **Ours is strictly stronger than theirs**: they need Redis and degrade to a no-op without it (`OW:oauth.py:2256-2261`); we just delete rows. | M (~150 LOC + int suite; a new revoke-by-externalId persistence fn) | none |
| 6 | **A2 · `pending` admission role** | Add `pending` to `USER_ROLES`? **No** — that would touch the D17 lattice, `can()`, the `users_role_check` CHECK, and every dispatch. Instead reuse the column we already have: provision a first-time SSO user with `enabled: false` when `OIDC_REQUIRE_APPROVAL=on`, and surface an admin approval affordance. `validate` and the SSO arm already refuse a disabled row (`validate.ts:18`; `auth-routes.ts:373-375`), so the enforcement is **already built** — this is a write-side default plus an admin surface. | M (~30 LOC server + an admin list/approve surface) | **Yes.** Does the owner want an approval queue at all, and is `enabled:false` the right carrier vs a new role? I recommend `enabled:false` — it reuses a control that is already enforced on all three request arms. |
| 7 | **A3 · `OIDC_ALLOWED_EMAIL_DOMAINS`** | CSV; when set, deny an identity whose email claim's domain is not listed, and deny an identity carrying **no** email (fail-closed — otherwise the gate is trivially bypassed by omitting the claim, which is precisely W2's mistake). | S (~20 LOC) | Minor: is a second admission axis wanted, given `OIDC_ALLOWED_GROUPS` already exists? Groups are the better axis for Authentik; this is for operators who key on domain. |
| 8 | **A9 · Auto-redirect for SSO-only boxes** | `OIDC_AUTO_REDIRECT=on` → `/login` immediately `location.assign`es the login route. **Copy OW's suppression list** (`+page.svelte:178-193`): never when a `?authError=` is present, never when `?form=1`, never when already authenticated. Without those, a misconfigured IdP is an un-debuggable loop. Ships only *after* A7 (the error param is one of the escape hatches). | S (~20 LOC + CT) | none |
| 9 | **A8 · `OIDC_PROVIDER_NAME`** | Serve it on `/api/auth/config`; the button reads "Continue with {name}" (default "your identity provider"). Purely cosmetic. | XS (~10 LOC) | none |
| 10 | **A10 · Login-page provider mark** | Optional small logo slot beside the button, mirroring their per-provider SVG treatment. Tokens-only, `@orb/ui` primitives. | XS | none |

### Explicitly NOT proposed

- **Email-merge account linking** in any form (§3/W1). If a user needs to move IdPs, the operator
  path is the documented manual `external_id = NULL` reset already written into
  `provision-identity.ts:270-276`.
- **App-level groups / group ACL** (G8) — D65 rules it out with "no consumer"
  (`Core-Path-Registry.md:170`). If the owner ever wants per-group permission blobs, that is a
  separate design, not an OIDC feature.
- **Moving OIDC config into AppSettings** (G25) — env-only is a security property, not an oversight.
- **Avatar ingestion** (G24) and **token exchange** (G26).
- **Any change to `isSubjectMismatch`'s scope.** Widening it to null-subject logins breaks
  `forward-header`, exactly as its own scope note says (`provision-identity.ts:60-68`).

---

## 6. Honest floors — what I did not read or verify

- **authlib's internals.** Their state/nonce/PKCE verification is entirely inside
  `authorize_redirect` / `authorize_access_token`; authlib is not installed in this environment
  (`ModuleNotFoundError: No module named 'authlib'`), so "authlib generates and verifies a nonce for
  OIDC clients" is a **library-behavior claim I did not verify from source**. What I did verify is
  that their own code contains no nonce handling for the login flow. The PKCE-off-by-default claim is
  from their config and is solid (`OW:config.py:2523,2602-2616`).
- **Their SCIM router** (`OW:backend/open_webui/routers/scim.py`) — a second provisioning path with
  its own `get_user_by_scim_external_id` (`OW:models/users.py:376-395`). Out of scope for this study;
  it may contain a second linking policy I have not compared.
- **Their LDAP arm** (`OW:routers/auths.py:471-706`) — read only far enough to confirm it is a
  separate credential path, not part of the OIDC flow.
- **Their `access_control` / permission model** (`OW:backend/open_webui/utils/access_control/`) —
  I read what groups *are* (a table with a permissions blob) but not how permissions resolve. G8's
  verdict rests on D65, not on a claim about their permission semantics.
- **No live drive.** Nothing was run against a real Authentik. Every sequencing claim is read off
  source. In particular I did not confirm that Authentik's default `sub` is stable across a user
  rename (it is documented to be, and our default `OIDC_UID_CLAIM=sub` assumes it —
  `foundation/env/index.ts:374`).
- **Our forward-header mode** was read only where it intersects the bind-once guard's scope note; I
  did not audit `infra/auth/modes/forward-header.ts` in full.
- **Their frontend beyond `/auth`.** I read the login page in full; I did not audit their admin user
  or group management surfaces.
