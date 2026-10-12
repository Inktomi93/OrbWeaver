---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: server
plan: test-mirror
---

# Parse JSON columns and HTTP bodies at read

## What

Burn down the @orb-waive markers item 900 placed for json-column-read-parsed and the client .json() cast rule. JSON columns read by cast: plugin manifest and granted capabilities (packages/server/src/domain/plugin/persistence/plugins.ts), connection declared, extras and transport (domain/connection/persistence/connections.ts), notification payloads, workload progress and result, character theme and background overrides. Hand-spelled HTTP responses: chat import (entry/http/import-chat.ts against client data/import-chats.ts), auth config (entry/http/auth-meta.ts), auth me (client data/auth-bootstrap.ts), import tree and bundle, card lorebook restore. Mint a contracts schema for each response and parse on both ends.

## Why

A cast at a read boundary trusts stored or wire bytes the type system never checked; the law requires zod parse at every untrusted boundary.

## Done when

No @orb-waive marker naming this item remains; every listed column and response parses through a contracts schema, with a test that a malformed row or body is refused.

## Evidence

Filled at landing: what ran and where its output is.

The auth me schema exists: authMeSchema and AuthMe in @orb/contracts/identity (item 888 lane, 0225b5232e); the server types its response with it and the e2e whoami parses it. Still owed here: the client parse in packages/client/src/data/auth-bootstrap.ts.
