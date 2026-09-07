// Adversarial selection-delta controls for #984 through real computed paint.
//
// #1059 moved the cohort key from the raw `parentElement` to `claim + authoredTargetHome + state` (the
// walker's own shared identity, `ops/walker/target-identity.ts`). Two controls below pin BOTH directions
// of that: a twin sitting in a SIBLING presentation wrapper — a virtualized grid's per-row div, the live
// shape that made Settings -> Appearance a permanent NO VERDICT — is now one cohort and JUDGED, while a
// cohort that is genuinely one-sided across those same wrappers is still WITHHELD, so #987's :208 ruling
// survives the regrouping intact.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument, stateTwin } from "../../../../support/ui-audit-relational.ts";

test("selection-idiom ignores invariant base paint when selected and unselected twins use the same channel", async ({ runCli, scratch }) => {
  const invariant = [
    stateTwin("selected", "", "background:#333"),
    stateTwin("selected", "", "border:3px solid #fff"),
    stateTwin("selected", "", "box-shadow:0 0 5px #fff"),
  ].join("");
  await writeFile(join(scratch, "invariant-selection-paint.html"), relationalDocument(invariant));
  const res = await runCli("snap", ["--file", join(scratch, "invariant-selection-paint.html"), "--fail-on", "P2", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "absolute card paint is not a selection treatment when the unselected twin shares it").not.toMatch(/^P2\s+selection-idiom/mu);
  // ONE cohort, not three (#1059): these are three instances of the SAME authored component in the same
  // authored home, which the home key now says out loud. All six carriers still get compared — every
  // selected member is measured against the cohort's unselected base — so the invariant-paint claim this
  // test exists for is unchanged; only the denominator stopped counting one component three times.
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=1 judged=1 affected=0 populations=0 representatives=0");
});

for (const [label, attribute] of [
  ["selected", "data-selected"],
  ["unselected", 'aria-selected="false"'],
] as const) {
  test(`selection-idiom records a one-member ${label}-only group as an explicit closed exclusion`, async ({ runCli, scratch }) => {
    await writeFile(
      join(scratch, `${label}-only-selection.html`),
      relationalDocument(`<section data-slot="choice-group"><div data-slot="choice" ${attribute} style="width:120px;height:40px">orphan</div></section>`),
    );
    const res = await runCli("snap", ["--file", join(scratch, `${label}-only-selection.html`), ...AUDIT_ARGV], {
      timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
    });
    expect(res.stdout).toContain(
      "POPULATION   selection-idiom candidates=1 judged=0 affected=0 populations=0 representatives=0 withheld() excluded(insufficientPopulation=1)",
    );
    expect(res.stdout).not.toContain("INSTRUMENT ERROR");
    await expect(res).toExitWith(0);
  });
}

for (const [label, attribute, withheldReason] of [
  ["selected", "data-selected", "unmatchedSelected"],
  ["unselected", 'aria-selected="false"', "unmatchedUnselected"],
] as const) {
  test(`selection-idiom withholds a comparable ${label}-only authored cohort`, async ({ runCli, scratch }) => {
    await writeFile(
      join(scratch, `comparable-${label}-only-selection.html`),
      relationalDocument(`<section data-slot="choice-group">
<div data-slot="choice" ${attribute} style="width:120px;height:40px">one</div>
<div data-slot="choice" ${attribute} style="width:120px;height:40px">two</div>
</section>`),
    );
    const res = await runCli("snap", ["--file", join(scratch, `comparable-${label}-only-selection.html`), ...AUDIT_ARGV], {
      timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
    });
    expect(res.stdout).toContain(
      `POPULATION   selection-idiom candidates=1 judged=0 affected=0 populations=0 representatives=0 withheld(${withheldReason}=1) excluded()`,
    );
    expect(res.stdout).toContain("INSTRUMENT ERROR");
    await expect(res).toExitWith(2);
  });
}

test("selection-idiom aggregates delta vocabularies across checked, selected, and current state kinds", async ({ runCli, scratch }) => {
  const vocabularies = [
    stateTwin("checked", "outline:2px solid orange"),
    stateTwin("selected", "background:#402000"),
    stateTwin("current", "border-left:3px solid orange"),
  ].join("");
  await writeFile(join(scratch, "cross-kind-selection.html"), relationalDocument(vocabularies));
  const res = await runCli("snap", ["--file", join(scratch, "cross-kind-selection.html"), "--fail-on", "P2", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "three surface-wide delta vocabularies cannot hide in three one-item state buckets").toContain("selection-idiom");
  expect(res.stdout).toContain("ringx1 · fillx1 · bar-leftx1");
});

// ── the virtualized-wrapper controls (#1059), both directions ────────────────

/** A virtualized grid in miniature: ONE authored cell family, split across per-row presentation wrappers
 *  exactly as `@orb/ui`'s MediaGrid splits `[data-slot=media-grid-cell]` under `[data-slot=media-grid-row]`.
 *  `selectedFirst` decides whether the FIRST row carries the selected tile — the live Appearance shape,
 *  where row 0 held the lit "No background" tile and row 1 held seven unlit ones. */
function gridRows(selectedFirst: boolean): string {
  const cell = (state: string): string => `<div data-slot="grid-cell" ${state} style="width:60px;height:40px;background:#222">tile</div>`;
  const unselected = `${cell('aria-selected="false"')}${cell('aria-selected="false"')}`;
  const selected = selectedFirst ? cell("data-selected") : "";
  return `<div data-slot="grid-root"><div data-slot="grid-row">${selected}${unselected}</div><div data-slot="grid-row">${unselected}</div></div>`;
}

test("a selected twin in a SIBLING presentation wrapper is one cohort and judged, not a phantom missing twin", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "wrapped-selection-twin.html"), relationalDocument(gridRows(true)));
  const res = await runCli("snap", ["--file", join(scratch, "wrapped-selection-twin.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  // One authored cohort across both row wrappers — judged, and NOT a second withheld row for the wrapper
  // whose slice happens to hold no selected cell.
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=1 judged=1 affected=0 populations=0 representatives=0 withheld() excluded()");
  expect(res.stdout).not.toContain("unmatchedUnselected");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
});

test("a cohort that is genuinely one-sided ACROSS those wrappers is still withheld — #987 :208 survives the regrouping", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "wrapped-selection-orphan.html"), relationalDocument(gridRows(false)));
  const res = await runCli("snap", ["--file", join(scratch, "wrapped-selection-orphan.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain(
    "POPULATION   selection-idiom candidates=1 judged=0 affected=0 populations=0 representatives=0 withheld(unmatchedUnselected=1) excluded()",
  );
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(2);
});

// ── the component-PART controls (#1150), all three directions ────────────────

/** The RATIFIED picture picker (#981) as it ACTUALLY renders, copied attribute-for-attribute off the live
 *  Appearance settings surface: Base UI's `Radio.Root` renders AS `PickerCell` through `render`, so ONE
 *  span carries `role=radio` + `aria-checked` + `data-checked`/`data-unchecked`, and the CHECKED cell alone
 *  mounts `Radio.Indicator` — a role-less span that republishes `data-checked` and whose `keepMounted`
 *  defaults to false (docs/vendor/base-ui/components/radio.md :492), so it can never have an unselected
 *  twin. Measured live: those indicators formed a 2-selected/0-unselected cohort and withheld
 *  `unmatchedSelected`, turning every Config audit into a NO VERDICT.
 *
 *  THE SELECTED PAINT IS AUTHORED PER GROUP HERE, NOT THE APP'S `ring-inset`. The shipped cell paints
 *  selection with a 2px INSET ring plus a 1px border-colour change, and this census vetoes inset box-shadow
 *  (#1076, open) while `SELECT_BAR_MIN_PX` rejects a 1px border — so the real cell judges to signature
 *  "none". These fixtures pin THIS rule's part/carrier partition and that a picker cell's channels are
 *  counted at all; they deliberately do not depend on the vetoed channel. */
function radioGroupPicker(slot: string, selectedPaint: string): string {
  const cell = (state: string, check: string, paint: string): string =>
    `<span data-slot="picker-cell" role="radio" ${state} style="position:relative;display:block;width:120px;height:60px;background:#111;${paint}"><span data-slot="picker-cell-body">theme</span>${check}</span>`;
  const indicator = `<span data-slot="radio-group-picker-item-check" data-checked style="display:block;width:12px;height:12px;background:#fff"></span>`;
  return `<div data-slot="${slot}" role="radiogroup" aria-label="${slot}">
${cell('data-checked aria-checked="true"', indicator, selectedPaint)}
${cell('data-unchecked aria-checked="false"', "", "")}</div>`;
}

test("a radiogroup picker's own delta channels are counted while its checked-only INDICATOR is a closed exclusion, not a phantom missing twin", async ({
  runCli,
  scratch,
}) => {
  const pickers = [
    radioGroupPicker("theme-collection", "outline:2px solid orange"),
    radioGroupPicker("chat-style-cards", "background:#402000"),
    radioGroupPicker("elevation-cards", "border-left:3px solid orange"),
  ].join("");
  await writeFile(join(scratch, "radiogroup-picker-selection.html"), relationalDocument(pickers));
  const res = await runCli("snap", ["--file", join(scratch, "radiogroup-picker-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  // Three picker cohorts (one per radiogroup home) are JUDGED; the three indicators share ONE cohort — a
  // component part cannot own a choice, so it is excluded with a closed reason rather than withheld.
  expect(res.stdout).toContain(
    "POPULATION   selection-idiom candidates=4 judged=3 affected=1 populations=1 representatives=1 withheld() excluded(nestedStatePart=1)",
  );
  expect(res.stdout, "the ratified picker's own delta is measured, not swallowed by the part").toContain("ringx1 · fillx1 · bar-leftx1");
  expect(res.stdout).not.toContain("unmatchedSelected");
  // THIS RULE leaves the NO-VERDICT reason list. The run still carries one: `quiet-state` (census-region.ts)
  // reads the SAME indicator as an ON state with no OFF twin and withholds `unmatchedOn` — the identical
  // part/carrier blindness one rule over, filed separately rather than fixed under this row's receipt.
  expect(res.stdout).not.toContain("selection-idiom: unmatched");
});

test("a NESTED control that owns its own aria state is a carrier, not a part — only the state-less part is excluded", async ({ runCli, scratch }) => {
  const tile = (state: string, checked: string, tick: string, selectedPaint: string): string =>
    `<div data-slot="tile" ${state} style="color:#fff;width:140px;height:70px;background:#111;${selectedPaint}">${tick}<button data-slot="tile-lock" role="checkbox" ${state} aria-checked="${checked}" style="color:#fff;background:#111;width:48px;height:48px">lock</button></div>`;
  const mark = `<span data-slot="tile-mark" data-checked style="display:inline-block;width:12px;height:12px;background:#fff"></span>`;
  await writeFile(
    join(scratch, "nested-aria-carrier-selection.html"),
    relationalDocument(
      `<section data-slot="tile-group">${tile("data-checked", "true", mark, "outline:2px solid orange")}${tile("data-unchecked", "false", "", "")}</section>`,
    ),
  );
  const res = await runCli("snap", ["--file", join(scratch, "nested-aria-carrier-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  // Two judged cohorts: the tiles, AND the nested lock buttons — a real control inside a selected ancestor
  // keeps its own aria state and therefore its own comparison. Only the paint-hook-only mark is excluded.
  expect(res.stdout).toContain(
    "POPULATION   selection-idiom candidates=3 judged=2 affected=0 populations=0 representatives=0 withheld() excluded(nestedStatePart=1)",
  );
  expect(res.stdout).not.toContain("selection-idiom: unmatched");
});

// A REFUSAL THAT NAMES NO SUBJECT CANNOT BE CHASED (#1704).
//
// Three design-audit passes on Characters (2026-08-30, 09-02, 09-05) all ended `population-verdict=
// NO-VERDICT` on `selection-idiom: unmatchedUnselected×2`, and the DRIVEN arm ended on the same string. The
// instrument recorded a tally and nothing else, so no reader could tell whether the printed remedy was the
// wrong command or whether no command on that surface could ever produce a selected twin — the two cohorts
// were never named. The withholding itself is #987's ruling and is UNCHANGED; what changed is that it now
// says WHAT it could not judge, which is the difference between a loud refusal and a silent third pass.
test("a withheld selection cohort names its subject in both the population row and the NO-VERDICT detail", async ({ runCli, scratch }) => {
  // LEFT: three carriers of one authored cohort, every one unselected — no twin exists, so #987 withholds.
  // RIGHT (the control): a twinned cohort in the same document, which must still be judged and must not
  // acquire a subject of its own. Distinct `data-slot`s keep them two authored homes.
  const orphan = `<section data-slot="orphan-group">${["a", "b", "c"]
    .map(
      (id) => `<div id="orphan-${id}" data-slot="orphan-choice" aria-selected="false" style="color:#fff;width:120px;height:40px;background:#111">${id}</div>`,
    )
    .join("")}</section>`;
  const twinned = `<section data-slot="twin-group"><div id="twin-on" data-slot="twin-choice" aria-selected="true" style="color:#fff;width:120px;height:40px;background:#111;outline:2px solid orange">on</div><div id="twin-off" data-slot="twin-choice" aria-selected="false" style="color:#fff;width:120px;height:40px;background:#111">off</div></section>`;
  await writeFile(join(scratch, "withheld-subject-selection.html"), relationalDocument(orphan + twinned));
  const res = await runCli("snap", ["--file", join(scratch, "withheld-subject-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The tally is unchanged — one cohort withheld, one judged — so the `withheld(...)` token stays the
  // stable machine surface it was, and the subject rides its own trailing segment.
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=2 judged=1 affected=0 populations=0 representatives=0 withheld(unmatchedUnselected=1)");
  expect(res.stdout, "the population row must name the cohort it could not judge").toContain("withheld-at(unmatchedUnselected: #orphan-a (0 of 3 chosen))");
  // The line a reader actually acts on: the NO-VERDICT detail carries the subject beside the count.
  expect(res.stdout, "the refusal must name its subject where the verdict is stated").toMatch(
    /selection-idiom: unmatchedUnselected=1 at #orphan-a \(0 of 3 chosen\)/u,
  );
  // …AND THE COHORT'S CENSUS (#1840), which is what tells the two one-sided shapes apart: three carriers,
  // none chosen, is a cohort waiting for a drive — not a single-member list nothing can twin.
  expect(res.stdout, "the subject must carry the cohort census, not just the element").toContain("(0 of 3 chosen)");
  // The remedy no longer asserts that a drive exists — a cohort with no reachable selected state is a
  // correct, final refusal, and saying so is what stops the fourth identical pass.
  expect(res.stdout).toContain("structurally unjudgeable here");
  // CONTROL: the twinned cohort is still judged and contributes no subject.
  expect(res.stdout).not.toContain("#twin-");
  // The VERDICT is unchanged by this row — a withheld population is still a refusal, still exit 2. Naming
  // the subject makes the refusal actionable; it must not make it quieter.
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(2);
});

test("the aria-pressed toolbar idiom keeps registering after the part partition", async ({ runCli, scratch }) => {
  const toggle = (pressed: boolean, paint: string): string =>
    `<button data-slot="toolbar-toggle" aria-pressed="${pressed}" style="color:#fff;width:80px;height:48px;background:#111;${paint}">B</button>`;
  const toolbar = `<section data-slot="toolbar">${toggle(true, "outline:2px solid orange")}${toggle(false, "")}${toggle(true, "background:#402000")}${toggle(false, "")}${toggle(true, "border-left:3px solid orange")}${toggle(false, "")}</section>`;
  await writeFile(join(scratch, "pressed-toolbar-selection.html"), relationalDocument(toolbar));
  const res = await runCli("snap", ["--file", join(scratch, "pressed-toolbar-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=1 judged=1 affected=1 populations=1 representatives=1 withheld() excluded()");
  expect(res.stdout).toContain("ringx1 · fillx1 · bar-leftx1");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

// ── #1076 (orb-ui audit F4): the ratified inset ring is a recognised selection channel ──────────────
//
// selectionDeltaSignature's box-shadow test vetoed ANY box-shadow containing the substring "inset" —
// the RATIFIED persistent-state ring (`data-pressed:inset-ring-2 inset-ring-ring`,
// toggle/variants.ts:19; memory inset-ring-vs-focus-ring-layers) never registered as a channel at all,
// silently reading "none" on a control that unquestionably paints a selection treatment.

test("selection-idiom recognizes an inset box-shadow ring as its own channel", async ({ runCli, scratch }) => {
  const vocabularies = [
    stateTwin("checked", "outline:2px solid orange"),
    stateTwin("selected", "box-shadow: inset 0 0 0 2px red"),
    stateTwin("current", "border-left:3px solid orange"),
  ].join("");
  await writeFile(join(scratch, "inset-ring-selection.html"), relationalDocument(vocabularies));
  const res = await runCli("snap", ["--file", join(scratch, "inset-ring-selection.html"), "--fail-on", "P2", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "an inset ring must register as its own treatment, not read as 'none'").toContain("ringx1 · inset-ringx1 · bar-leftx1");
});

// ── #1808 (from #1504 claim 2): the comparison BASE is the cohort's modal rest paint ────────────────
//
// `var baseEl = group.unselected[0]` made the whole cohort's verdict a function of DOCUMENT ORDER. The
// first unselected member in the DOM was the sole reference for every selected member, with no check
// that the unselected members paint alike before one of them speaks for all of them — so one atypical
// sibling (a hovered cell, a second authored variant under the same claim) either invented a delta or
// erased one, and nothing in the output said which. The fixtures below plant exactly that skew: the
// ATYPICAL member is first in document order, i.e. the one the old code picked.

/** One authored cohort, deliberately skewed: the selected member paints `paint`, the FIRST unselected
 *  member paints it too (the atypical sibling), and `modal` further unselected members paint the plain
 *  rest state. Under the old base-by-index rule the selected member is compared against its own
 *  treatment and the whole cohort reads "none". */
function skewedCohort(slot: string, kind: "checked" | "current" | "selected", paint: string, modal: number): string {
  const attributes = {
    checked: { on: "data-checked", off: "data-unchecked" },
    current: { on: 'aria-current="page"', off: 'aria-current="false"' },
    selected: { on: "data-selected", off: 'aria-selected="false"' },
  } as const;
  const { on, off } = attributes[kind];
  const cell = (id: string, state: string, style: string): string =>
    `<div id="${id}" data-slot="${slot}-choice" ${state} style="color:#fff;width:120px;height:40px;background:#111;${style}"><span>${id}</span></div>`;
  const rest = Array.from({ length: modal }, (_unused, index) => cell(`${slot}-rest-${String(index)}`, off, "")).join("");
  return `<section data-slot="${slot}">${cell(`${slot}-on`, on, paint)}${cell(`${slot}-skew`, off, paint)}${rest}</section>`;
}

test("the comparison base is the cohort's MODAL rest paint — one atypical unselected sibling no longer erases the whole idiom", async ({ runCli, scratch }) => {
  // Three cohorts, three channels, each skewed the same way. Every cohort's atypical member is the one
  // `unselected[0]` used to select, so the old rule read ring/fill/bar as "no delta at all" and the
  // surface's three selection vocabularies vanished from the census with a clean judged=3.
  const skewed = [
    skewedCohort("ring-group", "checked", "outline:2px solid orange", 2),
    skewedCohort("fill-group", "selected", "background:#402000", 2),
    skewedCohort("bar-group", "current", "border-left:3px solid orange", 2),
  ].join("");
  await writeFile(join(scratch, "modal-baseline-selection.html"), relationalDocument(skewed));
  const res = await runCli("snap", ["--file", join(scratch, "modal-baseline-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout, "the majority rest paint is the reference, so each cohort's real channel registers").toContain("ringx1 · fillx1 · bar-leftx1");
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=3 judged=3 affected=1 populations=1 representatives=1 withheld() excluded()");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

/** A cohort of VARIANTS: no rest paint holds a majority (1:1), and the odd sibling differs from the
 *  selected member in a channel selection never touched. The old base-by-index rule read that variant
 *  difference as part of the selection treatment. */
function variantCohort(slot: string, paint: string): string {
  const cell = (id: string, state: string, style: string): string =>
    `<div id="${id}" data-slot="${slot}-choice" ${state} style="color:#fff;width:120px;height:40px;background:#111;${style}"><span>${id}</span></div>`;
  return `<section data-slot="${slot}">${cell(`${slot}-on`, "data-selected", paint)}${cell(`${slot}-variant`, 'aria-selected="false"', "background:#402000")}${cell(`${slot}-rest`, 'aria-selected="false"', "")}</section>`;
}

test("with no majority rest paint the delta is the SMALLEST over the cohort's variants — a variant's own paint is not a selection treatment", async ({
  runCli,
  scratch,
}) => {
  // Each cohort's FIRST unselected member is a different authored variant (its own fill), so the old rule
  // credited that fill to the selection idiom and printed compound signatures — `fill+ring` for a control
  // whose selection paints a ring and nothing else. The minimum over the distinct rest paints is the only
  // channel set selection is responsible for, and the fallback announces itself in the population row.
  const variants = [
    variantCohort("ring-variant", "outline:2px solid orange"),
    variantCohort("fill-variant", "background:#204020"),
    variantCohort("bar-variant", "border-left:3px solid orange"),
  ].join("");
  await writeFile(join(scratch, "variant-baseline-selection.html"), relationalDocument(variants));
  const res = await runCli("snap", ["--file", join(scratch, "variant-baseline-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout, "no compound signature may borrow the variant sibling's own fill").toContain("ringx1 · fillx1 · bar-leftx1");
  expect(res.stdout, "the fallback is tagged, never silent").toContain("carried(heterogeneousRest=3)");
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=3 judged=3 affected=1 populations=1 representatives=1 withheld() excluded()");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("a box-shadow combining an unchanged outer ring with a new inset ring counts inset-ring only, once", async ({ runCli, scratch }) => {
  const vocabularies = [
    stateTwin("checked", "outline:2px solid orange"),
    // The outer glow (`0 0 5px #fff`) sits on BOTH twins (baseStyle) and does not change — a genuine
    // focus-ring-style layer that happens to compose alongside the selection state's inset ring must not
    // be credited to the selection idiom twice just because it rides in the same `box-shadow` shorthand.
    stateTwin("selected", "box-shadow: 0 0 5px #fff, inset 0 0 0 2px red", "box-shadow: 0 0 5px #fff"),
    stateTwin("current", "border-left:3px solid orange"),
  ].join("");
  await writeFile(join(scratch, "inset-ring-mixed-selection.html"), relationalDocument(vocabularies));
  const res = await runCli("snap", ["--file", join(scratch, "inset-ring-mixed-selection.html"), "--fail-on", "P2", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "the unchanged outer ring is not a second treatment beside the new inset ring").toContain("ringx1 · inset-ringx1 · bar-leftx1");
  expect(res.stdout, "the mixed shadow must not register as a compound inset-ring+shadow signature").not.toContain("shadowx");
});

// THE ALL-CHOSEN COHORT IS THE OTHER ONE-SIDED SHAPE, AND IT NEEDS THE OPPOSITE DRIVE (#1840).
//
// Measured on Backup & Restore (side-eye 2026-09-06): eleven checkboxes, every one checked because the
// group's default is "include everything" (`export-library-section.tsx` seeds every exportable kind), which
// withheld `unmatchedSelected` and held every Config design-audit at `population-verdict=NO-VERDICT`. The
// withholding is #987's ruling and is UNCHANGED — with no unselected member there is no delta to measure —
// but the printed remedy said "a one-row list cannot answer this rule", so a reader following it looked for
// a one-row list and found eleven. The census in the subject is what tells the two apart.
test("an ALL-CHOSEN cohort names its census, and its remedy is the DEselect drive", async ({ runCli, scratch }) => {
  // Four carriers of one authored cohort, every one chosen — the Backup fieldset's shape, reduced.
  const bulk = `<section data-slot="bulk-group">${["a", "b", "c", "d"]
    .map(
      (id) =>
        `<div id="bulk-${id}" data-slot="bulk-choice" aria-checked="true" style="color:#fff;width:120px;height:40px;background:#111;outline:2px solid orange">${id}</div>`,
    )
    .join("")}</section>`;
  await writeFile(join(scratch, "all-chosen-selection.html"), relationalDocument(bulk));
  const res = await runCli("snap", ["--file", join(scratch, "all-chosen-selection.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  expect(res.stdout).toContain("withheld(unmatchedSelected=1)");
  expect(res.stdout, "the census distinguishes a bulk-default group from a single-member one").toContain("(4 of 4 chosen)");
  expect(res.stdout, "the remedy names the DEselect drive, not a one-row list").toContain("drive the surface so one member is DEselected");
  expect(res.stdout, "the retired text must not survive anywhere").not.toContain("a one-row list cannot answer this rule");
  await expect(res).toExitWith(2);
});
