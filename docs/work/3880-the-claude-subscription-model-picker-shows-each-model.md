---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: inference
lane: wt/agent-ac2c798ce3e21fdef
plan: unwired-code
---

# The Claude subscription model picker shows each model's description

## What

The agent SDK catalog stores each model's description in the mirrored AgentSdkModel and no screen reads it.

## Why

The data is collected from the provider and never shown.

## Done when

The picker shows the description where the models are listed, with a component test.

## Evidence

Filled at landing: what ran and where its output is.
