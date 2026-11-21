---
kind: work
status: doing
updated: 2026-11-21
priority: P2
area: client
lane: wt/agent-ae2ccce0808e0be03
plan: cross-surface-consistency
---

# Dialog submit failures keep the typed text: one case per listed dialog through the shell

## What

The suites that used the old modal helper still mount dialogs directly instead of through the shell and the opener, and the listed dialogs have no case that fails their submit and checks that the typed text survives.

## Why

This work does not share the commit footer composite, so it was left out of the footer migration.

## Done when

Each listed dialog has a case that fails its submit on the production shell and shows the failure line with the typed text kept, and the suites that used the helper mount through the shell and the opener.

## Evidence

Filled at landing: what ran and where its output is.
