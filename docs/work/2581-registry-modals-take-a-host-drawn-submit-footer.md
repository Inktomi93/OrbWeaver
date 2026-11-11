---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Registry modals take a host-drawn submit footer

## What

The registry modal path has no explicit-submit owner, so the add-document, imagine and plugin command argument bodies each build their own footer. ModalDefinition gains an explicit-submit footer the host draws and those bodies use it. The plugin command body sits in the plugin area; sequence it after the plugin host branch.

## Why

With no owner for a commit, each body builds its own footer and they differ.

## Done when

Those bodies build no footer, and the host's footer is tested on the phone sheet and on the centered dialog.

## Evidence

Filled at landing: what ran and where its output is.
