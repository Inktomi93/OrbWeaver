---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: test-foundation
---

# Credentials CT files each carry their own scripted server, root and list mount

## What

add-connection-limits, add-model-on-key-limits and connections-list-no-dial under tests/client/features/credentials/components each declare a scripted external server, a fresh server root and a mount of the Connections list story, with small differences.

## Why

A second copy of a harness shape drifts; a change to the root options or the story door is made three times.

## Done when

One shared node-world helper builds the root and the story mount for the credentials CT files, and each file passes only its scripted server.

## Evidence

Filled at landing: what ran and where its output is.
