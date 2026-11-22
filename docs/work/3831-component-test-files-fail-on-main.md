---
kind: bug
status: open
updated: 2026-11-22
priority: P2
area: client
plan: test-foundation
---

# Component test files fail on main

## What

A targeted run on main fails cases in chats-with-character-title-floor, platform-chat-arrival.suite, config-collection-retry, config-scroll-spy-goto, first-boot-boxes, platform-settings-composition.suite, regex-delete-focus, preset-editor-phone-reach and preset-row-delete (all under tests/client/features). Several fail with 'list row has no list-row-title-qualifier'. The same files fail on the test-bases branch. tests/e2e/event-sequence.spec.ts also fails on main in two order-of-operations cases (opening a chat attaches on the one POST socket; a rename's chatUpdated frame and room list refetch).

## Why

A red component suite on main blocks the push barrier and hides new breaks.

## Done when

Each failing case is traced to the change that broke it, fixed at the root in production or in a stale test, and the nine files pass on main.

## Evidence

Filled at landing: what ran and where its output is.
