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
//
// AND THE JSON ARTIFACT IS A THIRD READER (#1087 F1). stdout and the exit code carried the truncation from
// the start; the artifact did not, so a JSON consumer read `populationVerdict: "complete"` with no trace of
// the bound. That is worst for the four rung-1 WALKER-PROVEN families, which have no population row to
// inspect either — the artifact was their only channel and it read clean over dropped findings. The
// `overflows` test below is exactly that shape, and it asserts the artifact, not stdout.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

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
  const res = await runCli("snap", ["--file", join(scratch, "cap-exceeded.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

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

/** `census-quality.ts`'s bound for the text-overflow census — a rung-1 WALKER-PROVEN family, so every
 *  returned sample IS a finding and a silent bound DELETED findings rather than shrinking a denominator. */
const OVERFLOW_CAP = 100;

/** A block-mode spill with NO affordance: `overflow: hidden` + `nowrap`, no `text-overflow: ellipsis` and
 *  no `title`/`aria-label` (either would be a recoverable truncation the walker silences by design, #825). */
function spillCarriers(count: number): string {
  const rows: string[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(`<div class="spill" id="s${String(i)}">row ${String(i)} carries far more text than sixty pixels can ever show</div>`);
  }
  return `<style>.spill { width: 60px; overflow: hidden; white-space: nowrap; }</style>${rows.join("")}`;
}

test("a truncated rung-1 census reaches the JSON artifact, which has no population row to fall back on", async ({ runCli, scratch }) => {
  const over = OVERFLOW_CAP + 1;
  await writeFile(join(scratch, "overflow-cap.html"), relationalDocument(spillCarriers(over)));
  const res = await runCli("snap", ["--file", join(scratch, "overflow-cap.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as {
    readonly censusCaps: Readonly<Record<string, { readonly cap: number; readonly dropped: number }>> | null;
    readonly censusCapVerdict: unknown;
    readonly populationVerdict: unknown;
    readonly findings: readonly { readonly rule: string }[];
  };

  // THE EXACT SHAPE THAT USED TO READ CLEAN: no `censusCaps` key at all, and `populationVerdict:"complete"`
  // because `text-overflow` is rung 1 and publishes no population row for a cap to appear in.
  expect(report.censusCaps?.["overflows"], "the artifact must carry the family, its bound, and the exact drop").toEqual({
    cap: OVERFLOW_CAP,
    dropped: 1,
  });
  expect(report.censusCapVerdict, "and its own verdict, so a consumer never has to infer it from a count").toMatchObject({ verdict: "NO VERDICT" });
  // The findings list is genuinely short by one — which is the point: this family's samples ARE its findings.
  expect(report.findings.filter((finding) => finding.rule === "text-overflow")).toHaveLength(OVERFLOW_CAP);
  await expect(res).toExitWith(2);
});

test("a census that fits inside its bound keeps judging and publishes no cap arm", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "cap-fits.html"), relationalDocument(shadowCarriers(SHADOW_GLOW_CAP)));
  const res = await runCli("snap", ["--file", join(scratch, "cap-fits.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The negative control the doctrine owes: the refusal must be a TRIPWIRE, not a tax every run pays.
  expect(res.stdout).toContain(`POPULATION   glow-shadow candidates=${String(SHADOW_GLOW_CAP)} judged=${String(SHADOW_GLOW_CAP)}`);
  expect(res.stdout, "a family that had room must not withhold anything").not.toContain("capExceeded");
  expect(res.stdout, "a bound that did not bite is not an instrument failure").not.toContain("the capped censuses' completeness is ABSENT");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("the artifact carries the cap ledger and a complete verdict when nothing truncated", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "cap-fits-json.html"), relationalDocument(shadowCarriers(SHADOW_GLOW_CAP)));
  const res = await runCli("snap", ["--file", join(scratch, "cap-fits-json.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as {
    readonly censusCaps: Readonly<Record<string, { readonly cap: number; readonly dropped: number }>> | null;
    readonly censusCapVerdict: unknown;
    readonly hoverPass: { readonly forceFailedGroups: number } | null;
    readonly forceVerdict: unknown;
  };

  // The ledger is PRESENT with dropped 0, never absent: "absent" and "nothing dropped" have to be two
  // different readings, or the field's disappearance is invisible — the same silence the ledger ended.
  expect(report.censusCaps?.["shadowGlows"]).toEqual({ cap: SHADOW_GLOW_CAP, dropped: 0 });
  expect(report.censusCapVerdict).toBe("complete");
  // #1087 F2: the COMPLETE group-failure count is serialized, not just the ≤3 quoted reasons.
  expect(report.hoverPass?.forceFailedGroups).toBe(0);
  expect(report.forceVerdict).toBe("complete");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});
