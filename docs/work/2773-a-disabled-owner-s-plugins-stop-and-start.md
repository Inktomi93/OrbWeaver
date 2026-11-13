---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A disabled owner's plugins stop, and start again on re-enable

## What

A plugin already loaded when its owner is disabled stays loaded, holding memory and its broker share while every entry into it is refused. It starts again only at the next boot after the owner is enabled.

## Why

An idle loaded plugin costs memory for no use, and a re-enabled owner waits for a restart to get their plugins back.

## Done when

One hook on `admin.setEnabled` stops and starts the owner's plugins with a test of both directions, or a decision record rules the next boot as the trigger.

## Evidence

Filled at landing: what ran and where its output is.
