---
kind: decision
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# Decide whether the lenient card reading still cards a naked HTML block once model panels frame

## What

In a room with lenient cards on, a naked block of mostly tagged lines becomes a card with card chrome. Once a model-written panel frames with its reply, the two readings overlap: the lenient one draws the block as a separate card and the frame rule would draw it with the reply.

## Why

The same markup draws differently by room setting, and one reading may be redundant.

## Done when

A ruling recorded in D354 or its successor, and the code follows it.

## Evidence

Filled at landing: what ran and where its output is.
