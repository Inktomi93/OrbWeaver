---
kind: adr
status: rejected
updated: 2026-09-23
---

# Rejected neo-derived and report-only enforcement proposals

## Context

The enforcement registry once carried a backlog of gates ported from neo's `tooling/src/verify/` and a
handful of report-only metrics. Some rows never applied to a greenfield build; others were built,
measured, and then dropped because the property they would have checked is already held elsewhere, at
a stronger tier, or is refuted by the house style. None of this is a standing rule, so it does not belong
in law, but a rejected option needs a record so nobody proposes it again without knowing why it lost.

## Decision

Each of the following stays rejected. A later reader who wants to re-open one starts here, not from
scratch.

**Not applicable to a greenfield build (neo carried these, orbweaver has no matching subject):**

- `clean-break` — a retrofit-diff rule (delete-home-as-you-add-replacement). Orbweaver is greenfield; there
  is no retrofit to diff against.
- `shared-structure` — governed neo's `src/shared/`. Orbweaver has no `_shared`; `@orb/kit` and
  `@orb/contracts` replace it.
- `import-alias` — neo aliased cross-layer imports because it was one package. Orbweaver's layers are
  physical packages, so the cross-layer property is now cross-package `@orb/*` physics (dependency-cruiser
  - `not-in-package.json`) plus `no-cross` for cross-feature. The intra-package residual is cosmetic and
    not worth a gate.

**Built, measured, then dropped — the property is refuted or already held elsewhere:**

- `optimistic-chat` (client optimistic-update call-site invariants) — dropped when architecture-B (the
  `ChatHandle` union + `startChat` carry-params) made the premise moot: a draft is a `{kind:"draft"}`
  handle, not an optimistic cache seed, so there are zero `isOptimistic` call sites to gate.
- `shell-no-chrome-props` (a prop-name allowlist banning a feature-chrome `ReactNode` slot on the shell) —
  dropped because the seam it would guard is already type-deleted (`AppShellProps` no longer exists;
  `AppShell()` takes zero props). The remaining shell `ReactNode` props mix frame-grammar slots with
  legitimate content composition, so a prop-name allowlist or denylist cannot tell rot from a legitimate
  prop without guarding nothing. `no-parallel-section-map` and `chrome-registry-completeness` already force
  new chrome through the registry.
- `abandoned-comments` (report-only: comments that lost their code anchor) — dropped because every
  resolvable anchor is already held (`dangling-doc-cite` for an absent `docs/` markdown cite,
  `dangling-refs` for a dead repo-path or strict UPPER-SNAKE token, `commented-code` for parked `//`
  statements), and the residue — a comment whose prose describes code that changed, with no machine
  anchor — is ruled prose-enforced by the constitution's register-boundary paragraph. A report-only metric
  over that residue would report a number with no remedy attached.
- `comment-density` (report-only: comment-line share, capped or floored) — dropped because a single
  repo-wide cap or floor is refuted by the house style: the gate corpus and the product packages carry very different comment
  shares, and the per-file spread runs from near-zero to near-total. Documentation law makes the
  machine-first file header a heavy load, so a cap would penalize the files carrying the most law, while
  a floor is satisfiable by noise.
- `arch-metrics` (ArchUnitTS class-quality metrics, report-only) — dropped because the dependency is not on
  the tree (verified against every package manifest), and its subject — module/class quality and layering
  — is already held at a stronger tier: resolve-time by the package cake, lint-time by `pnpm depcruise`,
  and structurally by `package-layout`, `server-layout`, `client-structure`, `feature-structure` and
  `ui-primitive-structure`. A report-only score beside a red boundary is a second, weaker opinion on a
  settled question.
- The tuple-vs-tuple case of `no-inline-union-redecl` (a second `as const` tuple duplicating a first tuple's
  members) — decided against. Two axes whose members coincide get two tuples, and neither derives from the
  other, because the coincidence is exactly what breaks when one axis grows. A census of every tracked
  package source found a small number of exported `as const` string tuples with colliding member sets,
  and every one is sanctioned: most are distinct axes that happen to share a spelling, and the rest are
  contracts-to-ui pairs
  that the package cake forces apart (`@orb/ui` declares only `@orb/kit` as a workspace dependency, so it
  cannot import the `@orb/contracts` half at resolve time). The live gate's other case (an inline union or a
  `z.enum([…])` literal re-spelling a canonical tuple) still stands.

## Consequences

No gate exists for any of the above. A later reader proposing one of these again should read this record
first; if the underlying fact changes (a dependency gets added, a coincidence starts drifting), the
rejection can be revisited, but the burden is on showing what changed.

## Alternatives rejected

Building each gate as originally specified — rejected for the reason given under its own bullet above.
