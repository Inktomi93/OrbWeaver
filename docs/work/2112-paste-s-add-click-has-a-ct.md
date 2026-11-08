---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-ab8f7f48d0abd71fe
plan: cross-surface-consistency
---

# Paste's Add click has a CT

## What

Add document's Paste body has no CT for the Add click: changing its submit button to type=button leaves every CT green, because Enter in the Name field submits anyway.

## Why

A broken click path passes every component test today.

## Done when

A CT fills Name and Text, clicks Add, checks the document lands through caller.databank.list, and fails when the button is type=button.

## Evidence

Filled at landing: what ran and where its output is.
