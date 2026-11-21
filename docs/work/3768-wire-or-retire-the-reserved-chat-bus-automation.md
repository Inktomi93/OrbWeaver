---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: automation
plan: unwired-code
---

# Wire or retire the reserved chat-bus automation triggers

## What

LIVE_TRIGGERS in packages/contracts/src/automation/index.ts marks messageHidden, messagesDeleted, chatUpdated, wiEntryAttached and wiEntryDetached not live, and validate.ts refuses them.

## Why

Trigger names a rule cannot use sit in the vocabulary.

## Done when

Each trigger is wired with a dispatch test or removed from the vocabulary.

## Evidence

Filled at landing: what ran and where its output is.
