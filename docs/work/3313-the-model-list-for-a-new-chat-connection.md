---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: connections
---

# The model list for a new chat connection mixes in models that cannot chat

## What

On Google AI Studio the add dialog's model list offers speech, image, embedding, music, robotics, research and computer-use models beside the chat models, with no mark that tells them apart, and shows only the first fifty.

## Why

A first user can pick a model that cannot chat and only find out when the first turn fails.

## Done when

The list for a chat connection shows chat-capable models first or only, and any other model it shows carries a visible capability mark.

## Evidence

Filled at landing: what ran and where its output is.
