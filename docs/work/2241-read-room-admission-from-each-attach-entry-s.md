---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Read room admission from each attach entry's tRPC result

## What

routeOrbSocket counts an attach as admitted from the HTTP status, but trpcError replies with HTTP 200, so awaitRooms can be satisfied by a room the scripted server refused.

## Why

A refused attach can pass a wait that is meant to prove the room joined.

## Done when

Admission reads each entry's tRPC result, with a helper self-test where a refused room does not satisfy awaitRooms.

## Evidence

Filled at landing: what ran and where its output is.
