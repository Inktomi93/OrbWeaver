---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: connections
---

# A key check revokes only the key it sent

## What

The key check at add and on a saved connection strikes the stored key on a rejection without tying the verdict to the key material the request carried. A key replaced while the check is in flight can be struck by the old key's answer.

## Why

A good replacement key reads as rejected until the next check.

## Done when

A rejection strikes the stored key only when it is still the key the check sent, and a test replaces the key mid-check.

## Evidence

Filled at landing: what ran and where its output is.
