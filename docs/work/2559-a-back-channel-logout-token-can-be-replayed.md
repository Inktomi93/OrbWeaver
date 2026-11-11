---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: security
---

# A back-channel logout token can be replayed until it expires

## What

The OIDC back-channel logout route keeps no record of token ids it has accepted. A replayed logout token ends a session the same user opened after the first delivery, until the token expires. Probes showed it never ends another user's session. A test pins the current behaviour. Source: the security reviews of the route checker branch under reports/review.

## Why

The OIDC back-channel specification asks the receiver to refuse a reused token id, and an attacker who captures one token can keep logging that user out for its lifetime.

## Done when

The route refuses a token id it has already accepted within the token's lifetime, with the store bounded by expiry, and the pinned test changes to assert the refusal.

## Evidence

Filled at landing: what ran and where its output is.
