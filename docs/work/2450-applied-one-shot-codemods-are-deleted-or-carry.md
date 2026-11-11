---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: tooling
---

# Applied one-shot codemods are deleted or carry a cited reason to stay

## What

The codemod skill says to delete a one-shot codemod in the commit that applies it. Several directories under `tooling/src/codemods/` rewrite a shape the tree no longer contains: `confirm-trigger-to-destructive-action`, `section-container-prop`, `text-prose-cap-pair`, `row-ink-to-icon-tone`, `mono-gloss-to-datum-mono`, `mono-class-to-code-voice`, `keys-of-record` and `eslint-resolved-config`. `tooling/src/codemods/vars-to-infer-input/plan.client.json` is a committed plan file nothing reads. Nothing runs the codemod fixture suites, and `plugin-node-sources/tests-schemas/` tests a second script the skill's layout table does not name. Source: `reports/codebase-review/units/tooling-codemods.md`.

## Why

A codemod that can match nothing is dead weight, and fixtures nobody runs prove nothing once a script changes.

## Done when

Each listed codemod is deleted after a search shows its input shape is gone, or kept with the skill's reason cited in its `codemod.yaml` description. The plan file is deleted. The fixture suites run from one fast in-process test, or the item records the measured cost and the decision not to run them. The skill's layout table names the second-script shape.

## Evidence

Filled at landing: what ran and where its output is.
