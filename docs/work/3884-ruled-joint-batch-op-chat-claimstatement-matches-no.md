---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
---

# Ruled joint-batch op chat.claimStatement matches no port member

## What

JOINT_BATCH_RULINGS (tooling/src/eslint/port-ownership/ruled-ops.ts) lists { owner: "chat", op: "claimStatement" } under D337. jointBatchRulingOf keys only on port members (member name, label, alias chain; restated-port.ts rulingKeysOf). claimStatement has only ever been a parameter name (emitChecked's claimStatement?, packages/server/src/domain/chat/contract/context.ts, since 0334b53a46); the row was added in e07c036230 and has never matched. Found by the bloodhound registry check (reports/api-play/bloodhound/registries.ts), which reads every { path, name } and { owner, op } exemption through the checker: 37 read, this one stale.

## Why

An exemption that matches nothing is dead config, or it hides a site the rule misses: either the handle it was written for crosses through a parameter the rule cannot key on, or the row is a leftover.

## Done when

Either the row is removed, or the rule keys the parameter the ruling meant and a test pins it; the registry check reports zero stale entries.

## Evidence

Filled at landing: what ran and where its output is.
