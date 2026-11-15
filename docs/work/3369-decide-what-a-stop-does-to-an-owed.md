---
kind: decision
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: cross-surface-consistency
---

# Decide what a Stop does to an owed reply that has produced no text

## What

A queued reply stopped before it produced any text is put back in the queue, so the next drain generates and bills the reply the member cancelled. It also fails one host handoff with a prompt to accept again. This predates the Stop-keeps work, and a test pins it as today's behaviour.

## Why

Stop means the reader does not want that reply.

## Done when

A recorded ruling says whether a Stop on an owed reply with no text drops the debt or keeps it, and the code and the pinned case follow it.

## Evidence

Filled at landing: what ran and where its output is.
