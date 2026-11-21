---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: automation
plan: unwired-code
---

# The room activity log names the rule that fired

## What

FireView (packages/contracts/src/automation/index.ts) carries ruleId on every row of automation.listChatActivity, and room-activity-log.tsx shows only the outcome, trigger and time.

## Why

A host reading the activity log cannot tell which rule acted.

## Done when

Each activity row names its rule from the rules read the same panel already holds and opens that rule; a fire of a deleted rule says so; a CT covers a named and a deleted rule.

## Evidence

Filled at landing: what ran and where its output is.
