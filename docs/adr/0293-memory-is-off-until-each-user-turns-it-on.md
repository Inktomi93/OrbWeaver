---
kind: adr
status: active
updated: 2026-10-03
supersedes: docs/adr/0036-memory-global-with-user-opt-out.md
---

# Memory is off until each user turns it on, behind a cost confirm

## Context

Memory summaries run on a Utility model, and on a hosted provider every summary is a billed call. D36 ruled where the switch lives but recorded no default and no consequence. The owner ruled that Memory stays off by default, so no account spends on summaries it never asked for, and that the moment a person turns it on is where the cost is stated.

## Decision

Memory has two switches and no per-chat column. The global one is `AppSettings.memoryDefaults.mode`, where `off` disables Memory for every user; there is no separate boolean. Under it sits each user's own switch, `UserSettings.memory.enabled`, which defaults to `false` and degrades to `false` on a malformed value (`memorySchema` in `packages/contracts/src/settings/index.ts`). A user's chats build memory only when both allow it.

Turning the user switch on passes a confirm (`packages/client/src/features/chat/components/memory-on-confirm.tsx`). It states the cost, names the Utility model that pays or says that none is ready, and offers to build memory for existing chats now through the Memory backfill job, sized by the server's own call count (`workloads.estimateModelCalls`). Declining the backfill leaves each existing chat to build at its next reply. Turning Memory off asks nothing.

## Consequences

A new account has no memory and spends nothing on summaries until its user turns Memory on. Turning it on never starts a paid run silently: the backfill is an explicit choice with its size shown. An import offers the same choice for the chats it wrote. The corpus backfill honours each host's switch, so a sweep skips a host who has Memory off rather than building for them. A test that needs memory must turn the user switch on; the default fixture has it off.

## Alternatives rejected

Memory on by default: every account would pay for summaries before anyone chose them. A per-chat memory column: a third switch with no owner ruling behind it, and a sweep that must read every chat's row. Turning Memory on without a confirm: the cost would surface only on the provider's bill.
