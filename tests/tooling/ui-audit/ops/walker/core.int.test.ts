// THE CAP LEDGER, both directions, through the real CLI (#1038).
//
// MIRRORS `ops/walker/core.ts` — the ledger's home (`censusCaps` + `capPush`). The bounds it enforces
// are declared in census-glow.ts / census-decor.ts / census-quality.ts, but the counting, the drop
// tally and the shape Node reads all live in core, which is what this file pins.
//
// WHAT WAS BROKEN. Nine walker censuses stopped PUSHING at a representative bound, and the loop guard
// (`… && list.length < 200`) stopped the SCAN at the same moment — so a page past the bound published a
// `candidates=` that read complete, over a sample of its first N carriers. For the five families feeding
// an accounted rule that is a truncated denominator; for the four rung-1 WALKER-PROVEN families
// (lib/collect.ts's rung table) the walker returns only findings, so the carriers past the bound were not
// under-counted, they were DELETED.
//
// WHY THIS TIER. The bound lives inside COLLECT_SAMPLES_JS — a hand-written JS string evaluated in a real
// browser — so nothing below the CLI can reach it. The fixtures are therefore documents with a known
// carrier count either side of a real bound, and the assertions are the two channels a reader actually
// uses: the rule's own POPULATION line (`withheld(capExceeded=…)`) and the run-level refusal
// (`censusCapGap`). The shadows are ACHROMATIC on purpose — this file is about the LEDGER, not about the
// glow verdict, and an achromatic elevation shadow is a judged pass rather than 200 findings of noise.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** `census-glow.ts`'s own bound. Hardcoded rather than imported: the value lives inside a template
 *  literal the type system cannot reach, and a test that derived it from the same string could never
 *  disagree with it. */
const SHADOW_GLOW_CAP = 200;

function shadowCarriers(count: number): string {
  const rows: string[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(`<div class="carrier" id="c${String(i)}">row ${String(i)}</div>`);
  }
  return `<style>.carrier { width: 200px; height: 12px; margin: 2px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); }</style>${rows.join("")}`;
}

test("a census past its bound publishes the exact overflow and refuses the run", async ({ runCli, scratch }) => {
  const over = SHADOW_GLOW_CAP + 3;
  await writeFile(join(scratch, "cap-exceeded.html"), relationalDocument(shadowCarriers(over)));
  const res = await runCli("ui-audit", ["/cap-exceeded.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // THE DENOMINATOR IS COMPLETE. Pre-#1038 this line read `candidates=200 judged=200` — the truncated
  // count wearing the shape of a whole page. The scan now runs past the bound, so the overflow is EXACT.
  expect(res.stdout, "the rule's candidate count must be the whole censused population, not the carried sample").toContain(
    `POPULATION   glow-shadow candidates=${String(over)} judged=${String(SHADOW_GLOW_CAP)}`,
  );
  // WITHHELD, never excluded: a bound the instrument hit is the absence of a measurement, and the reason
  // is `capExceeded` rather than `cap` (which is the Node-side representative cap over judged findings).
  expect(res.stdout, "the overflow must ride the withheld map so populationEvidenceGap sees it").toMatch(/glow-shadow .*withheld\(capExceeded=3\)/u);
  // THE RUN-LEVEL HALF — the reader who looks at the verdict line, not the rule table.
  expect(res.stdout).toContain("INSTRUMENT ERROR  the capped censuses' completeness is ABSENT — this run is not a verdict");
  expect(res.stdout).toContain(`shadowGlows: 3 past a bound of ${String(SHADOW_GLOW_CAP)}`);
  await expect(res).toExitWith(2);
});

test("a census that fits inside its bound keeps judging and publishes no cap arm", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "cap-fits.html"), relationalDocument(shadowCarriers(SHADOW_GLOW_CAP)));
  const res = await runCli("ui-audit", ["/cap-fits.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The negative control the doctrine owes: the refusal must be a TRIPWIRE, not a tax every run pays.
  expect(res.stdout).toContain(`POPULATION   glow-shadow candidates=${String(SHADOW_GLOW_CAP)} judged=${String(SHADOW_GLOW_CAP)}`);
  expect(res.stdout, "a family that had room must not withhold anything").not.toContain("capExceeded");
  expect(res.stdout, "a bound that did not bite is not an instrument failure").not.toContain("the capped censuses' completeness is ABSENT");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});
