---
kind: review
status: active
updated: 2026-08-20
---

# Merge-train review: collapsed panel body and probe instruments

## Scope and verdict

Reviewed `e19eec2bda18e28601aac5cadac460327b91cfd5` and its amended tooling companion
`fc00f8cc6bcb8a410fee3a577bb8f8922d64f936`, both based on
`8ab4323e422dcd0834c66943d96d5344844b5fd4`. The obsolete pre-amendment tooling commit
`3cbeb10ce` was used only as amendment history and is not a merge candidate. The exact lane contents are
now represented on local `main` by `4a6c54cdf` and `6cdeb23df`.

**Verdict: MERGEABLE for both current lane commits.** No confirmed findings; severity ceiling: none.

## Findings

No confirmed findings.

## Verified clean

### `e19eec2b` — collapsed PanelChrome body deferral

- Read both changed files in full. Also read the complete `PanelChrome` consumers in
  `packages/client/src/features/app-shell/surfaces/app-shell.tsx` and the governing app-shell and testing
  law.
- `packages/client/src/features/app-shell/components/panel-chrome.tsx:40-47,81` initializes a collapsed
  panel as never-visible, mounts its children on the first non-collapsed render, and deliberately never
  returns that flag to false. This satisfies both halves of the contract: no initial hidden-body work and
  state preservation after the first opening.
- The exhaustive JSX sweep
  `ast-grep run -p '<PanelChrome $$$A>$$$C</PanelChrome>' -l tsx packages tests --inspect summary`
  scanned 1,125 files with zero skipped files and found exactly the two live app-shell consumers at
  `packages/client/src/features/app-shell/surfaces/app-shell.tsx:308` and `:374`. The context consumer reads
  the current section-owned body at `:374-382`; that body is a `SectionContextHost` keyed by the active
  section at `:215-220`, so retaining the panel's visibility bit cannot retain stale section content.
- `tests/client/features/app-shell/surfaces/app-shell.ct.tsx:238-259` proves the behavior through the real
  app shell: the initial collapsed body is empty, opening mounts the Chats context pane, and switching to
  Corpus removes the old pane and renders the current fallback.
- The lane's attempted source-neuter unexpectedly passing was a real cache hazard, not proof that this CT
  was vacuous. I cleared `playwright/.cache`, ran
  `pnpm test:ct tests/client/features/app-shell/surfaces/app-shell.ct.tsx --grep 'collapsed CONTEXT body mounts only when opened'`,
  and got 1/1 passing after rebuilding 5,180 modules. A literal check of the rebuilt cache then found the
  `hasBeenVisible` state guard and conditional child render in the emitted `_ct-stories` bundle. Thus this
  run exercised the changed source rather than a stale bare-package bundle.

### `fc00f8cc6` — snap wait semantics and map-name fallback

- Read `scripts/probes/snap.ts` and `tests/tooling/snap-browser.int.test.ts` in full, including the complete
  amendment from `3cbeb10ce` to `fc00f8cc6`.
- The amended implementation at `scripts/probes/snap.ts:1623-1626` uses the supplied locator exactly once
  and waits for visible state. The help contract explicitly distinguishes selectors from explicit
  `text=phrase` selectors at `:1202`.
- I reran a two-sided executable control with
  `reports/stickler/scratch/merge-train-stickler-snap-wait-proof.mjs`: a missing CSS selector `button` on a
  page containing only `<p>button</p>` exited 1 with one failed step; the same selector against an actual
  `<button>` exited 0; and a missing selector without matching prose also exited 1. This proves the amended
  implementation cannot manufacture the pre-amendment false clean by silently interpreting arbitrary CSS
  as exact text. The committed controls at `tests/tooling/snap-browser.int.test.ts:121-159` pin both CSS
  arms and the explicit delayed `text=Fetch and add` arm.
- I also compared the base and amended implementation with
  `reports/stickler/scratch/merge-train-stickler-snap-visible-regression.mjs` against a
  `display:contents` wrapper containing a painted child. Base `--wait-for #portal`, amended
  `--wait-for #portal`, and amended wait on the painted child all exited 0, refuting a suspected false-red
  regression for wrapper-style portal selectors.
- The map fallback now excludes text descendants whose parent is in an `aria-hidden` subtree at
  `scripts/probes/snap.ts:2464-2470`. The behavioral control at
  `tests/tooling/snap-browser.int.test.ts:111-118` maps the visible name `Diana`, not the hidden initials
  plus name.
- `pnpm vitest run --project integration tests/tooling/snap-browser.int.test.ts --reporter=verbose`
  passed all 17 tests in the amended combined tree.

### `fc00f8cc6` — design-audit nested-card exception

- Read `scripts/probes/design-audit-walker.ts`, `tests/tooling/_ct-stories.tsx`, and
  `tests/tooling/design-audit-walker.ct.tsx` in full. I also read the complete production `ListRow`
  implementation in `packages/ui/src/primitives/list-row/list-row.tsx`.
- The exception at `scripts/probes/design-audit-walker.ts:932-943` is structurally narrow: it applies only
  to a `data-slot=list-row-root` whose first element child is itself an interactive control. Production
  `ListRow` owns that slot at `packages/ui/src/primitives/list-row/list-row.tsx:395`; its first child is the
  row body at `:396-405`, which is interactive only for the clickable arm. Static rows with action siblings
  remain judged.
- The paired control at `tests/tooling/design-audit-walker.ct.tsx:91-99` keeps the sanctioned clickable
  wrapper clean while requiring a genuine nested inner card in the same fixture to remain red. Structural
  TSX searches for the slot scanned 1,125 files; the only production definition was `ListRow`, with the
  remaining hits confined to the purpose-built tooling fixtures.
- `pnpm test:ct tests/tooling/design-audit-walker.ct.tsx` passed all 24 tests in the amended combined tree.

### `fc00f8cc6` — model A/B probe evidence persistence

- Read `scripts/dev/model-ab.ts` in full. In probe-only mode, every completed probe is now written at
  `scripts/dev/model-ab.ts:733-742` as `live.<probe>.json` before the summary is generated, matching the
  booted-arm evidence shape and persisting unsuccessful probe results as well as successes.
- Inspected the lane's preserved live-control recipe and artifacts. It launched the local Node HTTP fake
  server in `/tmp/instrument-repairs-model-server.mjs`, then ran:

  ```sh
  node scripts/dev/model-ab.ts --base-url http://127.0.0.1:18999 --model fixture-model
  ```

  The recorded exit was 0. The output directory
  `.claude/worktrees/instrument-repairs/reports/ab/2026-08-20-13-43/` contained 16 parseable JSON files
  with 16 unique probe names plus `summary.md`: 15 successful probes and the expected structured
  `prefill-thinking-kwarg` negative result (`ok:false`, HTTP 200, missing `reasoning_content`). This proves
  both successful and failed probe evidence survives the callback. This is an inspected lane receipt, not
  a newly rerun network/model exercise in this review worktree.

### Complete diff and gate coverage

- Read all eight touched source and test files in full and inspected the complete diffs from the common
  base, including the amendment delta. No schema, token, generated artifact, dependency-boundary, or
  `biome-ignore` surface changed. `git diff --cached --check` was clean in the combined review tree.
- Ran `pnpm check` against the combined `e19eec2b` + `fc00f8cc6` tree and read its complete output. Biome,
  ESLint, package and test type checks, test-membership and execution-membership checks, database baseline
  and Drizzle checks, agent config, full structure, dependency-cruiser, knip, docs formatting, and docs
  catalog all passed; command exit was 0.
- Local integrated-main behavioral receipts supplied after integration are also green: 17 snap integration
  tests, 80 design-audit unit tests, and 24 component tests from a clean cache. These corroborate rather
  than replace the independent amended-tree controls above.
- After adding this report, `pnpm check:docs` and `pnpm check:doc-catalog` both passed (641 cataloged
  documents; two pending fact-checks reported).

## Regions not read in full

None among touched source or test files. Of coupled but untouched files, only the `AppShellStory` and its
relevant import graph in `tests/client/features/app-shell/_ct-stories.tsx` were inspected rather than the
entire file; no conclusion above depends on an unseen region of that story registry.

## Unconfirmed suspicions

None.

## Merge recommendation

Merge `e19eec2bda18e28601aac5cadac460327b91cfd5` and the amended
`fc00f8cc6bcb8a410fee3a577bb8f8922d64f936`. Do not merge obsolete `3cbeb10ce`. No ordering constraint or
confirmed blocker remains; local `main` already contains the reviewed lane contents as `4a6c54cdf` and
`6cdeb23df` with the reported integrated behavioral battery green.

## Issue summary (paste-ready)

Stickler outcome: MERGEABLE for `e19eec2b` and amended `fc00f8cc6`; 0 confirmed findings, severity ceiling
none. Full-file review, structural sweeps, clean-cache PanelChrome CT proof, amended snap false-clean and
false-red controls, design-audit paired controls, inspected 16-file model-ab evidence, targeted behavioral
suites, and the complete `pnpm check` gate all cleared. Durable report:
`docs/reviews/stickler/2026-08-20-merge-train-panel-and-instruments.md`.
