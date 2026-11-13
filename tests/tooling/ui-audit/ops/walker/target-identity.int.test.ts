// The CONSUMER half of the variant-axis stamp (#1080), through real computed layout: does an authored
// stamp actually SPLIT the #983 decision population?
//
// The audit's F8 finding was a collapse — two different authored size arms of ONE primitive inside ONE
// home folded into a single "authored target-size decision", i.e. one repair row where two decisions
// exist, with a muddled min–max range. `TARGET_VARIANT_ATTRS` could always read the attributes; nothing in
// @orb/ui EMITTED them. Both arms below are the same two undersized buttons in the same home — the only
// difference is the stamp the primitives now carry — so the pair is the before/after of the fix rather
// than a fence: 1 population without it, 2 with it.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "@orb/testkit/node";
import { expect, expectSnapParity, test } from "@orb/testkit/tooling";
import type { VariantAxisAttrs } from "#ui/lib/variant-attrs.ts";
import { variantAttrs } from "#ui/lib/variant-attrs.ts";
import { buttonVariants } from "#ui/primitives/button/variants.ts";

configureRelationalCliBudget();

/** Two undersized offered controls in one authored home; `stamp` is what the primitive emits per arm. */
function toolbar(stamps: readonly [string, string]): string {
  const cell = (stamp: string, name: string): string =>
    `<button data-slot="button" ${stamp} aria-label="${name}" style="width:20px;height:20px">${name}</button>`;
  return `<section data-slot="toolbar">${cell(stamps[0], "one")}${cell(stamps[1], "two")}</section>`;
}

/** The attributes the production Button recipe stamps for one box, spelled as markup. */
function buttonStamp(square: boolean): string {
  const attrs: VariantAxisAttrs = variantAttrs(buttonVariants, { variant: "ghost", tone: "neutral", size: "md", square }, "neutral");
  return Object.entries(attrs)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
}

test("two authored variant arms in one home are TWO tap-target decisions", async ({ runCli, runSnap, scratch }) => {
  await writeFile(
    join(scratch, "stamped-arms.html"),
    relationalDocument(toolbar(['data-glyph="xs" data-variant="ghost"', 'data-size="lg" data-variant="solid"'])),
  );
  const res = await expectSnapParity({ runCli, runSnap }, ["--file", join(scratch, "stamped-arms.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=2 representatives=2");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("a square and a text Button of one step are TWO decisions, from the recipe's own stamp", async ({ runSnap, scratch }) => {
  // The square box is its own width decision at the step's height, so it must not share the text button's cohort.
  const square = buttonStamp(true);
  const text = buttonStamp(false);
  expect(square).toContain('data-size="md"');
  expect(text).toContain('data-size="md"');
  await writeFile(join(scratch, "square-text.html"), relationalDocument(toolbar([square, text])));
  const res = await runSnap(["--file", join(scratch, "square-text.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=2 representatives=2");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("two square Buttons of one step stay ONE decision", async ({ runSnap, scratch }) => {
  const square = buttonStamp(true);
  await writeFile(join(scratch, "square-pair.html"), relationalDocument(toolbar([square, square])));
  const res = await runSnap(["--file", join(scratch, "square-pair.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=1 representatives=2");
});

test("the SAME two controls with no stamp collapse into ONE decision — the F8 defect verbatim", async ({ runSnap, scratch }) => {
  await writeFile(join(scratch, "unstamped-arms.html"), relationalDocument(toolbar(["", ""])));
  const res = await runSnap(["--file", join(scratch, "unstamped-arms.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=1 representatives=2");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("one shared arm still collapses — the split is the AXIS VALUE, not the attribute's presence", async ({ runCli, runSnap, scratch }) => {
  // The permissive direction: if the key merely noticed that an attribute exists, a rail of identically
  // sized buttons would fragment into one population per button and every repair row would be a singleton.
  await writeFile(join(scratch, "same-arm.html"), relationalDocument(toolbar(['data-glyph="xs"', 'data-glyph="xs"'])));
  // The parity case again, after the file's other runs have used the shared browser.
  const res = await expectSnapParity({ runCli, runSnap }, ["--file", join(scratch, "same-arm.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=1 representatives=2");
});
