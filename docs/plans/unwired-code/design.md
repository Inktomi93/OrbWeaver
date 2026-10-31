---
kind: plan
status: active
updated: 2026-10-31
---

# Find and judge every unwired and dead piece of code

## Goal

Every production symbol, member, field, parameter and union member is reached by production, deleted, or kept with a cited reason. One concept has one home.

## Shape

Ports derive from their owners so references follow the composition root. The unwired scans then report what no production path reaches, from whole exports down to fields, parameters and union members. Each finding is wired, deleted, or kept with a cited ledger reason.

### Order

| Step | Work | Items |
| - | - | - |
| 1 | Derive every port from its owner; rule cross-domain handle passing | the spread-flow ports, [1503](../../work/1503-teach-the-port-census-and-the-derived-port.md) |
| 2 | Judge every member the member scan reports | the unwired-member items the 1439 report boards, [0501](../../work/0501-wire-or-delete-the-unused-prompt-preview-verbs.md), and the possibly dead guards the restoration lanes found |
| 3 | Build the TS 7.1 engine and the dead-inside-live scans | [1447](../../work/1447-extend-pnpm-unwired-ts-7-1-engine-and.md) |
| 4 | Judge the first full run of each new scan; delete synonym aliases from the shapes scan | the items 1447 boards, [1445](../../work/1445-delete-synonym-type-aliases-keep-per-verb-params.md) |
| 5 | Adjudicate unused exports through the package doors | [0989](../../work/0989-adjudicate-unused-production-exports-behind-explicit-package-doors.md) |
| 6 | Hold the domain template with dependency rules | [1443](../../work/1443-enforce-domain-contract-purity-with-a-dependency-cruiser.md), [1423](../../work/1423-move-i-o-out-of-domain-substrate-folders.md), [1463](../../work/1463-chat-persistence-reads-the-assets-characters-and-personas.md) |

## Rejected

A CI gate on scan output, a baseline of accepted findings, and keeping code because it looks deliberate without a cited ruling.

## Coupled sites

docs/adr/0337-owner-built-statements-join-another-domains-batch.md; docs/law/Core-0-Architecture-and-Structure.md §4; tooling/src/unwired/; knip.

## Test plan

Each scan ships fixtures for a found case and a false-positive control. Each deletion keeps the affected suites green; each wiring adds a production-path test.
