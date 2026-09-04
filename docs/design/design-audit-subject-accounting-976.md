---
kind: design
status: complete
updated: 2026-09-04
---

# Design audit subject-accounting proof (#976)

Status: implementation design, 2026-08-31. This document is the build contract for #976; it is not the
appearance matrix owned by #953.

## The reproduced defect

The current source can report a clean Light-theme audit after judging only part of the final surface:

```text
pnpm snap --theme Light --design-audit       # then: pnpm design-audit --theme Light (#1315)
RESULT ... dom-walk=285 dom-settled=381 ... census=173 ...
```

That run exited 0. Repeating the same invocation with `--wait 2500` produced `dom-walk=381
dom-settled=381`. The default drive settles for 500 ms, walks, and only then observes the population
(`tooling/src/ui-audit/ops/drive.ts:139-156`). The theme/settings interception has to resolve
`theme.listThemes` before it can fulfil the real settings batch
(`tooling/src/_shared/appearance.ts:303-338`, `tooling/src/_shared/appearance.ts:386-403`). In the reproduced
run that batch completed after roughly 690 ms and mounted 96 more subjects. The existing evidence rule only
refuses growth of at least eight elements *and* a final population at least 1.5 times the walk population
(`tooling/src/ui-audit/lib/evidence.ts:100-115`). `381 / 285 = 1.337`, so the stated 96-subject omission is
classified as clean.

This is an instrument error, not a CSS finding. Core-0 section 9 requires verdict tools to prove both bite
and blindness; D42 and D44 forbid converting missing evidence into a clean verdict. The appearance review
also found that the current static `querySelectorAll` snapshots cannot see later mounts or same-count
replacement (`tooling/src/ui-audit/ops/walker/census-text.ts:219-224`,
`tooling/src/ui-audit/ops/walker/census-interactive.ts:58-67`).

## Chosen architecture

### 1. Settle the requested state before taking the judged snapshot

`drivePage` will perform the existing bounded population settle before `COLLECT_SAMPLES_JS`, not after it.
The settle remains bounded by the existing floor, interval, and ceiling, but its observation is upgraded from
count-only to count plus child-list revision. A stable count cannot therefore certify a same-count
replacement as quiet. The operator's `--wait` still runs first and keeps its existing CLI meaning; this is
an evidence wait, not a new user-visible delay switch.

The settled subject population captured by the walker is the denominator. No later retry is allowed to
replace a failed run with a warmer one.

### 2. Account by DOM identity, not by a tolerance

At the beginning of the in-page walker, take one static set of every document element and start a
`MutationObserver`. Classify each member exactly once:

- `walked`: the walker attempted the structural/style census for the element. Hidden elements remain walked;
  visibility changes which checks apply, not whether the subject existed.
- `document-head`: a deliberately closed non-rendered skip for descendants of `<head>`. `<html>` itself is
  walked because it owns seed-theme state.
- `dev-chrome`: the already-defined TanStack/React Query/Vite devtools selectors plus goober trigger class
  exclusion.
- `inaccessible`: reading the element threw. This is an explicit failed-accounting class, never a clean skip.

At the end, compare the original object identities with the current DOM identities and drain the observer.
Record additions, detachments, replacements/child-list revisions, and unaccounted original identities.
Exact success is:

```text
settled = walked + document-head skips + dev-chrome skips
```

and all of the following are zero: inaccessible, unaccounted, added, detached, and observed child-list
mutations during the walk. `settled` and `walked` must also be non-zero. Any broken term is `INSTRUMENT ERROR`
and exit 2. This replaces the 1.5 ratio and minimum-eight tolerance completely. Counts remain in human,
machine, and JSON output so the denominator is inspectable.

### 3. Prove requested theme, resolved source, and rendered polarity

The existing settings shim is the only theme resolver. It will retain the selected catalog entry alongside
the selected id and expose evidence identifying the request, resolved id/name, and source:

- `default`: `--theme none`, meaning the shipped unselected/Hearth arm;
- `seed`: a catalog row whose real `isSeed` field is true;
- `custom`: a catalog row whose real `isSeed` field is false;
- `unknown`: a catalog response that did not provide a trustworthy source flag.

The walker records the rendered source and effective polarity at judged subjects. Seed source is proven by
the root `data-theme`; custom source is proven by the absence of a root seed attribute plus the shell
`ThemeScope` inline token source. Effective polarity is read from whole computed `color-scheme` values, not
inferred from a requested name. Nested theme scopes are observed at their subject rather than forced to
inherit the root's label. A requested theme is trustworthy only when the shim applied, the catalog
resolution is known, the rendered root/shell source matches that resolution, and every walked subject has an
effective light or dark polarity. Missing, contradictory, or zero theme evidence is exit 2.

This extends the already-live theme interception and `ThemeScope` mechanism; it does not mint a second theme
resolver or a parallel theme model.

## Alternatives rejected

1. **Lower the ratio threshold or use `settled !== duringWalk`.** Count equality is blind to replacement,
   and any tolerance still knowingly emits a clean verdict over unexplained subjects.
2. **Retry the walk after a mismatch.** A warmed retry erases the evidence that the first walk was incomplete
   and makes timing decide which result survives.
3. **Stamp elements with audit ids.** Mutating inspected markup can change selectors and CSS. In-memory DOM
   identity proves the same thing without perturbing the subject.
4. **Wait for network idle.** The application has long-lived and unrelated requests; network state is not a
   subject-completeness contract. The measured DOM is the contract.
5. **Build an appearance matrix here.** #953 explicitly owns one `_shared` derived-axis generator after #976
   and #977. This change proves one requested arm at a time and preserves the current CLI.
6. **Create another theme API/client.** The settings shim already resolves through the authenticated browser
   context. Duplicating it would create two sources of truth and two failure postures.

## Coupled-site inventory

The implementation is expected to touch these existing shapes and their direct tests:

- `tooling/src/_shared/theme.ts`: retain the catalog's real seed/custom discriminator.
- `tooling/src/_shared/appearance.ts`: expose the one-shot theme resolution through
  `SettingsShimEvidence`; preserve patching and no-write semantics.
- `tooling/src/ui-audit/contract/{types,samples,samples-evidence}.ts`: subject-accounting and
  rendered-theme evidence.
- `tooling/src/ui-audit/ops/drive.ts`: pre-walk mutation-aware settle and population transport.
- `tooling/src/ui-audit/ops/walker/{core,census-text,returns}.ts`: one subject snapshot, skip classes,
  identity comparison, and rendered theme census.
- `tooling/src/ui-audit/lib/evidence.ts`: exact accounting/theme evidence gaps; remove tolerance semantics.
- `tooling/src/ui-audit/ops/{run,report}.ts` and `tooling/src/ui-audit/index.ts`: preserve current labels while
  exposing the new denominator and provenance fields.
- `tests/tooling/_shared/{theme,appearance}.{test,int.test}.ts` and
  `tests/tooling/ui-audit/{index.test,lib/evidence.test,cli.int.test}.ts`: the required `RawSamples`
  fixture plus pure and real-browser controls.

If a smaller implementation proves some listed site does not require a change, it remains covered by its
focused suite and the final literal/call-site sweep. No unrelated rule, budget, or baseline is widened.

## Test and proof plan

Red first:

1. Pin `285 walked / 381 settled` as an accounting gap. This fails on the pre-fix ratio rule.
2. Pin same-count replacement as a gap; count-only evidence cannot catch it.
3. Pin unknown/mismatched requested theme provenance as a gap.

Planted browser controls:

- a late-mount fixture that mounts after the ordinary 500 ms wait must be included in the settled snapshot,
  with exact equality and exit 0;
- its clean, already-mounted twin must also exit 0;
- replacement, detachment, and mid-walk portal/addition fixtures must exit 2 with the named accounting term;
- hidden subjects and explicit `document-head`/dev-chrome skips must close the equation without disappearing;
- zero-subject and partial-accounting fixtures must exit 2;
- real theme fixtures cover Hearth/default, Mocha/seed dark, Light/seed light, legal custom light, and legal
  custom dark, proving requested id/source and computed polarity.

Focused graduation is the shared theme/appearance unit and integration suites plus the UI-audit evidence and
CLI integration suites. The live proof re-runs Hearth/default, Mocha, Light, and available legal custom
themes at desktop/fine and mobile/coarse where the current CLI supports them, reading exact populations and
exit codes from each invocation. #977 owns full mobile descriptor semantics; this leg does not pre-implement
them. Broad shared-tree checks wait until concurrent lanes are stable.

## Memory prior art consulted

- `MEMORY.md`: the tooling lessons require denominators and positive plants for every zero-result verdict.
- `rollout_summaries/2026-08-22T00-31-31-CdVc-orbweaver_tooling_plan_and_frame_drop_proof_audit.md`:
  the earlier motion audit falsely passed when its observer missed the real page; the durable fix pattern is
  planted positive plus clean twin plus wrong-target/zero controls, with missing evidence exiting 2.
