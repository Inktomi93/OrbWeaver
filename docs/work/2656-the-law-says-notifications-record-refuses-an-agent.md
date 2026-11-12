---
kind: work
status: open
updated: 2026-11-12
priority: P2
area: security
plan: checked-law
---

# The law says notifications.record refuses an agent recipient and no guard exists

## What

`docs/law/Core-0-Architecture-and-Structure.md` states that `notifications.record` refuses an agent-principal recipient. `packages/server/src/domain/notifications/context.ts` and `service.ts` say the D60 guard is design of record and not built. Read D60 and its build-state rider, then either build the refusal with a test, or make the law sentence carry the rider in the words D60 uses.

## Why

The law claims a refusal the code does not perform, so a producer that hands an agent an inbox passes every check.

## Done when

Either a test at the notifications mirror shows `notifications.record` refusing an agent-principal recipient, or the Core-0 sentence states the guard as unbuilt under D60's rider and the code comments agree with it.

## Evidence

Filled at landing: what ran and where its output is.
