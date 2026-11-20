---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: chat-html-and-presets
---

# Framed, archived and streaming rows show the trust and held-card notices

## What

The script-dead and held-card notices mount on routed card and reply frames only. Rows drawn through the framed layout branch of the message body, archived game cards in packages/client/src/features/rpg/lib/archived-cards.ts, and the ghost row while a reply streams show neither notice.

## Why

A user who meets a dead card or held game markup in one of those rows gets the same silent failure the notices exist to end.

## Done when

Each of those rows mounts the same notices under the same conditions, and component tests cover each row kind with and without the condition.

## Evidence

Filled at landing: what ran and where its output is.
