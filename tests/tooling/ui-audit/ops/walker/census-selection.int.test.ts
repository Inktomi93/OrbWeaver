// Adversarial selection-delta controls for #984 through real computed paint.
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
  expect(res.stdout).toContain("POPULATION   selection-idiom candidates=3 judged=3 affected=0 populations=0 representatives=0");
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
