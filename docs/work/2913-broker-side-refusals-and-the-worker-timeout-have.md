---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Broker-side refusals and the Worker timeout have a strike case

## What

The refusal-strike cases script the route refusal the app relays. The refusals the broker raises itself and the Worker-timeout site in `packages/server/src/infra/plugin-host/process-runtime.ts` have no case.

## Why

A change to either source could start charging or excusing a strike with every test still green.

## Done when

Each broker refusal source and the Worker timeout has a server case through the production plugin host that asserts the strike count, each with a control.

## Evidence

Filled at landing: what ran and where its output is.
