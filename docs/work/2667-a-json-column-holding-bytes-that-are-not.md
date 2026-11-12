---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: server
lane: wt/agent-a672cae2c753c5fe3
---

# A JSON column holding bytes that are not JSON reaches its read seam as unreadable, not as a raw SyntaxError

## What

When `user_settings.config` holds bytes that are not JSON, drizzle's JSON-mode column mapping throws a raw SyntaxError inside `readUserSettings` and `writeUserConfig` before the stored-config guard runs. The write leaves the bytes and answers with an unnamed server error instead of `stored_config_unreadable`. The read throws the same way, so the settings pane never learns the config is unreadable and cannot offer the reset that repairs the row. The class is every JSON-mode column behind a parse-on-read seam: settings, presets and the settings key-value value.

## Why

The repair door exists for a corrupt stored config, and the most plain corruption never reaches it.

## Done when

A settings row and a preset row planted with bytes that are not JSON read as unreadable with the repair door offered, the guarded writers refuse with `stored_config_unreadable` and leave the bytes, each with a test through the production verb, and the fix lives at the column or read seam so every JSON-mode column behind such a seam inherits it.

## Evidence

Filled at landing: what ran and where its output is.
