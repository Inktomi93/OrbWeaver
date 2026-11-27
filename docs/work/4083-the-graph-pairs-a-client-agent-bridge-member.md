---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The graph pairs a client agent-bridge member with snap's restated contract

## What

OrbNavCapabilities.chatPositions is read by snap (tooling/src/snap page validation), which D357 counts as product, but the graph does not pair the client member with snap's restated contract in tooling/src/snap/contract/map.ts, so it reports the member sent-only.

## Why

A product read the graph cannot pair turns into a false finding a cleanup would delete.

## Done when

The graph pairs the client bridge members with snap's contract, the member reads as read, with a red-first case.

## Evidence

Filled at landing: what ran and where its output is.
