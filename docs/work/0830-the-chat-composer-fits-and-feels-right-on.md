---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: client
lane: wt/agent-af33eeddd3db84319
---

# The chat composer fits and feels right on a phone

## What

Owner report: the chat composer area feels cramped on iPhone 14 Pro Max (Chrome). Check composer layout, alignment and spacing under --mobile.

## Why

The composer is the most-used control on a phone.

## Done when

Composer layout, alignment, spacing and touch targets are correct under --mobile with snap evidence before and after; affected CT passes.

## Evidence

Owner ruling after a SillyTavern side-by-side on iPhone: keep the two-row composer, tab bar (the recorded tab-bar ruling stands), button sizes and text margin. On phones, move the plugin badge and Plugin panels bar off the transcript foot, hide the Next reply line, and fix the sticky message header band that covers message text.
