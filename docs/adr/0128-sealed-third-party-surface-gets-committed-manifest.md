---
kind: adr
status: active
updated: 2026-09-23
---

# A sealed third-party surface gets a committed manifest

## Context

Not recorded in the ledger row.

## Decision

*A third-party surface we build a seal on gets a COMMITTED MANIFEST with per-element dispositions, and a version bump cannot land until its delta is ruled.* The manifest is generated from the INSTALLED package's public surface (the index-file export-specifier set, extracted structurally — never the changelog, never the docs, never a README), and every element carries a disposition: `exposed` | `sealed-away` + why | `n/a`. Three generator laws, each bought by a defect: **the generator refuses to write a surface it went blind on** (a depth-capped reader silently reported 14 of Combobox.Root's 44 props — cap hits red, and a known-value cross-check is mandatory); **`unresolved` is the ABSENCE of a ruling and re-seeds every regen** (a carried-forward non-ruling froze "nobody decided" onto parts the seals had started rendering); **the gate reds on ANY drift** between installed surface and manifest, so the bump commit must adjudicate every appearance/disappearance/re-typing. FOUNDING INSTANCE: `@base-ui/react` (39 components / 292 public exports / 269 anatomy parts; gates `baseui-surface-manifest` + `baseui-anatomy-completeness` reading the ledger; the human half is the anatomy table in `ui-package-design.md` §14, keyed on the same `<Namespace>.<Part>` strings). FOUNDING EVIDENCE: the vendor's own 1.7.0 changelog undersold its deltas — Separator parts re-implemented per-component and a handle re-typed, announced as "fixes"; only a surface diff catches the class. The pattern generalizes to any sealed vendor surface; minting a new instance = a new generator run + its gate pair, citing this entry.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
