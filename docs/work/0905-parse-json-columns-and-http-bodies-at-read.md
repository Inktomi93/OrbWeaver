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

No @orb-waive marker naming this item remains. Every listed column and response validates through its canonical schema or owning codec. Tests prove refusal before effects for strict data and preserve explicit canonical field-healing policies; a cast supplies neither proof.

## Evidence

Current-tree salvage at `7248cf4185` repairs every original marker and listed HTTP response boundary. Independent security review confirms the production changes and full auth-config and auth-me producer parsing. Canonical ownership checks precede private decoding; malformed strict payloads refuse before management writes, queue effects or recipient publication.

Current native malformed, valid and foreign-row cases pass on the canonical root, including stored connections, notifications, plugin management, workloads, handoff and portable data. Required cross-tenant and notification compatibility cases pass. Real HTTP auth and existing malformed-body consumer cases pass. The complete original site map distinguishes runtime evidence from erased-type proof.

Canonical greeting and legacy field heals remain intentional owner policies. Scheduler start already validates through its canonical parser; existing enumeration, error classification and advance behavior remain unchanged. No duplicate parser or poison-row policy is introduced.

The latest shared reader reports no JSON or wire findings, consumed waivers, errors or withheld owners. Unused application allowances are removed and the application selection passes. Root diagnostics and whole-application qualification remain separate. The persona export wrapper belongs to the broader boundary inventory, not this original population.
