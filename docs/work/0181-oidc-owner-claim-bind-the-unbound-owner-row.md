---
kind: bug
status: open
updated: 2026-09-25
priority: P3
area: auth
---

# OIDC owner claim: bind the unbound owner row by loopback or a boot claim code, not a handle match

## What

In oidc mode, bind the seeded owner row (external_id null) to an SSO subject only on proof: the callback arrives from loopback (the ownerFallbackAllowed check first-run uses), or the login carries a one-time claim code the server logs at boot while the owner row is unbound. A handle match to OWNER_HANDLES alone stops binding the owner. OWNER_GROUP stays as a claim path.

## Why

Boot seeds the owner row with the handle from OWNER_HANDLES (default "owner") and no subject. Today the first SSO login whose IdP handle matches binds as owner (provision-identity.ts, the unbound-row bind path). On an IdP with open registration, a stranger can register that handle before the owner first signs in and take the box. Local mode closes the same window with the loopback-only one-shot first-run claim. Found by the 0173 pre-build security review. Owner priority: low, because it needs an open-registration IdP and a fresh box. The fix changes the owner-ruled login precedence in provision-identity.ts, so it needs an ADR first.

## Done when

Tests pin: a non-loopback SSO login whose handle matches the unbound owner row, with no claim code, does not bind the owner; a loopback callback binds; a login with the boot claim code binds and the code is then spent; an OWNER_GROUP member still binds. Each is red on the current source first.

## Evidence

Filled at landing: what ran and where its output is.
