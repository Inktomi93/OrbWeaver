---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: chat
---

# A real user can find the manual bot trigger in the app

## What

Simple send (`packages/client/src/features/chat/components/composer-utility-menu.tsx:340`) and Make X speak next (`member-row-menu.tsx:58`) both exist, and a real pair of users could not find either. The gate for Simple send is an empty composer (`:187,342`), not a message count. Decide where each belongs and make both discoverable.

## Why

A user who wants to trigger a reply by hand has no visible way to do it.

## Done when

Both controls are reachable from a visible surface, and a rendered pass finds them without instruction.

## Evidence

Filled at landing: what ran and where its output is.
