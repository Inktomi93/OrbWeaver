---
kind: review
status: active
updated: 2026-09-08
---

# Stickler re-review — forms/editor ownership split (#1861 / #1351)

Review target: the phase-3 forms/editor working-tree delta from `813ed2345` in
`.claude/worktrees/codex-world-gate-integration`, including its review fixes, permanent pure-door pin,
focused invalid-submit CT, and the late verification-only `appearance-boot-hint.test.ts`. The compiler-kit
repair through `1eb70fdc7` and the concurrent #1889/#1890 tRPC/brand/import-boundary work were excluded.

## Current findings

None. The three findings in the first review were fixed and independently rechecked below.

## Resolved findings

### Resolved P1 — `test-presence-client` now owns direct `forms/editor` leaves, and the focus behavior has a biting browser test

The former defect was at `tooling/src/verify/gates/test-presence-client.ts`: the direct-child filter admitted
`forms/x.ts` and silently skipped `forms/editor/x.ts`, making the extracted
`packages/client/src/forms/editor/focus-invalid-field.ts` invisible to test presence. The current
`CLIENT_MIRROR_HOMES` includes `forms/editor/`; the matcher evaluates every candidate home rather than
stopping at `forms/`; and `forms/editor/bound-fields/**` remains deliberately excluded.

Independent descriptor probe on the current code:

```text
direct forms callable without mirror: 1 finding
editor callable without mirror:       1 finding
editor bound-field callable:           0 findings
```

The descriptor also carries both directions of the move: a `forms/editor/focus.ts` source with only the old
`tests/client/forms/focus.ct.tsx` mirror is `mustFlag`, while the same source with
`tests/client/forms/editor/focus.ct.tsx` is `mustPass`. Root-supplied focused gate evidence reports the final
`test-presence-client.int.test.ts` pass inside a 16/16 run.

The runtime half is now pinned by:

- `tests/client/forms/editor/_focus-invalid-field-stories.tsx` — mounts the public saved-editor factory,
  two real bound fields, dynamic field validation, and a real form submit;
- `tests/client/forms/editor/focus-invalid-field.ct.tsx` — deliberately focuses the second control, submits,
  proves both controls become `aria-invalid`, proves both error messages render, and asserts the first
  invalid control receives focus.

Root supplied the red-first behavioral receipt: clean 1/1 green → production selector/focus made a no-op,
1/1 red → source restored, 1/1 green. The source was confirmed restored, and both factories still wire the
shared helper through `onSubmitInvalid`.

### Resolved P2 — all five pure doors are permanently pinned in the actual Node type program

`tests/tooling/client-pure-doors.test-d.ts` side-effect imports `@orb/client/{data,forms,lib,state}` and
`@orb/ui/lib`, forcing TypeScript to resolve each complete public closure. It also asserts that `document`
is absent from `globalThis`, so accidentally checking the file under DOM-enabled compiler options fails.

Ownership is real rather than simulated:

- `vitest.config.ts`'s `types-node` project includes `tests/**/*.test-d.ts` and excludes only the explicit
  `TYPES_BROWSER` set; this tooling test is not in that set.
- `tsconfig.json` excludes `tests/client`, `tests/ui`, and `tests/e2e`, but not `tests/tooling`; the pin is
  therefore rooted by the existing DOM-less Node program.
- The actual runner reported `|types-node| TS tests/tooling/client-pure-doors.test-d.ts (1 test)` green.

Both required closure controls bite:

1. A temporary direct `document` use exported by the pure forms door produced TS2304 and exit 1.
2. A temporary editor re-export from the pure forms barrel pulled the editor/UI closure into the Node
   program, produced 19 DOM diagnostics including TS2304, and exited 1.

After restoration the same test passed. A separate native/classic compiler probe with DOM loaded produced
TS2344 at the test's `document`-absence assertion, proving the sentinel rejects the wrong compiler world.
The triple-slash-only Vitest experiment that unexpectedly returned zero is explicitly not used as evidence;
the two closure controls and the native/classic sentinel are the verdict.

The integration includes this authored type-test pin with the source and behavioral regression files; it is
not a scratch-only proof. Root owns the final staging and commit of that complete set.

### Resolved P2 — active law, architecture, and live test headers follow the new owner

The active `no-direct-useform` catalog row now directs callers to `#forms/editor`. The fully-read
`UI-Architecture-and-Layout.md` tree now shows `forms/` as the Node-safe model/store/seam owner and
`forms/editor/` as the browser editor owner; it also keeps QueryBoundary and WeaveGlyph under `components/`.
The four live test headers now name their moved `tests/client/forms/editor/**` paths, and the room-overrides
model test no longer claims that the pure `#forms` door drags browser TSX.

A scoped literal sweep over those active docs, current tests, and the moved gate corpus found no surviving
old `useAppForm from #forms`, `forms/contexts.ts`, `forms/bound-fields/`, or old moved CT path reference.
Historical files under `docs/architecture/history/**` remain intentionally untouched.

## Verified clean

- Read the governing doctrine, constitution, D-ledger redirect/locked principles, type and testing spines,
  type-world program, autosave doctrine, gate authoring law, gate catalog, tooling move law, issues #1861
  and #1351, all final forms source/test files, and the relevant current review-fix files.
- Independent ts-morph forms-door census loaded 6,270 source files and found zero wrong-door symbols, zero
  unknown forms imports, and zero default/namespace imports. Independent forms-local graph: 31 modules,
  53 resolved runtime edges, zero cycles; the pure door has no runtime edge into `editor/`.
- Root-supplied body/export proof: 95 forms declarations unchanged; 106 other changed package/test bodies
  unchanged after removing imports/exports/comments; zero behavior-statement changes; all 40 original public
  symbols preserved as 18 pure + 22 editor with the original type/value kinds.
- Root-supplied current behavior/static receipts: five pure doors compile under actual Node options with
  zero diagnostics; client, tests-dom, and root programs green; original forms Node/type 39/39 and CT 39/39;
  focused invalid-submit CT green with a red mutation control; dependency-cruiser zero forms violations;
  moved-gate embedded/focused proofs green; reviewed grants and suppression rows live; scoped pnpm ESLint
  zero errors; full scoped Biome zero errors apart from two inherited template-fixture warnings.
- The late `tests/client/state/appearance-boot-hint.test.ts` mirrors the source, resets state on both sides,
  verifies authoritative appearance-axis updates preserve `dataTheme`, and proves earlier returned snapshots
  do not mutate retroactively. Root reports it green.
- `git diff --check` is clean over the forms review-fix set. JSON parsing previously succeeded for
  `biome.json`, suppression baseline, test baseline, and caught-failure population.
- The concurrent #1889/#1890 changes to kit IDs, client/server/tRPC entry points, dependency-cruiser, and
  their tests were not judged here. Root owns the comprehensive battery, generators, staging, and commits.
  This review did not run CT or mutate production source.

## Unconfirmed, low priority

- The done PD-131 row in `Core-Audits-and-Debt.md` and the parked options/tag design still name the old
  bound-field path. Their snapshot/parked posture may make those historical references deliberate; they
  remain outside the finding set.

## Issue summary

Stickler re-review of the #1861/#1351 forms/editor ownership split has zero current findings. All three
original findings are resolved: `test-presence-client` now covers direct editor-owned leaves while retaining
the bound-field exclusion, a red-first browser CT pins first-invalid focus, the actual `types-node` program
permanently roots all five pure doors with both direct-DOM and editor-re-export failure controls, and active
law/current test headers follow the new paths. Severity ceiling: none. Report:
`docs/reviews/stickler/2026-09-08-forms-editor-ownership-split.md`.
