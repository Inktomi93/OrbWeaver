---
paths:
  - packages/server/src/entry/**
  - packages/server/src/transport/**
  - packages/server/src/foundation/**
  - packages/server/src/infra/auth/**
  - packages/server/src/infra/network/**
  - tests/server/transport/**
---

# Server edge and security

## Routers and transport

- A new tRPC router or procedure needs a PROBED or EXEMPT(reason) row in
  `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`; the sweep fails on an unclassified
  procedure. A procedure with no foreign id is not automatically EXEMPT. Probe it with a marker or a
  two-distinct-value seed. An owner-scoped update or void-returning write also needs a post-sweep
  re-read of the owner's row; the sweep's marker-leak check proves read authority only.
- A new router or procedure also needs three coupled sites in the same change: the `transport/trpc/
  context.ts` Services member, the `router.ts` mount, and the compose services key-count test
  (`tests/server/entry/compose/services.test.ts`). Miss one and the router is unreachable or the count
  test fails.
- The client turn surface (`transport/trpc/stream/**`) is bus-driven: send/swipe/continue carry no read
  data. Advance a resume cursor at delivery, never at enqueue, so a shed frame stays replayable.

## Cookies and auth

- A `__Host-` cookie cannot be cleared over plain HTTP. The clearing Set-Cookie needs its own `Secure`
  attribute string. Give each cookie name its own attribute string and read only the active name.
- Never send `post_logout_redirect_uri` to the OIDC end-session endpoint without `id_token_hint`
  (`entry/http/auth-routes.ts`). Authentik 400s before invalidating the session.
- A gate that admits a custom header or an ambient session is only as CSRF-safe as the session case.
  Enumerate mutating routes by registration, not by the gate's own doc.
- A route serving a document with its own response CSP adds its path prefix to `servesOwnPolicy`
  (`entry/http/security-headers.ts`), gated on the actual response header, never a context flag.
- In `entry/rate-limit-gate.ts`, guards run in order and each later guard only fires if the earlier ones
  did not throw. A test on guard N is vacuous unless every earlier guard passes. Drive a path where the
  earlier buckets succeed so guard N is the one that actually refuses.
- Derive the SSRF egress control (`infra/network/egress.ts`) from owner-scoped rows resolved
  server-side, never a caller role check. Check the never-admissible range set both at the allowlist
  entry and again on the resolved address; a resolved address can only subtract admission, never add it.
- Cross-domain op caller scope is enforced by the `injected-op-caller-param` gate.

## Compose wiring

- When a new domain wires into `entry/compose`, sweep it for a stub op (`Promise.resolve`-style)
  written "until this domain exists" and naming that domain. It goes stale silently once the domain
  lands, because verb-level tests inject their own fake predicate and never catch it.

## Debug and observability

- `/api/_debug` reads are principal-blind whole-db reads that cross boundaries tRPC refuses even to the
  owner. Price any admission change to it separately from app-plane authority.
- An authz port for `/api/_debug` answers from the already-resolved request context and never
  re-resolves identity from bare headers. Bind the request user in the observability middleware, where
  the ALS request scope is open, never at auth-resolution time.
- A wire capture missing from a `/api/_debug` read may be captured but uncorrelated, not missing: the
  ring write and the read's correlation filter are separate coverage questions. Scan the capture spill
  by surface, backend and chat id before concluding no sink fired.

## Env and config

- A worktree has no `.env`, so every env key resolves to its zod default. Check `.env` presence before
  trusting a lane's boot-time env failure (`foundation/env/**`).
- A schema default whose only effect is a boot fatal is fail-dead, not fail-closed. When a security
  default forces a check at more than two sites, ask what it actually prevents.
