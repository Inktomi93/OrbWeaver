---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: chat
---

# Give chat assembly role names consistent meanings

## What

Use distinct canonical names for system-inclusive message roles and user-assistant wire roles in chat assembly.

## Why

WireRole currently denotes different role sets across neighboring assembly modules.

## Done when

Role names unambiguously identify their membership. Preserve dispatch and assembly behavior with affected tests.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
