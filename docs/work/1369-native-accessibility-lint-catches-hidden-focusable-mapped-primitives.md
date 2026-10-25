---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Native accessibility lint catches hidden focusable mapped primitives

## What

The installed Biome rule catches an aria-hidden native button but misses a mapped Button. The native jsx-a11y/no-aria-hidden-on-focusable rule catches that mapped control with the effective component mappings. A hidden input without tabIndex produces a plugin false positive; legitimate Base UI hidden inputs require explicit adjudication before enabling the rule.

## Why

A focusable control hidden from assistive technology is unreachable through its accessibility tree. Primitive composition must not hide this defect from native lint.

## Done when

Census actual client and UI sites with the installed rule and effective component mappings. Add failing mapped-control and passing legitimate hidden-input controls. Enable the native rule where correct; fix real findings and narrowly document verified false positives. Add no baseline, blanket exclusion or new custom accessibility framework. Record the exact enforced scope.

## Evidence

Filled at landing: what ran and where its output is.
