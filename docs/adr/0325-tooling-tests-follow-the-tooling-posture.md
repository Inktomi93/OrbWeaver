---
kind: adr
status: active
updated: 2026-10-17
---

# Tooling tests follow the tooling posture

## Context

Spine-Testing section 10 governs tests of the product. The cast gate's population covers the whole tests tree, so tooling tests that read a tool's own artifacts carry baselined waivers for casts the tooling posture allows.

## Decision

Tests under `tests/tooling` prove the tools and follow the tooling rule, not section 10. The value-cast judgement of `no-test-fabrication` excludes `tests/tooling`; the double-cast fabrication judgement and the production-clone judgement still apply there. Spine-Testing section 10 states the scope. Shared builders under `tests/support` remain product tests and build real values.

## Consequences

A tooling test parses or casts a tool artifact as its author judges. Product-test gates judge the product test tree only. The population change is not yet built; the fabrication double casts in shared builders are repaired, not waived.

## Alternatives rejected

Keep one population for every test: the law and the gate disagree on tooling tests, and the waivers hide that. Exclude the whole tooling tree from every test gate: a copied tool function is still a defect.
