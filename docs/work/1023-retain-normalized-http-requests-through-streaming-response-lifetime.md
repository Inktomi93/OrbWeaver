---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
area: network
lane: lane/959-rpg-variants
plan: test-foundation
---

# Retain normalized HTTP requests through streaming response lifetime

## What

Retain the normalized Request and its native controller until the outgoing response physically closes. Release them with the existing owner.

## Why

Collection of the normalized Request removes native abort forwarding while its streaming graph remains active. Peer disconnect then fails to stop the graph.

## Done when

A native collection control fails on the old owner and passes with retention. Physical close stops the graph, release permits collection, and genuine stream faults remain failures.

## Evidence

Filled at landing: what ran and where its output is.
