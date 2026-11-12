---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A plugin's standing in a room requires its installer to be enabled at delivery

## What

`createPluginChatAuthority` checks presence only. A member disabled after the event fan-out checks them and before the queued delivery runs lets that plugin run once.

## Why

A disabled account's plugin still acts in the room for one delivery.

## Done when

The delivery-time check reads the enabled lookup, and a test disables the installer between fan-out and delivery and sees no run.

## Evidence

Filled at landing: what ran and where its output is.
