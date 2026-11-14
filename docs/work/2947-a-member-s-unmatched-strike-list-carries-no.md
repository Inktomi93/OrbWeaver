---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A member's unmatched-strike list carries no strike ids, proven

## What

The memory view gives strike ids to the host only, on items and on unmatched strikes (`packages/server/src/domain/chat/memory/strikes.ts`). The member case asserts null ids on items only; no case lists an unmatched strike to an unfloored member.

## Why

A restore is host-only; an id on the member's unmatched list would be the one id a member could still read.

## Done when

A composed-root case leaves a strike unmatched (its endpoint message deleted) and asserts the unfloored member's unmatched entry has a null id while the host's has the id; red with the id given to every caller. The member case also asserts a null strike id on a strike carried by another copy.

## Evidence

Filled at landing: what ran and where its output is.
