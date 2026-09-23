---
kind: decision
status: blocked
updated: 2026-09-23
priority: P3
area: plugin
blocked: owner
---

# Decide whether plugin-frame wires the U4 hostCall relay

## What

packages/client/src/features/plugin/components/plugin-frame.tsx documents the missing `hostCall` prop as a fail-closed default pending U4, and no mount passes it today. A separate design note describes plugin frames as pixels-only by security posture, with no host-call bridge.

## Why

The shipped code's header and the design intent disagree on whether the host-call relay is still meant to be wired.

## Done when

The owner rules whether frames stay pixels-only as a standing rule or the U4 hostCall relay gets wired; the ADR or the code header is corrected to match.

## Evidence

Filled at landing: what ran and where its output is.
