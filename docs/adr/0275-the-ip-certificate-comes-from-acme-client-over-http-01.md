---
kind: adr
status: active
updated: 2026-09-27
---

# The IP certificate comes from acme-client over HTTP-01

## Context

Leg C of easy sharing gives a port-forwarded host https at its public IP address. Let's Encrypt issues an IP address certificate only under the `shortlived` ACME profile, about 160 hours, and validates an IP identifier (RFC 8738) only through HTTP-01 or TLS-ALPN-01. The app had no ACME client, no TLS listener and no certificate store. D255 rules that `https` is only a trusted hop's assertion. `node:crypto` cannot build a CSR, so every option needs an ASN.1 library for that step.

## Decision

The server gets and renews the certificate through the `acme-client` package (MIT, publishlab), pinned exactly in the workspace catalog, through its low-level API only: `createAccount` with the terms agreed, `createOrder` with one `{ type: "ip" }` identifier and `profile: "shortlived"`, `getAuthorizations`, the HTTP-01 challenge, `finalizeOrder` with a CSR, and `getCertificate`. Its `auto()` is never used, because it types every identifier as dns and drops the profile. The CSR comes from the library's `crypto.createCsr`, whose `@peculiar/x509` backend writes an IP SAN as a GeneralName iPAddress, the same tag its legacy forge backend writes; the forge backend makes only RSA keys, and the keys here are ECDSA P-256.

The challenge is HTTP-01, served by a listener of its own that opens on the owner's challenge port only while one challenge is pending and answers only `GET` or `HEAD` on that challenge's exact token path; everything else is a 404. The router forwards port 80 there, so port 80 never exposes the app. TLS-ALPN-01 is not used, because HTTP-01 works with one more forwarded port and keeps the challenge out of the https listener.

The https listener is a separate TLS listener in the server process that forwards each request to the app listener over loopback. It replaces the visitor's forwarding headers with the socket's own address and `X-Forwarded-Proto: https`, forwards only an origin-form request target that carries its own Host, frames every body explicitly (chunked when the visitor chunked it, else its validated length) whatever the method, and opens one upstream connection per request. It forwards to the app's loopback origin (`loopbackOrigin`: `127.0.0.1` for an unset or `0.0.0.0` bind, `[::1]` for an explicit `::`), never the bound interface address. A `BIND_HOST` of one named interface takes no loopback connection, so the app also listens on the loopback address of that family at the same port (`loopbackCompanion`, opened by the lifecycle and closed with the app listener); the share relay uses the same origin. That listener binds loopback only, so it admits no peer a wildcard bind would not, and every loopback-gated grant still refuses a request that carries a relay tell. The app therefore still reads `https` only from a trusted hop, and D255 stands unchanged.

The owner's choice is the owner-gated AppSettings field `ipCertificate` (address, https port, challenge port); null is off. Only the local sign-in mode with a claimed owner may take it, because the https listener delivers every visitor from a loopback peer, which forward-header trusts to name the user. The address must be a public unicast address, and the app listener must be reachable beyond loopback. Every start re-runs those checks, the boot start included. The account key, the certificate and its key are owner-only files in the data layout's `secrets/` slot. A renewal runs at half the certificate's life, backs off from 15 minutes doubling to 6 hours on failure, and never starts in the last hour before expiry. Expiry closes https. A failed first order and an expiry leave plain http serving with the public-http warning.

Homes: `packages/server/src/infra/acme/`, `packages/server/src/infra/network/tls-terminator.ts`, `packages/server/src/infra/crypto/secret-file.ts`, `packages/server/src/domain/share/certificate/controller.ts`, `packages/server/src/domain/share/substrate/renewal.ts`, `packages/server/src/domain/share/substrate/certificate-refusal.ts`, the `ipCertificate` field in `packages/contracts/src/settings/index.ts`. Enforcers: `tests/server/infra/acme/issuer.test.ts`, `tests/server/infra/acme/http-01.test.ts`, `tests/server/infra/network/tls-terminator.test.ts`, `tests/server/domain/share/certificate/controller.test.ts`, `tests/server/domain/share/substrate/renewal.test.ts`, `tests/server/domain/share/substrate/certificate-refusal.test.ts`.

## Consequences

The host forwards two ports: 443 to the https port and 80 to the challenge port. A container publishes both. The first order and every renewal need outbound HTTPS to Let's Encrypt and inbound port 80 from it. That egress runs through acme-client's own axios, outside the egress firewall and `safeFetch`, and honors `HTTPS_PROXY`; it is sanctioned in the header of `packages/server/src/infra/network/egress.ts` because every URL it dials is the constant directory or one the directory names. The box keeps serving plain http on its own port beside https; nothing redirects it. The library's `profile` field is an unread passthrough, so a library upgrade owes a re-run of the issuer test, which reads the order payload off the wire.

A box pinned to one named interface now always has a loopback listener, so every process on the same host, other local users on a shared host included, reaches the loopback-gated grants, as it does under the default wildcard bind.

## Alternatives rejected

- `@certd/acme-client`: it supports the profile and IP identifiers in its `auto()`, but it is a single-maintainer fork with a small user base.
- An in-house ACME client on `node:crypto`: several hundred lines of JWS, nonce and polling code, and it still needs an ASN.1 library for the CSR.
- `@root/acme` and its `acme-v2` and `acme` wrappers: unmaintained since before ACME profiles and IP identifiers.
- `@peculiar/acme-client`: AGPL.
- acme-client's `auto()`: it forces the dns identifier type and carries no profile.
- The HTTP-01 route on the app listener: port 80 would then forward the whole app over plain http to the internet.
- Terminating TLS in the app and reading the socket's `encrypted` flag in `infra/auth/transport.ts`: a second source of `https` beside D255's trusted hop, and the per-visitor address would bypass the one `X-Forwarded-For` resolver.
- The certificate choice as env: the owner makes it from the Share card, and it must survive a restart without an `.env` edit.
