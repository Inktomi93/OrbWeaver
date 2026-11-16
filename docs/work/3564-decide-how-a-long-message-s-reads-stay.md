---
kind: decision
status: open
updated: 2026-11-16
priority: P2
area: chat
plan: chat-html-and-presets
---

# Decide how a long message's reads stay off the viewer's main thread

## What

A row's readers walk the whole message text on every mount, and the older readers in message content have no length bound. A very long message freezes the viewer's tab while they run. The options are a per-message-version cache of the reads, a cheaper scanner, a worker, or sliced work; the research and the measurements are in reports/research/long-message-read-freeze.md.

## Why

The panel read bound makes an abusive message fail closed, but the cost below the bound and in the unbounded readers is still paid on every mount.

## Done when

The owner picks an approach from the research, the readers are measured at the bound to name the slowest, and the chosen fix lands with a cost row that holds under load.

## Evidence

Filled at landing: what ran and where its output is.
