---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: contracts
plan: unwired-code
---

# Single-domain verb types leave @orb/contracts for their domain contract

## What

packages/contracts/src/automation/index.ts declares ListRulesParams, DeleteRuleParams and GlobalVariableView, which only the automation domain's verbs and queries use. packages/contracts/src/character/index.ts, chat/owner-ops.ts and chat/seat-ops.ts hold more verb Params; those named in an injected op type another domain calls (ChatScopedParams, AddCharacterToChatParams) cross a domain boundary and stay.

## Why

@orb/contracts holds shapes that cross a boundary; a type one domain uses alone belongs in that domain's contract/, where the shapes scan reads it as a per-verb type.

## Done when

Every verb type in the four files is checked for users outside its own domain; each single-domain type moves to its domain's contract/params.ts or results.ts and its importers follow; each kept type has a deliberate.ts entry naming the cross-domain op it serves; the affected typecheck worlds and suites pass and the orchestrator reruns pnpm unwired shapes.

## Evidence

Filled at landing: what ran and where its output is.
