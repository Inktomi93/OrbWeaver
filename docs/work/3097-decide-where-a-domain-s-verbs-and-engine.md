---
kind: decision
status: open
updated: 2026-11-15
priority: P2
area: server
plan: typed-enforcers
---

# Decide where a domain's verbs and engine reach an I/O-bearing subsystem once substrate is pure

## What

Core-0 §4 calls substrate pure, yet the policy `domain-substrate-mediates-subsystems` makes substrate/ the only legal mediator from verbs and from one subsystem to another. The mediated subsystems reach the database: automation engine/dispatch.ts imports its persistence, and chat assembly/world-info/pool.ts imports @orb/db tables. So packages/server/src/domain/automation/substrate/run-now\.ts, packages/server/src/domain/chat/substrate/turn-access.ts and packages/server/src/domain/chat/substrate/assembly-access.ts do I/O through their imports. Recommended ruling: the composition root (service.ts or context.ts) builds the subsystem ops and injects them into the verbs and the engine as deps, the mediator files are deleted, and policy `domain-substrate-no-io` adds a to-path for the domain's own named subsystems and service.ts. Core-0 §4 must change in the same commit. Its template line '<subsystem>/ NAMED internal subsystems, substrate-mediated' becomes 'composition-injected', and the policy comment 'verbs receive them through substrate injection' becomes 'verbs receive them from the composition root'. A dependency-cruiser reachable rule cannot express the law, because reachable rules cannot skip type-only edges and would flag every `import type { Db }`.

## Why

While substrate mediates subsystems that do I/O, policy `domain-substrate-no-io` passes and the folder still performs I/O. The fix moves product code in automation and chat: the verbs, the chat engine pipeline and engine, and assembly/shape.ts. That is too large for a rules lane and reverses a stated template line.

## Done when

A ledger ruling names the home for verb-to-subsystem and subsystem-to-subsystem calls. Core-0 §4 and the policy comments state it. The work item that applies it lists every importer of the mediator files.

## Evidence

Filled at landing: what ran and where its output is.
