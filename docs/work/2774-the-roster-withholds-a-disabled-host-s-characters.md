---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: security
plan: authorization-and-visibility
---

# The roster withholds a disabled host's characters, as it does a room with no host

## What

`packages/server/src/domain/chat/verbs/load-participant-views.ts` still dresses a disabled host's characters with names and art references for members. A room with no host falls back to the removed-character label.

## Why

A disabled host has withdrawn consent for members to read their content, and the roster is one more read of it.

## Done when

The roster read goes through `hostConsentOf`, with a test that a member of a disabled host's room sees the removed-character label.

## Evidence

Filled at landing: what ran and where its output is.
