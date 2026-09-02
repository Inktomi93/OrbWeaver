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
