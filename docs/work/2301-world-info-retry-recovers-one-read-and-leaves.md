---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a88fe4fa1ec4fa014
plan: cross-surface-consistency
---

# World Info Retry recovers one read and leaves a second failure behind on the phone shell

## What

In the Config read-recovery case on the phone at 200% and 300% text, after Retry the config content still shows one query-error state where the recovered scenario expects none.

## Why

A recovered read still tells the user something failed.

## Done when

After Retry no query-error remains in the config content at 200% and 300% on chromium-phone-portrait; Config read recovery passes its recovered checkpoint there.

## Evidence

Filled at landing: what ran and where its output is.
