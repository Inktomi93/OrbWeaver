---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Path/Home Registry: D65

> Split-sibling of `Core-Laws-and-Precedents.md` §7. Slimmed to the standing ruling 2026-07-13 (D66). EXTENDS D17.

---

- **D65** — OIDC group-derived roles: admin is grantable by the owner THROUGH the IdP (`OIDC_ADMIN_GROUPS`, CSV) alongside `admin.setRole` — a new owner-controlled mechanism for the same D17 authority, not a delegation away from it. Orb builds NO app-level groups/group-ACL (no consumer).
  - Role derivation (`domain/sessions/substrate/role-policy.ts`): a login carrying an admin group → `admin`, else `user`; groups read from `OIDC_GROUPS_CLAIM` with nested dot-path support.
  - Login gate: `OIDC_ALLOWED_GROUPS` — a user in none of the allowed groups is DENIED (no JIT `users` row, 401 — distinct from `enabled=false` 403). UNSET = all authenticated users allowed. **Fail-closed:** a missing/unparseable groups claim with the gate set → deny. Admin-group members bypass the gate.
  - Re-derive-on-login: when group governance is ACTIVE (either var set), role re-derives from groups on EVERY login — an IdP group change takes effect next sign-in, and a manual `setRole` grant to someone outside an admin group is WIPED on their next login ("role IS the group"). With neither var set, manual grants survive (legacy).
  - **OWNER INVARIANT (absolute):** the owner is matched by ROW id (`selectOwnerUserId()`), never a role-literal or group match — never denied by the gate, never re-derived or downgraded, even with empty/non-matching groups. Group→admin can never mint a second owner; a second policy-owner downgrades to `user`, never `admin`.
  - `ProvisionResult` is a discriminated `provisioned | denied` union; the entry route mirrors the shape locally (no cross-tier type import). `ResolvedIdentity.email` (+ `users.email`) is a nullable mutable ATTRIBUTE (from `OIDC_EMAIL_CLAIM`/forward-auth header, keep-on-null) — email is NEVER an identity/join key.
