---
kind: adr
status: active
updated: 2026-11-07
---

# Forward-header keys and claims come from the operator

## Context

The forward-header signed path skips the trusted-proxy peer gate, so whatever verifies a token decides who signs in, the owner included. A key source a request can name lets the caller sign any identity. One identity provider also signs tokens for several applications with one key set, so a valid signature alone does not say the token was meant for this application.

## Decision

The signed path trusts only the operator's env. `FORWARD_AUTH_JWKS`, an https URL or a JWKS literal, is the only key source. The server reads no key, key set or key URL from a request, and `ForwardJwtVerifyArgs` has no key field. With `FORWARD_AUTH_JWKS` set under `AUTH_MODE=forward-header` and `FORWARD_AUTH_VERIFY_JWT` on, `FORWARD_AUTH_JWT_ISSUER` and `FORWARD_AUTH_JWT_AUDIENCE` are required, and `refineEnv` in `packages/server/src/foundation/env/record/index.ts` refuses the boot without them. Every token must match both and carry an `exp` claim. `jwtVerifyOrNull` in `packages/server/src/infra/auth/jwks.ts` is the one verification site. The `FORWARD_AUTH_JWKS` URL host joins `envEgressAllowlist`, because the operator named it.

## Consequences

An operator on the signed path sets three env lines. A deployment with verification off changes nothing. A proxy whose token has no `aud` or no `exp` cannot use the signed path; it uses the trusted-proxy path. A key removed at the provider stays trusted until the key cache ages out. A failed key fetch refuses sign-ins until the provider answers.

## Alternatives rejected

A per-request key header with a host allowlist: an allowlist cannot narrow the path on an allowed host, and the caller still picks the keys. Issuer and audience as optional settings: an unset value admits every application on the provider, and making them required later is a second breaking upgrade. Audience alone: a provider in per-application issuer mode separates by issuer, and one in global issuer mode separates by audience, so both are needed.
