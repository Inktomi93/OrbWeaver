---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: pane-ink on Config

## What

The design audit rule pane-ink fails in the desktop-1440-all-panes-evidence walk on Config. Examples: Config: checkpoint config/personas-Your personas-landing at \[data-slot=config-content]. Runs: surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The pane-ink finding is fixed at the shared owner on these surfaces, shown by a component test that mounts each named production surface and runs this rule through the testkit's design audit, red today and green after, with no whole walk needed, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Triage (local lane cb-q2): real. On 19 Config group landings (about, personas, world info) the content ends at about a third of a 952px content pane (pane-ink floor 0.45, tooling/src/ui-audit/lib/checks-structure.ts:177-200). The rule's own header names the fix a design decision; shrinking the region breaks the content surface's scroll geometry (config-content-surface.tsx). Needs a rendered look before a fix: the landing either earns the height or the pane sheds it.
