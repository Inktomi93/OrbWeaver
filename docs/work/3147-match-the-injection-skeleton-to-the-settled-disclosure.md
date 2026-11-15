---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# Match the injection skeleton to the settled disclosure row

## What

`InjectionsSkeleton` in `packages/client/src/features/chat/components/injections-manager.tsx` reserves a padded stack of label bars; the settled row is a ListRow disclosure whose height was not measured against it.

## Why

The old skeleton was built box for box to stop a measured layout shift on a phone; a mismatched reserve brings the shift back.

## Done when

A CT on a phone measures the skeleton's block size against the settled row's and they match.

## Evidence

Filled at landing: what ran and where its output is.
