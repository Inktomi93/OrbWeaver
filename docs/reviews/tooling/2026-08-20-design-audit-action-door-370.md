---
kind: review
status: active
updated: 2026-08-21
---

# Design-audit action-door census repair — #370

## Verdict

**CONFIRMED.** The design-audit walker no longer treats generic `tabindex="-1"` focus-management
wrappers as user-facing action doors — whether the generic role is implicit OR an explicit
`role="generic"` attribute, since `doorRole` does not distinguish the two. Those nodes remain in the
accessibility-name and tabindex censuses, while explicit ACTIONABLE roles, native controls, and generic
nodes with other tabindex values remain eligible for duplicate-action-door findings.

Reviewed candidate: `d5fb08149fc74af95e7966af5e924521d32184b2`, based on
`fff16964e366197e67363741c7a3340ab9ad560d` and merged to local `main` as
`98244f811dfaea17e4b1ef607793d02152eaca06`.

## Finding and repair

The final overlay audit found that Command, Theme, and Settings dialogs were each reported as having
two or three duplicate generic action doors. The alleged doors were nested `div[tabindex="-1"]`
programmatic-focus wrappers inheriting the same descendant text; they were not actionable controls.

`scripts/probes/design-audit-walker.ts:860-884` now preserves the existing `accessibleNames` collection,
derives the action-door role, and excludes only the exact combination of a generic resolved role and a
trimmed literal tabindex of `-1`. `tabIndexes` remains collected independently at lines 895-903. The
duplicate-door check itself is unchanged.

The repair deliberately does not exclude:

- native buttons, including native buttons with `tabindex="-1"`;
- elements with an explicit actionable role and `tabindex="-1"`; or
- generic named nodes with `tabindex="0"` or another offered tabindex.

## Behavioral evidence

- Red first on the old source: the planted nested-wrapper control failed while 25 existing walker CTs
  passed.
- Final focused CT:
  `pnpm test:ct tests/tooling/design-audit-walker.ct.tsx --workers=1` — 26 passed, 0 failed, 0 flaky.
- Pure design-audit checks:
  `pnpm vitest run tests/tooling/design-audit.test.ts` — 80 passed.
- `tests/tooling/design-audit-walker.ct.tsx:407-436` proves that generic `tabindex="-1"` wrappers remain
  present in both censuses and create no duplicate door, while two distinct same-role/name buttons still
  create exactly one finding.
- An independent browser probe retained explicit-role `tabindex="-1"`, generic `tabindex="0"`, native
  buttons, and native buttons with `tabindex="-1"`; each positive-control pair produced one duplicate.
- A base-main counterexample reproduced `2x generic "programmatic focus target"`; the candidate removed
  that false finding.
- Live Command, Theme picker, Theme builder, and Settings audits completed their navigation/actions and
  each reported zero duplicate-action-door findings after the repair.

One verifier command accidentally retained an argv separator and started the wider CT battery. It was
interrupted after 2,284 passes and four unrelated app-shell/chat failures. That run is not counted as
evidence; the correctly scoped 26-test walker CT and 80-test pure suite above are the bounded receipts.

## Static and structural evidence

- All three TypeScript programs passed on the candidate: package typecheck, graph, and tests-dom.
- Touched-file Biome and `git diff --check` passed. The repository ESLint scope intentionally ignores the
  three touched tooling paths.
- The actionDoors structural helper scanned 5,201 files but could not parse the walker because its code is
  a JavaScript template string; a literal sweep found all five owning occurrences across the walker and
  checks files. No negative claim relies on the structural no-match.
- The normal pre-merge whole-tree static hook passed before merge.

## Disposition

The repair is instrument-only and does not change product UI. It can graduate after the integrated-tree
single pass; future side-eye drives should use the repaired walker and must not compare its action-door
counts to a pre-repair baseline without recording the instrument boundary.

## Issue summary

Issue #370 is fixed and independently verified. Programmatic generic `tabindex="-1"` focus wrappers stay
visible to the accessibility and focus censuses but no longer masquerade as duplicate user actions; true
duplicate actionable controls remain detected by planted and independent positive controls.
