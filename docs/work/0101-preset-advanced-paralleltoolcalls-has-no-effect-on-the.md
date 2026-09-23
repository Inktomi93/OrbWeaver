---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: inference
---

# preset advanced.parallelToolCalls has no effect on the agent-sdk wire

## What

The preset field `advanced.parallelToolCalls` (packages/contracts/src/preset/index.ts) is read by the openai-compat runner (packages/inference/src/backends/openai-compat/chat.ts) and the anthropic-messages runner (packages/inference/src/backends/anthropic-messages/chat.ts). No file under packages/inference/src/backends/agent-sdk reads it.

## Why

On an agent-sdk connection the setting silently has no effect, and nothing tells the user their preset knob is inert.

## Done when

Either the preset editor marks the field as not applying on agent-sdk wires, or it is filed as a knob-wire-coverage row and closed there, or an owner ruling accepts the gap because the SDK exposes no control for it.

## Evidence

Filled at landing: what ran and where its output is.
