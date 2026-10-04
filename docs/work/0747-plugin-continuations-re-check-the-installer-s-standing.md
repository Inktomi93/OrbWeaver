---
kind: bug
status: open
updated: 2026-10-04
priority: P1
area: plugin
---

# Plugin continuations re-check the installer's standing on every chat write

## What

After the variable read and write gate, three chat-scoped bridge ops still rely on admission-time canWrite for the 45 s continuation window: requestTurn after the installer is demoted runs a turn funded by the new host and skips the non-host ask (bridge.ts near 148; turn.ts WALL 2 only requires membership); surfaceQuickReply emits chips to a chat the installer has left or lost host in (bridge.ts:325, automation-plugin.ts:669-678); notifications.post reaches every present member after the installer has left (bridge.ts:266-273, notification-recipients.ts:27-28). Found by the security recheck.

## Why

A plugin keeps acting in a room for up to 45 s after its installer lost the standing that admitted it.

## Done when

requestTurn and surfaceQuickReply require the installer to still hold host, and notifications.post requires present membership, re-checked in the bridge closure on every call; int tests cover leave and demote for each.

## Evidence

Filled at landing: what ran and where its output is.
