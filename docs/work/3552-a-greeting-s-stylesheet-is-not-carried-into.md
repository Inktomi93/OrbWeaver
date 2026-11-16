---
kind: work
status: open
updated: 2026-11-16
priority: P2
area: chat
plan: chat-html-and-presets
---

# A greeting's stylesheet is not carried into later replies

## What

SillyTavern prefixes a message's stylesheet with a class every message's text carries, so a card's greeting can define classes that later replies use with no stylesheet of their own. Here each reply's frame holds only that reply's stylesheets, so a later reply that writes class-carrying markup alone draws unstyled or does not frame.

## Why

Cards built on that convention lose their look after the first message.

## Done when

A design is ruled: which messages contribute, what then frames a class-only reply, whose trust step gates it in a group room, that a member's message never contributes, and the cost per frame. It is built to that ruling with component tests, and the reliance is measured on real cards first.

## Evidence

Filled at landing: what ran and where its output is.
