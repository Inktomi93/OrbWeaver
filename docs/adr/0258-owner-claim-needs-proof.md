---
kind: adr
status: active
updated: 2026-09-25
---

# The owner is claimed with proof, never by a handle match alone

## Context

`OWNER_HANDLES` names the owner's handle, and its default is a guessable word. An `oidc` box makes the first login that matches owner policy the owner: on a fresh box it inserts the first owner row, and on a box that ran `single-user` or `local` first it binds the seeded owner row, which has no subject. On an IdP with open registration, a stranger can register that handle before the owner signs in and take the box. `local` mode closes the same window with the loopback-only first-run claim. The owner delegated approval of this decision to Fable, and the owner-claim design in the work item that asked for it is the ruling.

## Decision

A subject becomes the owner only with proof. A handle match to `OWNER_HANDLES` alone never makes a subject the owner. The proof is one of:

- The OIDC callback arrives from a loopback TCP peer with no relay header. This is the `ownerFallbackAllowed` check that the `local` first-run claim uses.
- The login carries the boot claim code.
- The identity is in `OWNER_GROUP`, which the IdP operator controls.

The rule covers every owner claim in `decideProvision` (`packages/server/src/domain/sessions/substrate/decide-provision.ts`): binding the unbound owner row, adopting it, and inserting the first owner row on a fresh `oidc` box. The owner's own login on a row already bound to its subject claims nothing and needs no proof. A refused claim is the `owner-claim-unproven` deny, and the callback answers it as `not_authorized`.

Binding a subject onto the unbound owner row is a compare-and-swap, whether the login reached the row by a handle match or by adoption. The update writes only while the row has no subject. A login that loses the race to a different subject is refused `account-exists` and is never bound.

An unproven handle claimant is an ordinary identity. It gets no owner exemption from `OIDC_ALLOWED_GROUPS` and no owner role. It inserts no row, so the seed-key handle stays free for the owner.

The boot claim code. While the owner is unclaimed, an `oidc` boot mints a random code and logs the claim URL. Unclaimed means there is no owner row, or the owner row has no subject. The claim URL is the login route on the first `OIDC_REDIRECT_URIS` origin with `?ownerClaim=<code>`. The code lives only in process memory. The login route ties the transaction `state` to the code when the presented code matches. The callback that consumes that `state` spends the code, whether or not the login binds. A restart while the owner is unclaimed logs a fresh code. Home: `packages/server/src/infra/auth/owner-claim.ts`.

Every caller states the proof: `ProvisionIdentityOptions.ownerClaimProven` is required and has no default, so a new SSO caller cannot get handle-based ownership by leaving it out. The `oidc` callback passes the proof it saw (`packages/server/src/entry/http/auth-routes.ts`). `forward-header` passes true (`packages/server/src/entry/auth/seam.ts`), because the trusted proxy is the identity authority there and its handle is the owner's word. Ownership by handle under `forward-header` is right only when the proxy's IdP has closed registration. The pending join passes false: an invite is never owner-claim proof.

Checks: `tests/server/domain/sessions/contract/service.test-d.ts` (an omitted proof is a compile error), `tests/server/domain/sessions/substrate/decide-provision.test.ts`, `tests/server/domain/sessions/verbs/provision-identity.int.test.ts`, `tests/server/entry/http/auth-routes.test.ts`, `tests/server/infra/auth/owner-claim.test.ts` and `tests/server/entry/oidc-owner-claim.suite.int.test.ts`.

## Consequences

An owner who reaches the box through a published container port or a proxy never has a loopback callback, so that owner claims with the boot code or `OWNER_GROUP`. Accepted residual: the claim code sits in the boot log, and the claim URL carrying it can reach a proxy's access log. Anyone who can read either while the owner is unclaimed can claim the box. The code works once, the first login that presents it spends it, and each restart prints a new one; the `/api/_debug` log read is owner-only or `DEBUG_TOKEN`. A code that a login spends without binding needs a restart for a new one. A member's IdP rename onto an `OWNER_HANDLES` seed key, or a look-alike of one, is refused and the row keeps its handle (`isReservedSignupHandle`, as signup and the pending join use). Only the owner row may move onto a seed key. Without that refusal, a member holding the key would become the owner when boot's `seedOwner` resolves the owner row by it after a mode flip. Accepted residual: the loopback proof trusts a request with no relay header, so a reverse proxy on the same host that sends no forwarding header makes every login through it look like the box operator (`packages/server/src/infra/auth/forwarded.ts`). A same-host proxy must send `X-Forwarded-For`. `forward-header` keeps handle-based ownership, which is right only when the proxy's IdP has closed registration; an open-registration IdP behind a forward-auth proxy stays the operator's risk. Accepted residual: an `oidc` login from an origin `OIDC_REDIRECT_URIS` does not name is sent to the configured origin's login page, and a signup invite the browser stored for the first origin does not follow it. Invite links use the share URL or the configured origin, so the case is narrow.

## Alternatives rejected

- Trust the handle match alone: an open-registration IdP hands the box to whoever registers the seed-key handle first.
- Refuse every SSO owner claim until an admin links the row: a fresh box has no admin.
- Keep the claim code on the OIDC transaction row: that needs a schema migration for a secret that lives only as long as the process.
- Let an unproven claimant in as a new member row: that row would hold the seed-key handle and block the owner's own claim.
- Gate `forward-header` the same way: every request there comes from the proxy, so none is a loopback callback, and the proxy already vouches for the handle.
