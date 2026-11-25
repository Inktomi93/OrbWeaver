---
kind: work
status: doing
updated: 2026-11-25
priority: P3
area: security
lane: wt/agent-ae6d85b73986b2b04
---

# The plugin broker bounds each Worker's heap, keeps its heartbeat under load and trusts only its own beats

## What

packages/server/src/infra/plugin-host/broker-entry.ts starts Workers with no resourceLimits; the broker main thread serializes every Worker's frames before the share check and also emits the beat, so Workers looping valid large host calls can starve it into a false broker loss; broker-watchdog.ts trusts any stderr line shaped like a beat; failure paths in process-runtime.ts and broker-watchdog.ts stop by SIGKILL first where the rules say stop by closing IPC.

## Why

A false broker loss halts the plugin host for every owner, and a forged beat hides a Worker's real memory.

## Done when

Each Worker runs under resourceLimits, a case with Workers looping valid large calls keeps the heartbeat inside its window, beats are authenticated so a guest-written line is not one, and failure paths close IPC before any signal, or the item records with a ruling why a path keeps SIGKILL.

## Evidence

Filled at landing: what ran and where its output is.
