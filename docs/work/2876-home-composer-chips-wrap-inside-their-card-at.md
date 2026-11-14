---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Home composer chips wrap inside their card at 300% text

## What

On Home, in the Also open and Quick picks chat cards on a phone at 300% text, the compose chips such as Continue, Time skip and New scene paint past their card. The chips are in `packages/client/src/features/chat/components/chat-controls-band.tsx`.

## Why

A chip cut at the card edge cannot be read or pressed whole.

## Done when

A component test in `tests/client/features/home/surfaces/` mounts Home with chat cards at 390px wide and 300% text. It asserts that each compose chip lies inside its card. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
