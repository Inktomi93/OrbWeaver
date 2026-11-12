---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: surface-walk
---

# The axe scan excuses a control an open popover covers

## What

`OPEN_POPUP` in `tests/support/browser/accessibility-scan.ts` lists menu and select popups only. The colour field's open popover covers a toggle on the Characters context and look checkpoints and axe reports a target-size finding for the covered control. Evidence: the desktop evidence walk report under reports/cb-walk-evidence.

## Why

A control the person cannot reach while a popover is open is reported as too small, which buries real target-size findings.

## Done when

An open popover's content joins the excusal with its stated reason, a fixture with a popover over a small control passes, a control covered by closed content still fails, and the named checkpoints stop reporting it.

## Evidence

Filled at landing: what ran and where its output is.
