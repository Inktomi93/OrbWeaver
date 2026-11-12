---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: line-length on the rails and Characters, Chat, Config

## What

The design audit rule line-length fails in the desktop-1440-all-panes-evidence walk on the rails, Characters, Chat and Config, mostly on Text runs, plus collapsible bodies, the Refinery undecided note, the file dropzone and wire section glosses. Run: surface-pvpOKI under ~/.local/state/orbweaver/surface-walk; each case's agent-cases file lists every subject.

## Why

Prose wider than the reading measure is harder to read; the design system owns the measure tokens (--reading-measure, --reading-measure-prose) for this.

## Done when

The line-length finding is fixed at the shared owner by giving prose its measure token, shown by a component test that mounts each named production surface and runs this rule through the testkit's design audit, red today and green after, with no whole walk needed, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
