---
kind: work
status: open
updated: 2026-10-19
priority: P2
area: tests
plan: test-mirror
---

# OIDC e2e project runs on an HTTPS mock issuer

## What

Add an e2e project with AUTH_MODE=oidc on its own ports: an HTTPS mock issuer the server child trusts, loopback egress and private-endpoint entries, authorize, token and JWKS endpoints with RS256 id_tokens that echo state and nonce, the OIDC settings, signup with an invite, and global-setup seeding. The requirements are listed in reports/review/963-flow-ct-inventory.md.

## Why

The OIDC pending-join CT case has no e2e home until the project exists.

## Done when

The OIDC pending-join case runs as an e2e spec and its CT case is deleted.

## Evidence

Filled at landing: what ran and where its output is.
