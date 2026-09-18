---
kind: design
status: draft
updated: 2026-09-18
---

# Open WebUI's other login methods (local / LDAP / SCIM), read against ours — the unification study

> COMPARATIVE STUDY. No product code was written, no auth code touched, nothing was exploited.
> Every claim about either codebase carries a `path:line` receipt. Where I did not read something,
> §7 says so.
>
> **Companion to [`oidc-authentik-openwebui-study.md`](oidc-authentik-openwebui-study.md)** — that
> doc covers the OIDC/Authentik path and defines W1–W7; this one covers the *other* login methods and
> the cross-method unification question. Verdicts from the OIDC study are reused, not re-litigated.

**Study target:** `open-webui/open-webui`, shallow clone at pinned `01f4282f1ffe` (2026-07-27), reused
from the OIDC study's scratchpad. Receipts prefixed `OW:` are that tree; unprefixed receipts are ours
(repo-relative, root `/home/inktomi/inktomi-stack/development/orbweaver/`).

**Headline.** Open WebUI has **N parallel provisioning paths, each with its own linking policy** —
OIDC (sub-first, email-*rebind*), token-exchange (repeats the rebind), LDAP (**email-only**, no stable
id), SCIM (externalId-first, email-*refuse*), trusted-header (email-only), local signup (email *is* the
account). The same account-collision is handled three different ways across them, so **the takeover
surface is only as strong as the weakest path** — and their bind-once-ness lives in SCIM but *not* in
OIDC. Ours funnels every external identity through **one** chokepoint (`provisionIdentity`) with **one**
bind-once guard. That is the single most important thing this comparison confirms, and §5 is the
unification argument built on it.

Two answers up front to the coordinator's direct questions:

- **Do we have a local credential path, or are we SSO-only?** We have a **complete, hardened local
  path** — it is not a stub. `AUTH_MODE=local`: scrypt+pepper hashing (`infra/auth/password.ts`),
  a constant-time `authenticate` verb (`domain/sessions/verbs/authenticate.ts`), the
  `POST /api/auth/login` route with a per-IP throttle (`entry/http/auth-routes.ts:205-239`), the
  `login-local-form.tsx` surface, boot owner-password seeding (`entry/boot/seed-owner.ts:124-142`),
  and admin `createUser`/`resetPassword` verbs. We are **not** SSO-only.
- **Does SCIM repeat the email-merge rebind hazard (W1)?** **No — SCIM is the one path that got it
  right.** SCIM `create` refuses an email collision with a 409 instead of rebinding
  (`OW:backend/open_webui/routers/scim.py:588-594`), and links on the stable `externalId`
  (`OW:scim.py:571-578`). Their *OIDC* path is the weak one, not SCIM.

---

## 1. Local username / password

### 1.1 Their flow

Signup `POST /api/v1/auths/signup` → `signup_handler` (`OW:backend/open_webui/routers/auths.py:827-882`):
`validate_email_format` (format only, **no verification email**, `:905`), `validate_password`
(`:913`), `Auths.insert_new_auth` at `DEFAULT_USER_ROLE` (`:849-856`), then **first-user bootstrap**:
`get_num_users() == 1` *after* the insert → promote to `admin` and set `ui.enable_signup=False`
(`:862-865`) — TOCTOU-safe by design (the comment at `:844-846` says so). Signin
`POST /api/v1/auths/signin` verifies via `Auths.authenticate_user` (`:810-814`).

- **Hash:** `PASSWORD_HASH_ALGORITHM` default **`bcrypt`** (`OW:backend/open_webui/env.py:769`), argon2
  optional. `bcrypt.gensalt()` with the **library-default cost (12)** — no explicit cost pin
  (`OW:backend/open_webui/utils/auth.py:174-175`). **No pepper.** 72-byte bcrypt truncation is handled
  (reject-on-signup + truncate-on-verify, `OW:utils/auth.py:182-184,208`).
- **Constant-time enumeration defense:** a precomputed `PLACEHOLDER_HASH` is verified for an
  unknown/inactive user so timing can't reveal account existence
  (`OW:backend/open_webui/models/auths.py:20-23,154,160`) — CWE-208, cited in their own comment.
- **Email verification:** **none anywhere in the backend.** Verified by absence: no `smtplib` /
  `send_email` / `verification_token` / `verify_email` in `backend/open_webui/` (the only
  `confirmation` hits are "web search confirmation" and "signup password confirmation",
  `OW:utils/auth.py`/`config.py`/`main.py` — neither is email). `email_verified` from an OIDC claim is
  also never read (OIDC study W1).
- **Rate limiting:** `signin_rate_limiter = RateLimiter(limit=15, window=180)` keyed **by email**,
  Redis rolling-window with an in-memory fallback (`OW:routers/auths.py:90,804-808`;
  `OW:backend/open_webui/utils/rate_limit.py:7-60`). **Per-account, not per-IP.** No hard lockout —
  it is a rolling-window limiter, so a victim cannot be locked out permanently (a good deliberate
  choice: a per-account *lockout* would be a victim-DoS).
- **Password reset:** **no self-service / email reset flow exists** (grep for `reset`/`forgot` in
  `auths.py` returns nothing). Self-change `POST /update/password` requires the current password
  (`OW:routers/auths.py:383-421`) and is blocked in trusted-header mode (`:391`). Admin reset is the
  only reset — `update_user_password_by_id` (`OW:models/auths.py:213-226`).
- **Cookie:** the password `signin`/`signup` path sets `token` **`httponly=True`**
  (`OW:routers/auths.py:200`) — the OAuth path sets it `httponly=False` (`OW:oauth.py:2047`). The
  inconsistency is OIDC study **W4**.
- **Gates:** `ENABLE_PASSWORD_AUTH` default true (`OW:config.py:1629`); a no-auth dev mode
  (`WEBUI_AUTH=False`) auto-logs-in a hardcoded `admin@localhost` / `admin` (`OW:routers/auths.py:774-802`).

### 1.2 Ours

- **Hash:** scrypt N=2¹⁵/r=8/p=1 (OWASP-2023 baseline, **explicitly pinned** so a Node default shift
  can't silently weaken it) + a per-user random salt + an **HMAC-SHA256 pepper keyed on
  `SESSION_SECRET`**, so a stolen DB alone can't be brute-forced offline
  (`packages/server/src/infra/auth/password.ts:19-37,66-89`).
- **Constant-time:** `DUMMY_PASSWORD_HASH` burns the KDF for an unknown/SSO-only/disabled row — four
  failure shapes collapse to one leak-free null (`domain/sessions/verbs/authenticate.ts:7-22`;
  `password.ts:40-43`).
- **Rate limiting:** per-**IP** DB-backed throttle (`RATE_LIMIT_LOGIN=10`/min floor ⊕ admin override,
  replica-correct via the shared `rate_limit_buckets` table, read fresh per attempt), plus a 4 KiB
  body cap on the unauthenticated CPU-heavy endpoint (`entry/http/auth-routes.ts:50-59,205-239`).
- **Admin bootstrap:** declarative `OWNER_HANDLES`/`OWNER_GROUP` + boot `seedOwner` with the DDL
  singleton index `users_single_owner_unique` and the moved-key migration
  (`entry/boot/seed-owner.ts`; `packages/db/src/schema/users.ts:73`).
- **Reset:** admin `resetPassword` verb; **no self-service email reset** (we have no SMTP either).
- **Cookie:** `__Host-orb_session` + HttpOnly + Secure + SameSite=Lax on **every** mint path
  (`auth-routes.ts:42,113-116`).

### 1.3 Local gap table

| # | Capability | Open WebUI | Orbweaver | Verdict | Security stance |
| - | - | - | - | - | - |
| L1 | Password KDF | bcrypt cost-12 (lib default, unpinned), no pepper (`OW:utils/auth.py:174-175`) | scrypt 2¹⁵ pinned + salt + `SESSION_SECRET` pepper (`password.ts:24-89`) | **ALREADY-BETTER** | Pepper defeats offline brute-force of a stolen DB; explicit cost pin can't drift |
| L2 | Enumeration timing | placeholder-hash floor (`OW:models/auths.py:20-23`) | dummy-hash floor (`authenticate.ts:16`) | **PARITY** | Both defeat CWE-208 |
| L3 | Email verification | **none** (verified absent) | none (email is not an identity key — `schema/users.ts:41-44`) | **ALREADY-BETTER by design** | For them unverified email is the W1 takeover key; for us it's a non-key attribute |
| L4 | Signin rate limit | per-**account** rolling window, 15/180s (`OW:routers/auths.py:90`) | per-**IP** 10/min DB-backed (`auth-routes.ts:50-59`) | **IMPROVE (B1)** | Different axes — see B1; ours misses the distributed-attack-on-one-account case |
| L5 | Lockout | none (rolling limit, no hard lock) | none (rolling limit) | **PARITY** | Both correctly avoid a victim-lockout DoS |
| L6 | Password reset | admin-only, no email flow | admin-only, no email flow (`admin/verbs/reset-password.ts`) | **PARITY** | Consistent — neither has SMTP |
| L7 | First-user → admin | post-insert `get_num_users()==1` (`OW:routers/auths.py:862`) | declarative `OWNER_HANDLES` + DDL singleton | **ALREADY-BETTER** | Ours is idempotent + not "whoever logs in first" |
| L8 | Cookie flags on local path | httponly=True (`OW:routers/auths.py:200`) | `__Host-`+HttpOnly+Secure+SameSite (`auth-routes.ts:42`) | **ALREADY-BETTER** | `__Host-` prefix + Secure; theirs lacks the prefix |
| L9 | Admin create-user role authority | `add_user` admin endpoint, role from form (`OW:routers/auths.py:1081`) | `createUser`: minting `admin` is **owner-only**, `user` is admin-gated, owner never mintable (`admin/verbs/create-user.ts:30-55`) | **ALREADY-BETTER** | Closes the create/set-role privilege asymmetry |

---

## 2. LDAP

### 2.1 Their flow (`OW:backend/open_webui/routers/auths.py:471-706`)

Security checks first: `ldap.enable` (`:479`), `ENABLE_PASSWORD_AUTH` (`:482`), and an
**empty-password rejection** before any bind (RFC 4513 §5.1.2 unauthenticated-simple-bind defense —
their comment at `:489-492`, code `:493-494`). Then: TLS config → app-account bind (`:530-538`) →
search the user by `(&(username=<escaped>)<filter>)` (`escape_filter_chars`, `:557`) → read
`username`/`mail`/`cn`/groups → **re-bind as the user with their password** to actually authenticate
(`:632-641`) → resolve the app row.

- **Row linking: BY EMAIL.** `Users.get_user_by_email(email)` (`:643`); JIT-create if missing
  (`:644-678`) with the same post-insert first-user-admin bootstrap (`:661-663`). **There is no
  LDAP-stable-id binding** — the account is keyed on whatever the `mail` attribute returns.
- **Group mapping:** extract each group CN from its DN (`extract_group_cn_from_dn`, `:615`), then
  `create_groups_by_group_names` + `sync_groups_by_group_names` (`:689-696`) — the same group-name
  model as OIDC.
- **Deprovision:** none via LDAP (no removal on absent group; sync only adds/reconciles present ones).

### 2.2 New finding — L-W1 · LDAP links by unverified email, no bind-once · MEDIUM–HIGH

*This is W1's class via a different key.* The OIDC path at least tries `sub` first; **LDAP has no
equivalent — it links on `mail` unconditionally, always** (`OW:routers/auths.py:643`). There is no
`isSubjectMismatch`-style guard on this path at all.

*Exploit surfaces:* (a) an LDAP directory where a user's `mail` attribute can be set to a victim's
address (admin-set in most directories; self-set in some) → the attacker binds as themselves but lands
on the victim's app row; (b) **cross-method collision** — an OIDC-provisioned user with
`email=alice@corp.com` and an LDAP user whose `mail` is `alice@corp.com` **resolve to the same app
row**, so enabling LDAP beside OIDC lets an LDAP bind authenticate into an account created by OIDC,
governed entirely by the mutable email attribute. The row's OIDC `sub` binding is simply bypassed —
the LDAP path never consults it.

*Ours:* no LDAP. The forward-header mode (`AUTH_MODE=forward-header`) covers the "a proxy asserts
identity" deployment that most LDAP-behind-authentik/Authelia setups actually use, and it funnels
through `provisionIdentity` → the bind-once guard applies. **ALREADY-BETTER by absence** — but the
lesson is L-W1: *if we ever build a native LDAP arm, it must produce a `ResolvedIdentity` with a
stable directory id as `externalId` (e.g. `entryUUID`/`objectGUID`) and go through `provisionIdentity`
— never link on `mail`.*

---

## 3. SCIM (`OW:backend/open_webui/routers/scim.py`)

### 3.1 Their flow

Static bearer-token auth, **constant-time** compare (`hmac.compare_digest`, `OW:scim.py:272`), gated
on `ENABLE_SCIM` (default false) + `SCIM_TOKEN` (`:260-276`). Standard SCIM 2.0 CRUD over `/Users`
and `/Groups`.

- **Provisioning (`POST /Users`, `:563-645`):** dedup by `externalId` via `find_user_by_external_id`
  → **409** (`:571-578`); dedup by email → **409** (`:588-594`); else insert at `role='user'` if
  `active` else `role='pending'` (`:617`), then store `externalId` in the `scim` JSON column
  (`:627-631`).
- **Linking policy — the crossover (`find_user_by_external_id`, `:319-327`):** match the `scim`
  column first, then **fall back to `Users.get_user_by_oauth_sub(provider, external_id)`**. So a SCIM
  `externalId` is *deliberately* matched against the OIDC `sub` when `SCIM_AUTH_PROVIDER` equals the
  OIDC provider name — the intended cross-link (SCIM push-provisions the row, OIDC logs the user in,
  **same row, keyed on the stable IdP id**).
- **Deprovision — TWO semantics:**
  - **soft:** `active:false` via PUT/PATCH → `role='pending'`, and it **refuses to demote an existing
    admin** (`:684`, their comment: a routine sync must not strip a locally-granted admin) — a genuinely
    good belt;
  - **hard:** `DELETE /Users/{id}` → `Users.delete_user_by_id` — an **irreversible hard delete** of
    the user and their data (`:778-808`).

### 3.2 Answering the coordinator's SCIM questions

- **Does it repeat the email-merge rebind (W1)?** **No.** SCIM `create` **refuses** an email
  collision (409, `:588-594`) instead of rebinding. It is the safest of their provisioning paths.
- **Is its external-id linking safer or weaker than OIDC?** **Safer.** It links on the stable
  `externalId`/`sub`, and on a collision it refuses rather than rebinds. It never touches the mutable
  email as an identity key for matching (email is only a *duplicate* check, and that check refuses).
- **Provisioning + deprovisioning semantics:** provisioning is bind-on-stable-id + refuse-on-collision
  (good). Deprovisioning is dual — soft (reversible, admin-protected) and hard (destructive,
  unprotected). The hard-delete-from-IdP is the hazard (§3.3).

### 3.3 New findings

- **S-W1 · SCIM `externalId` has no UNIQUE constraint · LOW.** `scim` is a plain JSON column
  (`OW:backend/open_webui/models/users.py:75`), exactly like `oauth` — dedup is app-level (the 409
  check), not DDL-enforced. A concurrent create or a direct write could produce two rows sharing an
  `externalId`; nothing at the storage layer forbids it. *Ours:* `users_external_id_unique` partial
  index makes a duplicate stable id **unrepresentable** (`packages/db/src/schema/users.ts:66`).
  **ALREADY-BETTER.**
- **S-W2 · SCIM DELETE is a destructive hard delete · MEDIUM (operational).** An IdP that issues a
  `DELETE` on a deprovision — a routine SCIM lifecycle event, or an offboarding automation
  misfire — **irreversibly removes the user and cascades their data** (`OW:scim.py:793`). There is no
  soft-delete-on-DELETE option. *Ours:* our deprovision equivalent is `admin.setEnabled(false)` —
  **soft, reversible, re-checked every request** (`domain/sessions/verbs/validate.ts:18`), and we
  expose no IdP-driven hard-delete at all. **ALREADY-BETTER** — and the lesson if we ever build SCIM
  is: map SCIM DELETE to `enabled=false`, never to a row delete.

---

## 4. Cross-method summary — their fragmentation, one table

Every path re-implements JIT insert, first-user-admin, and (where relevant) group sync, and each picks
its **own** answer to "an identity collides with an existing account":

| Path | Identity key it links on | Collision policy | Bind-once? | Receipt |
| - | - | - | - | - |
| OIDC callback | `sub`, then **email → rebind** | **REBIND** (silent) | **No** | `OW:oauth.py:1891-1899` |
| token-exchange | `sub`, then **email → rebind** | **REBIND** | **No** | `OW:routers/auths.py:1669-1676` |
| LDAP | **email only** | JIT / land-on-row | **No** | `OW:routers/auths.py:643` |
| trusted-header | **email only** | JIT | n/a (proxy is authority) | `OW:routers/auths.py:743-757` |
| local signup | email *is* the account | 400 EMAIL_TAKEN | n/a | `OW:routers/auths.py:908-909` |
| SCIM create | `externalId`/`sub`, email as dup-check | **409 REFUSE** | **Yes (create)** | `OW:scim.py:571-594` |

Five copies of `get_num_users()==1 → admin`; three copies of the group-name sync; **two different
answers to the same account collision** (OIDC rebinds, SCIM refuses). The bind-once discipline exists
in exactly one path (SCIM create) and is absent from the two an external attacker can actually drive
(OIDC, token-exchange). **A control that isn't in every path isn't a control** — the attacker picks
the path without it.

---

## 5. The unification audit — do all four modes funnel through the one seam?

The sharp question is not "could we unify" — we already have the structure OW lacks: one exhaustive
`MODE_RESOLVERS` dispatch (`infra/auth/dispatch.ts:31-36`, invariant #4 — a 5th mode fails `tsc`), one
`Principal` mint (`entry/auth/seam.ts`), one external-identity linking verb (`provisionIdentity`). The
question is **whether every one of the four modes actually routes identity resolution + provisioning
through that verb, or whether any mode has a side-path that mints/links a user OUTSIDE it** — the way
OW's SCIM/LDAP/OIDC each carry their own.

**I traced all four modes to their user-row-touching site.** Result:

| Mode | Resolver | Carries an EXTERNAL claim? | Where a user row is minted/linked at login | Through `provisionIdentity`? |
| - | - | - | - | - |
| **oidc** | `resolveOidc` → cookie/null (`modes/oidc.ts:10-12`) | **Yes** (ID-token claims) | callback → `provisionIdentity` (`entry/http/auth-routes.ts:369`) | **YES** — bind-once applies |
| **forward-header** | `resolveForwardHeader` → `via:"header"` (`modes/forward-header.ts:32-46`) | **Yes** (header/JWT: handle+uid+groups) | seam → `provisionIdentity` (`entry/auth/seam.ts:169`) | **YES** — bind-once applies (null-subject scope caveat, `provision-identity.ts:60-68`) |
| **local** | `resolveLocal` → null (`modes/local.ts:11-13`) | **No** — the row pre-exists | login route: `authenticate` (verify only) → `sessions.create` (`auth-routes.ts:228-236`); rows come from boot `seedOwner` + `admin.createUser` | **N/A** — no external claim to link |
| **single-user** | `resolveSingleUser` → null (`modes/single-user.ts:13-15`) | **No** — owner fallback, handle-only, `externalId=null` | seam owner-fallback → `ensureUser` (`seam.ts:161-167`) | **N/A** — no external claim to link |

**The finding: every mode that resolves an EXTERNAL identity funnels through the one
`provisionIdentity`/bind-once seam. The two that do not carry no external claim, so they have no
linking decision to duplicate.** This is the exact inverse of OW's fragmentation (§4), where three
paths each link an external identity under three different (and two absent) guards. We have ONE linking
door, reached by exactly the two modes that need it.

`provisionIdentity` is the single home for the bind-once guard, the `OIDC_ALLOWED_GROUPS` gate, role
derivation, owner-flip adoption, and the singleton reconcile (`provision-identity.ts:35-43,70-72,
277-320`). Local login is *separate by design* and correctly so: it resolves no external claim — the
row already exists (boot-seeded or admin-created), so `authenticate` only verifies a password
(`authenticate.ts:12-24`); single-user JITs the owner row by handle with `externalId=null`, gated on a LOOPBACK TCP PEER (#298 f2, 2026-08-19 — the old Host-origin gate is gone; the peer set widens ONLY by the explicit `AUTH_FALLBACK_TRUSTED_PEERS` opt-in, 2026-09-18).

### 5.1 The one nuance, reported honestly — the unguarded owner-row FIRST bind

User-row **creation** has three doors — `provisionIdentity.insertNew`, `ensureUser`, and
`admin.createUser` — but only `provisionIdentity` ever writes a **non-null `externalId`** (a binding).
`ensureUser` writes `externalId=null` (unbound, `ensure-user.ts:36`); `admin.createUser` writes a local
row (`externalId=null`, `passwordHash` set, `admin/verbs/create-user.ts:74-85`). A later SSO login can
**adopt** such an unbound row through `provisionIdentity`'s handle fallback — and that IS the intended
bind path: bind-once refuses *rebinding a BOUND row* (`isSubjectMismatch` requires
`existing.externalId !== null`, `provision-identity.ts:70-72`); binding an *unbound* row is the
first-link (this is how single-user→OIDC owner-flip works, `:173-208`).

The single deliberately-**unguarded** case is the **owner row's first bind**: `isSubjectMismatch`
cannot fire when `existing.externalId === null`, and the owner-exemption branch
(`existing.id === ownerId`, `:287-292`) binds the caller's subject onto the owner row and returns
`role:owner` — also bypassing the allowed-groups gate. Its security therefore rests entirely on the
**verified channel's** ability to present the owner's handle (an OIDC `preferred_username` the operator
controls in a single-tenant Authentik, or a proxy-asserted header behind the trusted-peer gate), not on
a runtime guard. This is **documented and owner-ruled** (`provision-identity.ts:263-276` names it as
attack (a) with the manual `external_id = NULL` recovery), and it is **not OW's class**: OW's W1 is an
*unverified mutable-email* rebind of a *pre-existing distinct account*; ours is a *stable-id first bind*
of *the operator's own seeded row* through a *verified channel*. It is defence depth (same category as
"a raw DB write to `users.enabled` on the owner row", `seam.ts:222-229`), not a live hole — but it is
the one place a mode's provisioning is not covered by a runtime guard, so it belongs in this audit.

### 5.2 Corroboration — the A4 fix already exists on one path

The OIDC study proposed A4 (tolerant groups-claim parsing: accept a separator-joined string, not only
an array). **`forward-header` already does exactly this** — `groupsFromClaim` splits on `|`/`,`
(`modes/forward-header.ts:14-28`) — while the OIDC claim mapper still accepts only an array
(`auth-routes.ts:432-433`). The pattern is proven in-tree; A4 is just applying it to the second claim
site. This strengthens A4 from "borrow from OW" to "match our own forward-header behavior."

### 5.3 The rule to keep (U1)

*Any future auth method that resolves an external identity to a local row MUST produce a
`ResolvedIdentity` and pass through `provisionIdentity` — it must never re-implement its own
lookup/link.* Concretely, if we ever add a second IdP, SCIM-style push provisioning, or native
LDAP:

- it hands `provisionIdentity` a `ResolvedIdentity{ externalId, handle, groups, email }` with a
  **stable directory id** as `externalId` (never the mutable email);
- push-provisioning (admin/IdP creates a row before the user logs in) shares `findExisting` +
  `isSubjectMismatch` rather than doing its own email lookup — otherwise the row it creates is a
  bind-once bypass waiting for the first login;
- deprovisioning maps to `enabled=false` (soft, per-request-enforced), never a hard delete.

**What OW's fragmentation teaches us to AVOID:** do not let a new method carry its own linking policy.
OW's SCIM path proves they *know* the safe pattern (stable-id + refuse-on-collision); they just didn't
route the other five paths through it, so the weakest one (OIDC email-rebind) defines their real
takeover surface. Our advantage is structural, not incidental — protect it by refusing to add a
second linking site.

---

## 6. Ranked borrow-list

| Rank | Item | What | Cost | Owner fork |
| - | - | - | - | - |
| 1 | **B1 · per-account signin throttle (a second axis)** | Add a per-**handle** failed-login counter alongside the existing per-IP throttle (`auth-routes.ts:205-239`). Today a distributed attacker (botnet, many IPs) defeats the per-IP cap against a single account; a per-handle rolling window closes that. **Copy OW's rolling-window choice, NOT a hard lockout** — a per-account *lockout* is a victim-DoS (`OW:routers/auths.py:90` is deliberately a limiter, not a lock). Reuse the same DB-backed `rate_limit_buckets` + `createRateLimiter` we already have, scope `login-handle`. | S (~30 LOC + int test) | none |
| 2 | **U1 · document the single-chokepoint rule as law** | Fold §5's rule into the identity spine's "Esoterica" so the next method builder can't miss it: *external identity → `ResolvedIdentity` → `provisionIdentity`, one linking site, stable-id-only, deprovision = `enabled=false`.* No code — a doc edit to `Spine-Identity-and-Auth.md`. | XS (doc) | Confirm the wording belongs in the spine vs the D-ledger |
| 3 | **B2 · (only if native LDAP is ever wanted) link on `entryUUID`/`objectGUID`, via `provisionIdentity`** | Not proposed for build now — recorded as the safe shape so L-W1 is never reintroduced: an LDAP arm resolves a stable directory GUID as `externalId` and funnels through the chokepoint; empty-password rejection (`OW:routers/auths.py:493-494`) and filter-char escaping (`OW:auths.py:557`) are the two of their belts worth copying verbatim. | (deferred) | Do we want native LDAP at all, given forward-header already covers proxy-asserted identity? My default: **no** — forward-header subsumes it |
| 4 | **B3 · (only if SCIM is ever wanted) SCIM DELETE → `enabled=false`; `active:false` admin-protection** | Recorded shape: map SCIM `DELETE` to a soft disable (never a row delete — S-W2), and copy OW's "don't let a sync demote an admin" belt (`OW:scim.py:684`), which for us is already the owner-immutability guard extended to admins. | (deferred) | Do we want push-provisioning at all? |

### Explicitly NOT borrowed

- **Email-merge account linking** in any path (OIDC study W1, and its LDAP twin L-W1). SCIM's
  refuse-on-collision is the pattern we already have via bind-once; we don't need their code.
- **A hard-delete deprovision path** (S-W2).
- **bcrypt / unpinned KDF cost** (L1) — ours is stronger.
- **No-auth dev mode** (`WEBUI_AUTH=False` → hardcoded `admin`/`admin`, `OW:routers/auths.py:774-802`).
  Our `single-user` + loopback-peer-gated owner-fallback is the equivalent and does not ship a guessable
  credential.

---

## 7. First-run bootstrap + auth-mode switch (the owner's #8 pain)

Two flows the owner asked to mine specifically: how the VERY FIRST account is born + becomes admin,
and what happens to EXISTING accounts when the operator turns on / switches auth mode later.

### 7.1 First-run — their flow

There is no single "first run" in Open WebUI; the first admin can arrive **three ways**, and first-run
IS different from later signup (open registration, then auto-locked):

1. **Env-seeded at boot.** If `WEBUI_ADMIN_EMAIL` + `WEBUI_ADMIN_PASSWORD` are set, startup calls
   `create_admin_user` (`OW:backend/open_webui/main.py:349-352`), which **skips if any user exists**
   (`has_users()`, `OW:backend/open_webui/utils/auth.py:548-550`), inserts directly at `role='admin'`
   (`:524-556`), and then persists `ui.enable_signup=False` (`OW:main.py:352`).
2. **The onboarding screen.** `onboarding = not await Users.has_users()` is served on the config
   (`OW:main.py:2094-2096,2150`); the frontend flips the auth card to "Create Admin Account"
   (`OW:src/routes/auth/+page.svelte:405-407`). The first signup goes through the normal
   `signup_handler`, which post-insert promotes `get_num_users()==1 → admin` and sets
   `ui.enable_signup=False` (`OW:routers/auths.py:862-865`). `ENABLE_INITIAL_ADMIN_SIGNUP` lets that
   first signup through even when the login form is disabled (`OW:routers/auths.py:899`).
3. **First SSO / LDAP login.** Same post-insert `get_num_users()==1 → admin` bootstrap
   (`OW:oauth.py:1984-1989`; LDAP `OW:routers/auths.py:661-663`).

So first-run = **open registration for exactly one account, which auto-becomes admin, after which
signup auto-locks.** `admin` is NOT a singleton — multiple admins are a normal, supported state.

**The race.** The defended race is two concurrent first-signups. Their mitigation: insert at the
default role FIRST, then check `get_num_users()==1` (`OW:routers/auths.py:844-864`), rather than
checking an empty table before insert (which would let both become admin). But there is **no DB
constraint** enforcing "exactly one admin" (admin is a plain role), so the mitigation only *narrows*
the window — it does not close it. Interleaving: `insert A commit → insert B commit → count A sees 2 →
count B sees 2` promotes **neither**, leaving a box with two `pending`/default users and no admin until
an operator uses the env-seed or `ENABLE_INITIAL_ADMIN_SIGNUP` recovery. Narrow, but real, and
structurally unavoidable without a uniqueness constraint.

### 7.2 First-run — ours

Our owner is a **declarative singleton, DDL-enforced, seeded at boot** — there is no "whoever signs up
first" and no open-registration window:

- `seedOwner` runs at boot (`entry/boot/seed-owner.ts:84-122`): ensures the `OWNER_HANDLES` row exists
  at `role='owner'`, self-heals a disabled owner, and (AUTH_MODE=local) seeds `LOCAL_INITIAL_PASSWORD`
  once, guarded by `isNull(password_hash)` (`:124-142`; env `foundation/env/index.ts:158,325`).
- **Race-safety is a DDL invariant, not a check-then-write.** `users_single_owner_unique` is a partial
  unique index over `role='owner'` (`packages/db/src/schema/users.ts:73`) — a second owner row is
  **unrepresentable**, so no interleaving can produce two owners *or* zero. `ensureUser` re-reads after
  its `onConflictDoNothing` and **fails loudly** rather than returning a fabricated id if the insert hit
  that index (`domain/sessions/verbs/ensure-user.ts:12-19,42-47`). Boot is a single process, so there
  is no concurrent-first-signup race to begin with.
- `single-user` mode: the owner row is JIT-created by the loopback-peer-gated fallback →
  `ensureUser(ownerHandle)` → `determineRole(handle,[]) → owner` for the `OWNER_HANDLES` handle
  (`entry/auth/seam.ts:161-167`; `role-policy.ts:95-98`). No password, no signup.

### 7.3 First-run gap table

| # | Capability | Open WebUI | Orbweaver | Verdict | Security stance |
| - | - | - | - | - | - |
| FR1 | First-admin origin | open registration → first user auto-admin, then locked (`OW:routers/auths.py:862-865`) | declarative `OWNER_HANDLES`, boot-seeded (`seed-owner.ts:84-122`) | **ALREADY-BETTER** | No open-registration window; owner is not "whoever got there first" |
| FR2 | Race-safety | post-insert `count==1`, no constraint — window leaves 0 or 2 admins (`OW:routers/auths.py:844-864`) | DDL partial-unique + loud-fail re-read (`schema/users.ts:73`; `ensure-user.ts:42-47`) | **ALREADY-BETTER** | Two owners / zero owners both unrepresentable |
| FR3 | Env-seeded admin | `WEBUI_ADMIN_EMAIL`/`_PASSWORD` (`OW:main.py:349-352`) | `LOCAL_INITIAL_PASSWORD` for the `OWNER_HANDLES` owner (`seed-owner.ts:124-142`) | **PARITY** | Both seed from env, once, idempotent |
| FR4 | First-run UX | onboarding "Create Admin Account" screen (`OW:+page.svelte:405-407`) | none — owner seeded from env; login shows the normal form/redirect | **IMPROVE (B4)** | A local-mode first-run setup screen beats requiring `LOCAL_INITIAL_PASSWORD` in env |
| FR5 | Post-bootstrap lock | `ui.enable_signup=False` persisted (`OW:main.py:352`) | N/A — no self-signup exists to lock | **ALREADY-BETTER** | Nothing to leave accidentally open |

### 7.4 Mode-switch — their flow (the switch-on takeover trigger)

Open WebUI has no single `AUTH_MODE`; methods are independent toggles, so "switching on SSO" means
**enabling OIDC/LDAP beside an existing local-user population.** The consequential moment is those
users' NEXT login through the newly-enabled method:

- **OIDC, merge ON:** sub-lookup misses (the local row has no OAuth sub) → `OAUTH_MERGE_ACCOUNTS_BY_EMAIL`
  links by email and **rebinds** the sub onto the local row (`OW:oauth.py:1894-1899`). This is **W1**,
  and the mode-switch is precisely when it fires most — sub-misses-but-email-hits is the *normal* state
  for every pre-existing local account. Any IdP identity presenting a local user's email takes that
  account over.
- **OIDC, merge OFF:** sub-lookup misses → signup path sees the email already taken → **400
  `EMAIL_TAKEN`** (`OW:oauth.py:1951-1953`). The local user is **locked out of SSO** — they must keep
  using their password; there is no link path at all.
- **LDAP:** always links by email (`OW:routers/auths.py:643`), so enabling LDAP silently merges every
  local account whose email matches an LDAP `mail` — **L-W1**, no opt-in, no verification.

So the switch-on choice is **take-over-by-unverified-email (merge on) or orphan (merge off)**. There is
no safe, stable-id-based migration of an existing local account onto an SSO identity.

### 7.5 Mode-switch — ours

We flip a single `AUTH_MODE` (single-user/local → oidc/forward-header). The owner path is solved
db-surgery-free; the non-owner path has an honest gap.

- **Owner (SOLVED, task #8).** `tryAdoptUnboundOwner` binds the OIDC subject onto the existing
  **unbound** owner row instead of minting a second (`provision-identity.ts:173-208`). It keys on
  **owner POLICY** (`isOwnerByPolicy`: `OWNER_GROUP` membership OR handle ∈ `OWNER_HANDLES`,
  `role-policy.ts:81-87`), so it works even if the owner's IdP username differs from the seeded owner
  handle — as long as they match by group or handle policy. Guarded three ways (needs a subject, needs
  the owner row still unbound, bails if the subject already lives on another row). **No DB surgery.**
- **Non-owner local user (the honest edge).** Traced: on the first OIDC login, `findExisting` matches
  by externalId (miss) then by **handle** (`provision-identity.ts:35-43`). If the OIDC
  `preferred_username` **equals the local handle**, it hits the unbound local row; `isSubjectMismatch`
  can't fire (`existing.externalId === null`, `:70-72`), so `updateExisting` **binds the subject onto
  the existing row** and the user **migrates cleanly, keeping all their data** (`:89-91,314-318`) —
  db-surgery-free — provided they also pass the `OIDC_ALLOWED_GROUPS` gate. **But if the OIDC username
  ≠ the local handle, `findExisting` misses entirely → `insertNew` mints a NEW row → the old local row
  (and everything under it) is orphaned.** And because flipping to `oidc` unregisters the local
  password route (`authenticate` is wired only when `AUTH_MODE==='local'`, `entry/lifecycle.ts:370-372`),
  that user **cannot fall back to their password** — they are locked out of their old data.
- **No in-app remedy for the mismatch case.** There is **no admin verb that sets `externalId` or
  renames a `handle`** — the admin surface is create-user / set-role / set-enabled / reset-password /
  list / sessions (`domain/admin/verbs/`); `externalId` appears only in read-side views/queries, never a
  setter. So the mismatch case's only fix today is DB surgery — the exact thing task #8 wanted to avoid,
  solved for the owner but not for non-owner locals.

### 7.6 New finding — MS-W1 · the switch-on bind window · MEDIUM (ours) / HIGH (theirs)

The mode-switch turns every pre-existing handle into an **unbound row adoptable by the first login that
presents it**. This is the (b) class already documented at `provision-identity.ts:263-268`, but the
mode-switch is its **bulk trigger**: right after the flip, every local handle is guessable and
first-login-bindable.

- **Theirs (HIGH):** gated on **unverified email** (merge on) — an attacker needs only an IdP identity
  carrying the victim's email. This is W1/L-W1 at population scale.
- **Ours (MEDIUM, defence-depth):** gated on the **verified channel** — an attacker needs to present the
  victim's *handle* as their OIDC `preferred_username` (operator-controlled in single-tenant Authentik)
  or a proxy-asserted header behind the trusted-peer gate. Not a runtime-guarded case (binding an
  unbound row is intended), so it rests on IdP account control, not on `isSubjectMismatch`. Materially
  stronger than theirs, but it IS the window an operator should close by switching modes *before*
  exposing the OIDC callback, and by pre-seeding `externalId` on known accounts (B5).

### 7.7 Ranked borrow-list (first-run + switch)

| Rank | Item | What | Cost | Owner fork |
| - | - | - | - | - |
| 1 | **B5 · admin "link SSO identity" verb (set `externalId` on a row)** | The db-surgery-free fix for the non-owner mismatch case (§7.5) AND the pre-close for MS-W1: an owner/admin-gated verb that stamps a **stable subject** onto an existing local row, so the user's first SSO login hits by `externalId` directly (no handle-guess, no orphan). MUST take a stable id, never an email; MUST refuse a subject already bound elsewhere (reuse `isSubjectMismatch`). This generalizes the owner-flip adoption to non-owners **safely**, keyed on the stable id the admin vouches for. | M (~40 LOC verb + admin surface + int tests) | **Yes.** Is admin-vouched SSO linking wanted, or is "handle must equal IdP username" an acceptable operator contract? My default: **build B5** — it is the only db-surgery-free path for non-owner locals and closes MS-W1's window deliberately. |
| 2 | **B6 · boot warning when flipping to SSO with local users present** | At boot under `oidc`/`forward-header`, if any `users` row carries a `passwordHash` (a pre-existing local account), warn that accounts whose IdP username ≠ handle will orphan unless linked (B5). Cheap operator tell; mirrors the forward-header fail-closed boot warn already at `entry/lifecycle.ts:376-380`. | S (~15 LOC) | none |
| 3 | **B4 · local-mode first-run setup screen** | Instead of requiring `LOCAL_INITIAL_PASSWORD` in env, let the first unauthenticated visit to a fresh local box set the owner password once (gated on "owner row has null `password_hash`", the same guard `seed-owner.ts:131-134` uses). Mirrors OW's onboarding without their open-registration race (our owner is already the seeded singleton — this only sets its password). | M (~50 LOC + CT) | Minor: is env-seed sufficient, or is a setup screen wanted for non-container deploys? |

### 7.8 Explicitly NOT borrowed (switch)

- **Email-based account merge on switch-on** (W1/L-W1) — B5's stable-id linking is the safe replacement.
- **Open-registration-then-lock first-run** (their FR1) — our declarative seeded singleton is stronger;
  do not add a self-signup path just to mirror the onboarding screen (B4 sets a password, it does not
  open registration).

---

## 8. Honest floors — what I did not read or verify

- **Their `Groups` model internals** (`create_groups_by_group_names` / `sync_groups_by_group_names` /
  the permissions blob) — read where LDAP/OIDC call them, not end to end. G8's "no app-groups for us"
  verdict rests on D65, unchanged from the OIDC study.
- **The SCIM `/Groups` CRUD** (`OW:scim.py:812+`) — read the auth gate and the `/Users` linking; did
  not audit group provisioning line by line.
- **`ldap3` library behavior** — not installed here; "an app-account bind then a user re-bind
  authenticates the password" is read from their call sequence (`OW:routers/auths.py:530-641`), not
  verified against the library. The empty-password-bind hazard is their own documented rationale
  (`:489-492`), not my independent claim.
- **The `RateLimiter` in-memory fallback's correctness across workers** — I read the class
  (`OW:utils/rate_limit.py:7-60`); I did not test that the memory fallback is per-process (it appears
  to be a class-level dict, so multi-worker deployments would under-count — noted, not verified).
- **The mode-switch non-owner traces (§7.5) are read from source, not live-driven.** I traced
  `provisionIdentity`'s branches for a non-owner unbound row by handle match/mismatch
  (`provision-identity.ts:35-43,89-91,314-318`) but did not run a real single-user→oidc flip against a
  populated DB to confirm the orphan behavior end to end. The "no admin `externalId`/`handle` setter"
  claim is from an exhaustive listing of `domain/admin/verbs/` + a grep showing `externalId` only in
  read-side views/queries — a verb absence, not a live test.
- **OW's first-signup race (§7.1)** is reasoned from the code path (`OW:routers/auths.py:844-864`) and
  the absence of a single-admin constraint; I did not reproduce the interleaving. The "neither becomes
  admin" outcome is the worst-case interleave, not an observed failure.
- **OW's onboarding frontend** — I read the config flag (`OW:main.py:2094-2096`) and the auth-page
  branch (`OW:+page.svelte:405-407`); I did not audit the full onboarding component tree.
- **No live drive.** Every sequencing claim is read from source; nothing was run against a real IdP,
  LDAP directory, or SCIM client.
- **Our forward-header mode in full** — read only where it intersects the bind-once scope note and the
  LDAP comparison; `infra/auth/modes/forward-header.ts` was not audited line by line.
- **Our admin `resetPassword`/`setEnabled` verbs** were confirmed to exist and were read for
  `createUser`/`setRole`; I did not re-read every admin verb body.
