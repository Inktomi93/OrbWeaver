---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Containment rules resolve the actual primitive instead of its JSX name

## What

The containment selectors in `tooling/src/eslint/ui-feature-policy.ts` trust names such as Container, Section, Stack and a Dialog or Drawer suffix. The surface-purity check in `tests/client/feature-layout.suite.test.ts` uses a literal JSX-name pattern. Resolve supported imports and aliases so recognition follows the actual containment owner.

## Why

A renamed primitive can escape a name-based restriction, while an unrelated component name can appear to provide containment. File-level JSX presence does not prove rendered containment.

## Done when

Add planted alias, namespace and unrelated-name controls before changing the retained rules. Preserve real dialog anchors and the documented inside-surface anchor form. Reconcile current sites without baselines. Distinguish static identity checks from runtime containment proof; qualify affected rendered geometry without claiming arbitrary render-path analysis.

## Evidence

Filled at landing: what ran and where its output is.
