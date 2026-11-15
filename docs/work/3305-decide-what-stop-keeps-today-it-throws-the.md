---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: chat
lane: wt/agent-a7694db56bfbc1d14
---

# Decide what Stop keeps: today it throws the whole streamed reply away without a word

## What

When a reader presses Stop while a reply streams, the whole reply is thrown away: nothing is stored, the row disappears, and no notice says so. The owner ruled that Stop keeps what was written. The text streamed so far is committed as the reply, marked as stopped, and the reader can continue it, swipe it, edit it or delete it like any other reply.

## Why

A reader who stops a long reply to redirect it loses text they were reading and paid for, with no word about it. SillyTavern keeps the partial reply, so a newcomer expects it.

## Done when

A case through the composed root stops a scripted stream part way and reads back a stored reply holding the text streamed so far, with a stopped reason on it and its spend recorded. A stop before any text leaves no empty reply. A CT shows the row stays on screen with the kept text and offers continue. Game state, memory and automation treat the kept reply by one stated rule each, with a case.

## Evidence

Filled at landing: what ran and where its output is.
