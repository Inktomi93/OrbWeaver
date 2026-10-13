---
kind: work
status: doing
updated: 2026-10-13
priority: P3
lane: codex/auth-wire-982
---

# Decide the auth config requiresLogin wire field

## What

The auth config response carries requiresLogin, but no client code reads it (packages/client/src/data/auth-config.ts declares it only). Owner ruling: remove it. The route guards moved to me.authenticated on purpose (requiresLogin is false for both single-user and forward-header); delete the field from the server response, the client type and the test fixtures.

## Why

A dead wire field invites fixtures and tests that assert nothing.

## Done when

The field is read by the client or removed from the contract and server.

## Evidence

Filled at landing: what ran and where its output is.
