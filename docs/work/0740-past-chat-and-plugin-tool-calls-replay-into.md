---
kind: bug
status: open
updated: 2026-10-04
priority: P1
area: chat
---

# Past chat and plugin tool calls replay into later turns

## What

Confirmed: a chat or plugin tool exchange is stored per swipe on message_variants.tool_calls (packages/db/src/schema/chat.ts:526) and drawn as a card, but never replayed into a later turn. History rows carry text only (packages/server/src/domain/chat/substrate/wire-history.ts:369); the only replay is the in-turn loop (packages/server/src/domain/chat/engine/pipeline.ts:1061). The narrator then disowns its own Oracle Deck draws and draws again. The inference side already emits past tool pairs when given them (packages/inference/src/backends/v4/prompt.ts:212).

Owner ruling: match SillyTavern. ST saves each tool invocation as a chat message and replays it as real tool pairs on every later prompt while the connection supports tools (SillyTavern public/script.js:4496, public/scripts/openai.js:621); a stealth tool is never kept or replayed (public/scripts/tool-calling.js:836); the user drops a call by deleting it. Here: replay the active swipe's tool pairs for chat and plugin tools; a plugin tool can declare itself not replayed; deleting or hiding a tool card drops it from the prompt; the history budget trims pairs with their row. RPG keeps its own design: per-swipe rpg_turn_tool_calls rows are display only and game state reaches the prompt through the snapshot macros.

## Why

If tool turns drop from history, every tool-using plugin and RPG round makes the narrator contradict its own transcript and re-bill calls.

## Done when

A turn after a tool turn carries that turn's tool call and result pairs from the active swipe on the wire; a swipe or regenerate swaps them; a tool declared not replayed and a deleted or hidden tool card are absent; fit trims pairs with their row; RPG prompts are unchanged; tests cover each case on the assembled history.

## Evidence

Filled at landing: what ran and where its output is.
