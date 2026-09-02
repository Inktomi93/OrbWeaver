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
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument, stateTwin } from "../../../../support/ui-audit-relational.ts";

test("selection-idiom ignores invariant base paint when selected and unselected twins use the same channel", async ({ runCli, scratch }) => {
  const invariant = [
    stateTwin("selected", "", "background:#333"),
    stateTwin("selected", "", "border:3px solid #fff"),
    stateTwin("selected", "", "box-shadow:0 0 5px #fff"),
  ].join("");
  await writeFile(join(scratch, "invariant-selection-paint.html"), relationalDocument(invariant));
  const res = await runCli("ui-audit", ["/invariant-selection-paint.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
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
    const reportPath = join(scratch, `${label}-only-selection.json`);
    await writeFile(
      join(scratch, `${label}-only-selection.html`),
      relationalDocument(`<section data-slot="choice-group"><div data-slot="choice" ${attribute} style="width:120px;height:40px">orphan</div></section>`),
    );
    const res = await runCli("ui-audit", [`/${label}-only-selection.html`, "--base", `file://${scratch}`, "--out", reportPath], {
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
    const res = await runCli("ui-audit", [`/comparable-${label}-only-selection.html`, "--base", `file://${scratch}`], {
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
  const res = await runCli("ui-audit", ["/cross-kind-selection.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
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
  const res = await runCli("ui-audit", ["/wrapped-selection-twin.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  // One authored cohort across both row wrappers — judged, and NOT a second withheld row for the wrapper
  // whose slice happens to hold no selected cell.
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=1 judged=1 affected=0 populations=0 representatives=0 withheld() excluded()");
  expect(res.stdout).not.toContain("unmatchedUnselected");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
});

test("a cohort that is genuinely one-sided ACROSS those wrappers is still withheld — #987 :208 survives the regrouping", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "wrapped-selection-orphan.html"), relationalDocument(gridRows(false)));
  const res = await runCli("ui-audit", ["/wrapped-selection-orphan.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
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
  const res = await runCli("ui-audit", ["/radiogroup-picker-selection.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
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
  const res = await runCli("ui-audit", ["/nested-aria-carrier-selection.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  // Two judged cohorts: the tiles, AND the nested lock buttons — a real control inside a selected ancestor
  // keeps its own aria state and therefore its own comparison. Only the paint-hook-only mark is excluded.
  expect(res.stdout).toContain(
    "POPULATION   selection-idiom candidates=3 judged=2 affected=0 populations=0 representatives=0 withheld() excluded(nestedStatePart=1)",
  );
  expect(res.stdout).not.toContain("selection-idiom: unmatched");
});

test("the aria-pressed toolbar idiom keeps registering after the part partition", async ({ runCli, scratch }) => {
  const toggle = (pressed: boolean, paint: string): string =>
    `<button data-slot="toolbar-toggle" aria-pressed="${pressed}" style="color:#fff;width:80px;height:48px;background:#111;${paint}">B</button>`;
  const toolbar = `<section data-slot="toolbar">${toggle(true, "outline:2px solid orange")}${toggle(false, "")}${toggle(true, "background:#402000")}${toggle(false, "")}${toggle(true, "border-left:3px solid orange")}${toggle(false, "")}</section>`;
  await writeFile(join(scratch, "pressed-toolbar-selection.html"), relationalDocument(toolbar));
  const res = await runCli("ui-audit", ["/pressed-toolbar-selection.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=1 judged=1 affected=1 populations=1 representatives=1 withheld() excluded()");
  expect(res.stdout).toContain("ringx1 · fillx1 · bar-leftx1");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});
