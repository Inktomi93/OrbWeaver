---
kind: tooling
status: doing
updated: 2026-10-11
priority: P1
area: tooling
lane: wt/agent-ab0e2158680e32c8f
plan: test-mirror
---

# Antipattern catalog, widened gates with baselined waivers, and a waiver ratchet

## What

Record every antipattern the audits found in a reference catalog beside docs/law/Core-Enforcement-Active-Gates.md: name, a short example, why it rots, its detector, and its burn-down item. Seed it with copied production logic (queries, rules, registry door lists), hand-declared or inline shapes that copy a contract, re-spelled constants, casts and double casts, fixtures production cannot produce, tests that assert their own literal, stale goldens, mocks of our own code, hand-forged ids, file-name-only mirrors, one-shot live reads, swallowed failures and unscoped owner reads. Widen the existing gate families to every zone, tests included (no-inline-types and its family, the zod and wire family, the id-brand family, the test family), using the coverage matrices from the contract-enforcement stickler report and the production-gates-on-tests scout. When a gate widens, write every existing hit into a baseline as an explicit waiver naming the pattern and its burn-down item; from then on a hit without a waiver fails. Track each gate's waiver count as a ratchet that can only fall. Add one command, pnpm ast antipatterns with an optional scope, that runs every detector and prints hits by class, waived or not. Per-package coverage is part of this item: client, server and ui each have an internal cake in Core-0 and dependency-cruiser, while inference, kit, contracts, db and tooling have only partial layering, and default-content, showcase-plugins and plugin-toolchain ride only the broad gates. Every package declares its internal layers in Core-0 and gets dependency-cruiser rules with planted pins for each layer, and the shape, zod, id and test gate families are widened to it. Order: inference first (provider and wire layer, where never parsing model prose and deriving wire shapes must be hard rules), then tooling, kit and contracts, then the three content and plugin packages. The law is the specification: wherever a gate is weaker than the law text that cites it, raise the gate, never lower the law. Audit every law claim about enforcement against the gate that backs it, starting with Spine-TypeScript-and-Patterns section 7.4, which claims bans the gates do not enforce.

## Why

Owner: the gates are named for rules they only partly enforce, and green runs hide waived findings. Every antipattern needs a detector, and nothing new passes without an explicit waiver.

## Done when

The catalog exists and every entry names a live detector; the widened gates run hard with a committed baseline; a planted new hit fails while the baselined ones pass; the waiver ratchet fails when any gate's waived count rises; pnpm ast antipatterns runs over a scope and reports by class; Spine-Testing section 10 and the active-gates registry cite the catalog; every package has a declared internal cake with pinned rules; every enforcement claim in the law names a gate that enforces it as written.

## Evidence

Filled at landing: what ran and where its output is.
