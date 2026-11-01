---
kind: plan
status: active
updated: 2026-10-31
---

# Mechanical checks that keep tests on production

## Goal

A test cannot restate production by accident: copied values, rosters, weak refusals, unseeded ids and hand-built fixtures fail lint, tsc or a testkit helper before review sees them.

## Shape

Production first exports a home for every value tests need. The testkit then gains the helpers whose absence made copying easier. Lint rules and type shapes refuse the copy. Review keeps only what no tool can judge.

### Order

| Step | Work | Items |
| - | - | - |
| 1 | Production homes for the values tests restate | [1504](../../work/1504-export-a-production-home-for-every-value-tests.md) |
| 2 | The missing testkit helpers | [1505](../../work/1505-add-the-testkit-helpers-whose-absence-made-copying.md) |
| 3 | Rules that need only syntax: CSS vars and media queries, bare refusals, unseeded ids and vanishing tables, vacuous assertions and spread captures | 1506, 1507, 1508, 1510 |
| 4 | Rules that need the production index: copied labels, codes, routes and env keys; restated rosters | [1509](../../work/1509-extend-the-hand-copied-label-rule-to-label.md), [1497](../../work/1497-refuse-a-test-side-list-or-table-that.md) |
| 5 | Structure: the surface-walk split and the README hazards | [1511](../../work/1511-split-the-surface-walk-machinery-out-of-the.md), [1512](../../work/1512-name-the-migration-chain-cut-hazard-and-the.md) |

Each rule lands with its existing findings fixed, so it reports zero the day it turns on. The derivation cleanup items run beside this plan and consume its helpers as they land.

## Rejected

Baselines of accepted findings, a duplicate-code detector as a gate, and a lint rule whose false positives need suppressions.

## Coupled sites

docs/law/Spine-Testing.md; tests/support/README.md; eslint.config.ts; .dependency-cruiser.ts; .claude/skills/lane/SKILL.md; reports/test-derivation-audit/.

## Test plan

Each rule refuses a planted copy and accepts the derived form, then reports zero over tests/ after a codemod pass over its existing findings. Each helper replaces every copy it was built for.
