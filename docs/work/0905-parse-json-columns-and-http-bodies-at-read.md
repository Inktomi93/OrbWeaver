---
kind: work
status: doing
updated: 2026-10-13
priority: P2
area: server
lane: codex/contract-boundary-integration-904-905
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

Current-tree salvage is frozen at `143c019c10`, based on `f4a25d17dd`, with independent security review. It preserves integrated ownership-before-private-decoding and mismatch detection. Owned workload, plugin, notification and handoff payloads parse before management effects. Authentication and import responses use genuine contracts doors. Native greeting and legacy field healing policies remain explicit rather than becoming invented refusals.

Composed notification controls prove refusal before private timestamp writes and recipient-bus publication. Unchanged source publishes an owner-mismatched payload onto the foreign recipient's real bus; corrected source refuses. Scoped malformed, valid and foreign-row controls pass. Client import-response controls also pass and fail on unchanged readers. These bounded results do not close the remaining population. Legacy harness retrofits remain excluded.

Current-tree client import-response and harness-target controls pass. Production compiler configs and scoped lint pass. Shared-reader JSON and wire checks report no findings, errors or withheld results; unchanged budgets remain red. Main-native composed boundary cases still require the coherent harness and canonical asset builders. Donor-native controls do not establish that integration verdict.

Schedule start already validates through its canonical parser. Preserve existing enumeration, per-row error classification and advance behavior; an intermediate type assertion does not establish a runtime bypass. No duplicate parser, poison-row healing or scheduler-policy rewrite is authorized by this salvage.

Complete the integrated malformed, valid and foreign-row population before landing this item. No legacy harness retrofit or wholesale stale-branch merge is part of that acceptance.
