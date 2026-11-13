---
kind: bug
status: doing
updated: 2026-11-13
priority: P2
area: client
lane: wt/agent-a26edb67fcc42f1e4
plan: cross-surface-consistency
---

# An open room deleted elsewhere lands on the chat list

## What

A room that is open when another session deletes it stays fully readable and usable through idle time and a section switch; a send then shows two failure alerts. The landing built for a deleted room reacts only in the read boundary's error render in `packages/client/src/features/chat/surfaces/message-list-surface.tsx`, which never fires while cached data exists, so only a room that is already gone on load lands on the list.

## Why

A user keeps typing into a room that no longer exists and learns it only when a send fails twice.

## Done when

With a room open and idle, a delete from another session lands this session on the chat list with no user action and no reload; a send racing the delete shows one notice; a component test deletes from a second caller while the room is mounted.

## Evidence

Filled at landing: what ran and where its output is.
