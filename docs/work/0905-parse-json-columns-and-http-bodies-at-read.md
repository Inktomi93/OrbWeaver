---
kind: work
status: open
updated: 2026-10-12
priority: P2
area: server
plan: test-foundation
---

# Parse JSON columns and HTTP bodies at read

## What

Burn down the @orb-waive markers item 900 placed for json-column-read-parsed and the client .json() cast rule. JSON columns read by cast: plugin manifest and granted capabilities (packages/server/src/domain/plugin/persistence/plugins.ts), connection declared, extras and transport (domain/connection/persistence/connections.ts), notification payloads, workload progress and result, character theme and background overrides. Hand-spelled HTTP responses: chat import (entry/http/import-chat.ts against client data/import-chats.ts), auth config (entry/http/auth-meta.ts), auth me (client data/auth-bootstrap.ts), import tree and bundle, card lorebook restore. Mint a contracts schema for each response and parse on both ends.

## Why

A cast at a read boundary trusts stored or wire bytes the type system never checked; the law requires zod parse at every untrusted boundary.

## Done when

No @orb-waive marker naming this item remains; every listed column and response parses through a contracts schema, with a test that a malformed row or body is refused.

## Evidence

Security review of branch wt/agent-a90022c3a8927247c at 0ed29a23d2 against main at 4d7b00a6d4 rejects a whole-branch merge. Preserve useful production schemas and parsing changes through an updated-tree salvage, not a wholesale file port.

Current `packages/client/src/data/auth-bootstrap.ts` already parses `authMeSchema` and validates optional authentication bodies. Preserve those paths; the retained branch would restore casts for some bodies.

Confirmed blockers in the retained branch:

- `packages/server/src/domain/connection/persistence/connections.ts` parses private JSON before the runtime checks ownership. A real reader and resolver probe on a disposable database produced `NoConnectionError` for absent and valid foreign rows, but `ZodError` for a malformed foreign transport. The malformed case also omitted the owner-mismatch event. Check ownership before private-payload parsing while preserving identical refusal and mismatch detection.
- `packages/server/src/domain/workloads/persistence/queries.ts` heals malformed progress or result data to `null`; a poison-parameter path returns the raw result. Preserve queue liveness without representing corruption as clean absence.
- `packages/server/src/domain/plugin/persistence/plugins.ts` parses the management projection, but lifecycle and grant consumers still receive raw stored manifest or grants. Parse owned rows before those effects, preserving bundle revalidation and consent checks.
- `packages/server/src/domain/character/persistence/handoff-copy-write.ts` parses the carried background but copies the theme override raw. Validate both before minting the recipient copy; preserve reownership and privacy strips.
- The new authentication-config schema needs an explicit contracts export. Add its genuine public door, not a wildcard or transitional test door.

The fresh-database connection probe passed its controls without network calls or live application data. No public transport exploit or foreign payload disclosure was established. Other boundaries still need focused proof after salvage. Legacy fixture and harness retrofits are not part of that work.
