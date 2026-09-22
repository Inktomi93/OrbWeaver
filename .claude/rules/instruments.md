---
paths:
  - tooling/src/snap/**
  - tooling/src/ui-audit/**
---

# Snap and ui-audit instruments

Rules for authoring the `snap` driver and the `ui-audit` walker/design-audit scanner. Driving the app
with them is `snap-driving`; reviewing their findings is `side-eye-design-review`.

## Readiness and staging

- `data-app-ready` fires once at boot. After a navigation it does not certify the new surface; wait
  for a measured population window, not a first-quiet exit.
- A stage starts as a copy of the dev db and keeps that copy for its run. It never shares the dev
  stack's own db. `tooling/src/snap/ops/stage-source.ts` makes the copy; `tooling/src/snap/ops/
  stage.ts` reuses a cached stage's existing copy.
- An `--isolated` stage boots a fresh copy with no other lane's writes in it. A cold run's first
  page-error is vite re-optimizing, not the app; take evidence from run two.
- Seed data inside a staged run, never against the live dev stack.

## Teardown

A teardown kills only a value the current process minted (`tooling/src/_shared/run-marker.ts`,
`tooling/src/snap/ops/browser-sweep.ts`), never an inherited ambient marker. Key liveness checks on
that identity; await child exit instead of polling `kill(pid, 0)`.

## Evidence discipline

- Folding a sibling instrument into a snap case inherits the session daemon's call semantics; never
  port a separate owner-page attach mechanism into the case.
- A snap case's artifact list derives from each file's declared `producerArm`
  (`tooling/src/snap/ops/scenario-facts.ts`, `run-bundle.ts`). A case that measures nothing still
  declares and writes no file — a missing file means a missing writer.
- A matrix run prints each cell's own failing rows, not only an aggregate count, and its `where`
  clause pins every axis that decides the cell's subject, not only axes a past finding named.
- If `run.json` shows only the terminal batch with empty cases, read raw stdout for an INSTRUMENT
  ERROR before treating a no-verdict case as a real defect. A LoAF `worstScript`/`entry=` names the
  entry point, not where time went; diagnose with `--cpu-profile` by `callFrame.url`. A throttle flag
  needs its own wall-clock budget, or a slow network reads as a broken app.

## `--eval` and help text

`--eval` and `page.evaluate` argument rules live in `snap-driving` and `rules/browser-tests.md`; this
file does not restate them. Write help prose in `tooling/src/snap/contract/help.ts` with single
quotes, never backticks (a backtick ends the template literal at runtime); a flag summary must not
contain `|`.

## Contrast and accessible-name probes

`getComputedStyle` passes `oklch`/`oklab` through unchanged; normalize color via a canvas `fillStyle`
round-trip, never an rgb-only regex. A fill-only element (switch thumb, swatch, indicator) can read an
inherited ink color that equals its fill by coincidence (`tooling/src/snap/lib/contrast-script.ts`);
use a pixel-surface or design-audit probe for fill-polarity claims — axe/Lighthouse miss it too, since
neither composites ancestor opacity. Accessible-name order is `rules/browser-tests.md`'s rule; use
`snap --aria` as the spec-correct source to cross-check against.

## ui-audit walker

- Key a duplicate-control census on list-item identity (container or item role plus index), never on
  the DOM ancestor path. Absence of measurement voids the run; measured inapplicability is excluded;
  a walker cap is a push bound, not a scan bound (`tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md`).
- A `describe()` selector has no uniqueness check; count it with `page.locator(sel).count()` first.
- `elementFromPoint` returning null off-viewport means the probe could not look, not that another
  element owns the pixel — never collapse a whole control to a false-clean border box. Verify a
  tap-target finding on a pseudo-element at several offsets before forwarding
  (`tooling/src/ui-audit/ops/walker/core.ts`).
- The walker's in-page probe sets and restores an attribute on an existing element; never inject a
  node, or `walkObserver` counts the probe itself as churn.
- When auditing a variant, check the call site's `className` for utilities that re-spell a sibling
  variant's recipe; a `data-intent` stamp proves only which variant was chosen, not what was painted
  (`tooling/src/ui-audit/lib/checks-quality.ts`).
