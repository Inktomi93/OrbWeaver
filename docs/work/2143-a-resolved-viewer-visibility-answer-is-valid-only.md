---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: security
---

# A resolved viewer visibility answer is valid only for its own chat

## What

A viewer visibility answer resolved for one chat can be passed to another chat's canon read. A guest's own-room answer then returns the other room's pre-join line and its unstripped hidden span. Tie each answer to the ChatId it was resolved for, and refuse it at read for any other chat.

## Why

No production path passes an answer across rooms today, but the type does not stop it, and one wrong call would leak hidden content to a guest.

## Done when

A canon read given an answer resolved for another chat refuses it, with an integration test that passes one room's answer to another room's read and sees the refusal.

## Evidence

Filled at landing: what ran and where its output is.
