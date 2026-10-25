---
kind: adr
status: rejected
updated: 2026-09-23
---

# Rejected neo-derived and report-only enforcement proposals

## Context

The enforcement registry once carried a backlog of gates ported from neo's verify tooling and a
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

- `optimistic-chat` (client optimistic-update call-site invariants) — rejected because chat creation and
  initial canon follow the production `chat.startChat` response through `useStartChat`. The response seeds
  initial cache entries before navigation. D333 requires no separate optimistic-call-site gate.
- `shell-no-chrome-props` (a prop-name allowlist banning a feature-chrome `ReactNode` slot on the shell) —
  dropped because the seam it would guard is already type-deleted (`AppShellProps` no longer exists;
  `AppShell()` takes zero props). The remaining shell `ReactNode` props mix frame-grammar slots with
  legitimate content composition, so a prop-name allowlist or denylist cannot tell rot from a legitimate
  prop without guarding nothing. `assembleChrome` derives chrome from the production registries.
  D73 names the retained compiler and native test checks, including their declaration-recognition limits.
- `abandoned-comments` (report-only: comments that lost their code anchor) — rejected because prose that
  describes changed code still needs review. `tests/tooling/doc/comment-path-citations.repo.int.test.ts`
  checks retained repository-path citations, and `orb/commented-code` refuses recognized parked statements.
  Neither proves that an unanchored prose claim remains correct. D333 requires no separate report metric.
- `comment-density` (report-only: comment-line share, capped or floored) — dropped because a single
  repo-wide cap or floor is refuted by the house style: the gate corpus and the product packages carry very different comment
  shares, and the per-file spread runs from near-zero to near-total. Documentation law makes the
  machine-first file header a heavy load, so a cap would penalize the files carrying the most law, while
  a floor is satisfiable by noise.
- `arch-metrics` (ArchUnitTS class-quality metrics, report-only) — rejected because package manifests and
  native dependency-cruiser own import direction. D333 removes custom architectural census and checker
  qualification. A report-only score does not strengthen these retained boundaries.
- The tuple-vs-tuple case of `no-inline-union-redecl` (a second `as const` tuple duplicating a first tuple's
  members) — decided against. Two axes whose members coincide get two tuples, and neither derives from the
  other, because the coincidence is exactly what breaks when one axis grows. A census of every tracked
  package source found a small number of exported `as const` string tuples with colliding member sets,
  and every one is sanctioned: most are distinct axes that happen to share a spelling, and the rest are
  contracts-to-ui pairs
  that the package cake forces apart (`@orb/ui` declares only `@orb/kit` as a workspace dependency, so it
  cannot import the `@orb/contracts` half at resolve time). D333 removes the custom union-redeclaration
  gate; type-home and exhaustive-union product rules remain review and native compiler obligations.

## Consequences

No separate checker is required for these rejected proposals. Retained native checks and targeted product tests remain in force under D333. Revisit a rejection only when its underlying constraint changes.

## Alternatives rejected

Building each gate as originally specified — rejected for the reason given under its own bullet above.
