---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: chat
plan: unwired-code
---

# Optional turn, refinery and list inputs have no sender

## What

The server accepts and reads these router inputs, and no client, plugin or tooling call sends them: previewAssembly guided, refinery iterate guidance, startChat injections, commitMessage personaId and attachmentAssetIds, impersonateStream personaId, forceCharacterTurn guided (plugin turns reach chat through the plugin requestTurn op, not this router), getMessageWindow limit and notifications.list limit (the query library fills only the cursor), editImage n, refinery updateSession patch name and status, and refinery updateSchema patch stage.

## Why

Each input either is forgotten wiring or is dead, and a sent-looking procedure hides that its keys never arrive.

## Done when

Each input has a sender with a test that drives it, or it is removed from schema, params and verb together; affected suites pass.

## Evidence

Filled at landing: what ran and where its output is.
