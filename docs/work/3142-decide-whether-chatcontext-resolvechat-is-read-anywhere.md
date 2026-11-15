---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: typed-enforcers
---

# Decide whether ChatContext.resolveChat is read anywhere

## What

ChatContext.resolveChat (ResolveChatConnectionOp, packages/server/src/domain/chat/contract/context.ts) is wired at compose and picked into ChatInferenceOps, but an ast-grep sweep of packages for $X.resolveChat($$$) finds no call (zero hits across the ts and tsx sources). Find a reader by another spelling (destructure, Pick consumer) or delete the op and its wiring.

## Why

An op nothing reads is a false public surface; the consent brand now guards it, but an unread door is a question about intent.

## Done when

Either a production reader of ChatContext.resolveChat is named with its path, or the op and its compose wiring are gone and typecheck passes.

## Evidence

Filled at landing: what ran and where its output is.
