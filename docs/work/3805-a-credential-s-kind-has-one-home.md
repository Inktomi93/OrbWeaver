---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: security
plan: unwired-code
---

# A credential's kind has one home

## What

Whether a key is an API key or an OAuth token comes from the provider row's auth (packages/contracts/src/inference/builtin-providers.ts). credentials.add.metadata is never sent by the client, kindOf in packages/server/src/domain/credentials/verbs/resolve.ts derives ResolvedSecret.kind from it, and every backend reads only credential.secret; one test reads the kind.

## Why

A second, unused home for the credential's auth kind can disagree with the provider and mislead a future reader on a credentials path.

## Done when

A security-builder change removes the metadata input and the kind or derives the kind from the provider auth, with the credentials suites passing.

## Evidence

Filled at landing: what ran and where its output is.
