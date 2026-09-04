// The CONSUMER half of the variant-axis stamp (#1080), through real computed layout: does an authored
// `data-size`/`data-intent` actually SPLIT the #983 decision population?
//
// The audit's F8 finding was a collapse — two different authored size arms of ONE primitive inside ONE
// home folded into a single "authored target-size decision", i.e. one repair row where two decisions
// exist, with a muddled min–max range. `TARGET_VARIANT_ATTRS` could always read the attributes; nothing in
// @orb/ui EMITTED them. Both arms below are the same two undersized buttons in the same home — the only
// difference is the stamp the primitives now carry — so the pair is the before/after of the fix rather
// than a fence: 1 population without it, 2 with it.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** Two undersized offered controls in one authored home; `stamp` is what the primitive emits per arm. */
function toolbar(stamps: readonly [string, string]): string {
  const cell = (stamp: string, name: string): string =>
    `<button data-slot="button" ${stamp} aria-label="${name}" style="width:20px;height:20px">${name}</button>`;
  return `<section data-slot="toolbar">${cell(stamps[0], "one")}${cell(stamps[1], "two")}</section>`;
}

test("two authored variant arms in one home are TWO tap-target decisions", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "stamped-arms.html"),
    relationalDocument(toolbar(['data-size="glyph-xs" data-intent="ghost"', 'data-size="lg" data-intent="primary"'])),
  );
  const res = await runCli("snap", ["--file", join(scratch, "stamped-arms.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=2 representatives=2");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("the SAME two controls with no stamp collapse into ONE decision — the F8 defect verbatim", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "unstamped-arms.html"), relationalDocument(toolbar(["", ""])));
  const res = await runCli("snap", ["--file", join(scratch, "unstamped-arms.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=1 representatives=2");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("one shared arm still collapses — the split is the AXIS VALUE, not the attribute's presence", async ({ runCli, scratch }) => {
  // The permissive direction: if the key merely noticed that an attribute exists, a rail of identically
  // sized buttons would fragment into one population per button and every repair row would be a singleton.
  await writeFile(join(scratch, "same-arm.html"), relationalDocument(toolbar(['data-size="glyph-xs"', 'data-size="glyph-xs"'])));
  const res = await runCli("snap", ["--file", join(scratch, "same-arm.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   tap-target candidates=2 judged=2 affected=2 populations=1 representatives=2");
});
