# Proposed: session-token rotation on privilege transition (`sessions`)

> **Status: deliberate non-behavior + a trigger condition.** Extracted from the gutted
> `domains/sessions.md` (the one section neither code nor a core doc carried). Everything else about the
> built `domain/sessions` lives in the code: `packages/server/src/domain/sessions/` file headers, the
> schema (`packages/db/src/schema/sessions.ts`), `@orb/contracts/{identity,session}`, and the per-verb
> test suites under `tests/server/domain/sessions/`.

## The current posture (deliberate — do not "fix")

There is **no session-id rotation** on login or privilege change today, and that is a considered call,
not an omission:

- The token is 32 random bytes minted **server-side, AFTER an authenticated mint**
  (`verbs/create.ts`) — there is no pre-auth session id an attacker could fixate.
- The cookie is `__Host-`-prefixed + HttpOnly + Secure + SameSite=Lax
  (`entry/http/auth-routes.ts`), so it cannot be planted cross-site or from a subdomain.
- Privilege transitions are **admin-driven** (`admin.setRole`, owner-gated per D17) — the user whose
  role changes never drives the transition from their own session, and `validate` re-reads `role` from
  the `users` row every request anyway, so the new role is live on the next request without a re-mint.

## The trigger (when this stops being fine)

If a **user-driven privilege step** is ever added — impersonation exit, MFA step-up, any role
self-grant — the session that crossed the privilege boundary must not keep its pre-transition token.

## The design (when triggered)

A `create` + revoke pairing inside `domain/sessions`: at the transition, MINT a fresh session for the
user (`create`) and atomically revoke the old one (`revokeByToken`), with the route swapping the cookie.
Both halves already exist as verbs; the new piece is only the transactional pairing + the call site at
the privilege-transition verb. No schema change needed.
