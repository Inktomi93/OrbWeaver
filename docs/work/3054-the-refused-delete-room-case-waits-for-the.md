---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: tests
plan: test-foundation
---

# The refused-delete room case waits for the refusal's notice before the other session deletes

## What

tests/client/features/chat/surfaces/room-deleted-elsewhere.ct.tsx read the draft as proof that the reader's own delete had been refused, but the draft is there before the refusal lands. While that delete is in flight, deleteOwnChat holds the chat as the reader's own, so a delete from another session in that window raises no notice. The case now waits for the delete-failed notice, whose title is CHAT_DELETE_FAILED_TITLE in chat-surface-names.ts.

## Why

On the hosted two-core runner the refusal landed late and the case read a notice count of 0.

## Done when

A refusal held back by the route fails the old case and passes the new one, and the file passes three times in a row pinned to two cores with two workers.

## Evidence

Filled at landing: what ran and where its output is.
