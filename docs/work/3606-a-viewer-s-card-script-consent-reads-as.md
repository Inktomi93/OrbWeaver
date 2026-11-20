---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: chat-html-and-presets
---

# A viewer's card-script consent reads as no when their settings cannot be read

## What

When a user's settings blob fails its schema, the versioned-config parse returns the defaults (packages/contracts/src/versioned-config/index.ts), and packages/server/src/domain/settings/verbs/load-user-settings.ts returns only the config and drops the unreadable flag. The card-frame mint reads the viewer's run-card-scripts switch through it, so a viewer who turned card scripts off gets them run once any other field of their blob goes bad.

## Why

The switch is a privacy consent; an unreadable blob must mean no, never the default yes.

## Done when

The card-frame wiring reads the unreadable flag and treats card scripts as off for that viewer; an integration case stores a schema-rejected blob for a member with scripts off, mints an interactive card and gets the static posture.

## Evidence

Filled at landing: what ran and where its output is.
