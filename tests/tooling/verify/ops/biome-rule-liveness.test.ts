// THE RULE HALF's permanent pin, rebuilt on its successor (#2074). `97e68be91` deleted
// `biome-grant-liveness` arm six under §12.3 (a final policy may not write a file and spawn a child) and
// deleted these controls with it, leaving the question UNASKED: path liveness proves the granted SUBJECT
// exists and never that the granted RULE still fires, so a rule-off override on a file that stopped
// violating the rule is invisible to every surviving arm — and the next violation written at that path
// inherits an exemption nobody granted it.
//
// Every arm here is a planted control in a named direction. A PLANTED dead grant reds and names path+rule;
// the repo's real grants stay live in the same invocation (so the red is not "the probe measures nothing");
// a MIXED row is the declared limit and is skipped, not judged; and every report shape the arm cannot
// trust REFUSES rather than reading as DEAD — which is the failure that matters most here, because a
// truncated, broken or zero-file run produces an EMPTY diagnostic list that is byte-identical to "every
// grant is dead" and would red the whole config.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe } from "vitest";
import type { RuleGrant } from "../../../../tooling/src/verify/lib/biome-rule-liveness.ts";
import { judgeReport, judgeRuleLiveness } from "../../../../tooling/src/verify/lib/biome-rule-liveness.ts";
import { ruleLivenessReport, runBiomeRuleLiveness } from "../../../../tooling/src/verify/ops/biome-rule-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFIG_REL = "biome.json";
const KIT_BARREL = "packages/kit/src/index.ts";
const DEAD_RULE = "useFilenamingConvention";
const PROBE_PREFIX = "__g_biome-rule-liveness.";
/** A SPAWN budget (one real biome run over ~25 files), so it degrades with load: generous on purpose. */
const RUN_TIMEOUT_MS = scaledBudget(120_000);
/** The repo's own live rule-off population on the measuring day was 18 grants over 23 files. The floors
 *  sit well under that — they exist so a run that measured almost nothing cannot read as a clean verdict,
 *  not as a count nobody may change. */
const MIN_LIVE_GRANTS = 10;
const MIN_PROBED_FILES = 10;

function ruleOffOverride(includes: readonly string[]): Record<string, unknown> {
  return { includes, linter: { rules: { style: { [DEAD_RULE]: "off" } } } };
}

/** biome.json's real text with extra overrides spliced in — the planted-control substrate. */
function configWithOverrides(repoRoot: string, extra: readonly Record<string, unknown>[]): string {
  const parsed = JSON.parse(readFileSync(join(repoRoot, CONFIG_REL), "utf8")) as { overrides: unknown[] };
  return JSON.stringify({ ...parsed, overrides: [...parsed.overrides, ...extra] });
}

function plant(root: string, rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

describe("the RULE arm, planted controls in BOTH directions", () => {
  test(
    "a DEAD rule-off grant reds naming path+rule, a MIXED row is the declared limit, and the real grants stay live",
    ({ repoRoot }) => {
      const configText = configWithOverrides(repoRoot, [ruleOffOverride([KIT_BARREL]), ruleOffOverride(["packages/kit/src/**", KIT_BARREL])]);
      const outcome = judgeRuleLiveness({ root: repoRoot, configText, isExactPath: (path) => !/[*?[\]{}]/u.test(path) });
      // The planted grant is the ONLY dead one: kit's barrel is kebab-case, so useFilenamingConvention
      // suppresses nothing there — the exact control the #1158 audit planted when it proved the gate blind.
      expect(outcome.dead.map((grant) => `${grant.rule} ${grant.anchor}`)).toEqual([`${DEAD_RULE} ${KIT_BARREL}`]);
      // …and the SAME grant on a row that also carries a glob is silent: its subject is the expansion.
      expect(outcome.skippedMixed).toBeGreaterThanOrEqual(1);
      // The other direction, over the repo's own rule-off grants: a substantial live population, not zero.
      expect(outcome.live).toBeGreaterThanOrEqual(MIN_LIVE_GRANTS);
      expect(outcome.filesProbed).toBeGreaterThanOrEqual(MIN_PROBED_FILES);
      // The dead grant reaches the operator as a named instruction, not as a count.
      const report = ruleLivenessReport(outcome).join("\n");
      expect(report).toContain(`\`style/${DEAD_RULE}\` over ${KIT_BARREL} suppresses NOTHING`);
    },
    RUN_TIMEOUT_MS,
  );

  test("the probe config never survives the run — a leftover would be linted by the next `pnpm check`", ({ repoRoot }) => {
    expect(readdirSync(repoRoot).filter((name) => name.startsWith(PROBE_PREFIX))).toEqual([]);
  });

  test("no biome binary under the root REFUSES loudly — it never calls every grant live", ({ scratch }) => {
    plant(scratch, KIT_BARREL, "export const x = 1;\n");
    const configText = JSON.stringify({ overrides: [ruleOffOverride([KIT_BARREL])] });
    expect(() => judgeRuleLiveness({ root: scratch, configText, isExactPath: () => true })).toThrow(/biome binary/u);
  });

  test("an ABSENT biome.json REFUSES at the op — there are no grants to judge, and a clean exit would claim there were none", ({ scratch }) => {
    expect(() => runBiomeRuleLiveness(scratch)).toThrow(/is not on the tree/u);
  });
});

// A CROSS-PROCESS NAMESPACE NEEDS A PER-PROCESS PREDICATE. The probe config is written at the REPO ROOT
// (biome re-roots its project when `--config-path` points outside the repo, so a temp dir answers a
// different question), which makes the probe name a shared namespace across every concurrent checkout.
// The sweep that clears a killed run's leftovers used to delete EVERY probe it found — including a live
// sibling's, whose biome then lints against a vanished config. Same disease as a `tmpdir()` census that
// answers a question about the BOX rather than about this run.
describe("the stale-probe sweep is scoped to DEAD owners", () => {
  test("a probe owned by a LIVE process survives the sweep; one owned by a dead pid is cleared", ({ scratch }) => {
    plant(scratch, KIT_BARREL, "export const x = 1;\n");
    // The sibling's pid is our PARENT's, not our own: this run writes (and its `finally` deletes) the
    // probe named for `process.pid`, so using that here would measure the run's own cleanup instead.
    const live = `${PROBE_PREFIX}${String(process.ppid)}.json`;
    // A pid that cannot be running: 2^22 + 1 is above every Linux pid_max default.
    const dead = `${PROBE_PREFIX}4194305.json`;
    const malformed = `${PROBE_PREFIX}not-a-pid.json`;
    for (const name of [live, dead, malformed]) {
      writeFileSync(join(scratch, name), "{}");
    }
    // The sweep runs inside `judgeRuleLiveness`, which then refuses for want of a biome binary — the
    // refusal is irrelevant here; what matters is which probes it left behind on the way.
    expect(() =>
      judgeRuleLiveness({ root: scratch, configText: JSON.stringify({ overrides: [ruleOffOverride([KIT_BARREL])] }), isExactPath: () => true }),
    ).toThrow(/biome binary/u);
    expect(existsSync(join(scratch, live)), "a concurrent sibling's probe was deleted out from under it").toBe(true);
    expect(existsSync(join(scratch, dead))).toBe(false);
    expect(existsSync(join(scratch, malformed))).toBe(false);
  });
});

describe("a rule verdict this arm cannot trust is a REFUSAL, never a DEAD grant", () => {
  const grants: readonly RuleGrant[] = [{ group: "style", rule: DEAD_RULE, files: [KIT_BARREL], anchor: KIT_BARREL }];

  test("a TRUNCATED report refuses — every grant past the cut would read as dead", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 3 }, diagnostics: [] });
    expect(() => judgeReport(grants, stdout)).toThrow(/TRUNCATED/u);
  });

  test("a non-lint diagnostic (a broken probe config) refuses", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 0 }, diagnostics: [{ category: "internalError/fs" }] });
    expect(() => judgeReport(grants, stdout)).toThrow(/probe config is broken/u);
  });

  test("output that is not the reporter's shape refuses", () => {
    expect(() => judgeReport(grants, "not json")).toThrow(/did not parse/u);
    expect(() => judgeReport(grants, JSON.stringify({ hello: 1 }))).toThrow(/reporter shape changed/u);
  });

  test("a report over ZERO processed files refuses — a config biome could not parse reads as ALL-DEAD (#1245)", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 0, changed: 0, unchanged: 0 }, diagnostics: [] });
    expect(() => judgeReport(grants, stdout)).toThrow(/processed 0 of 1 probe files/u);
  });

  test("the same empty diagnostic list over files biome DID process is a live judgement, not a refusal", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 0, changed: 0, unchanged: 1 }, diagnostics: [] });
    expect(judgeReport(grants, stdout).dead).toEqual(grants);
  });

  test("a report where the rule DID fire leaves the grant live — the control's other direction", () => {
    const stdout = JSON.stringify({
      summary: { diagnosticsNotPrinted: 0 },
      diagnostics: [{ category: `lint/style/${DEAD_RULE}`, location: { path: KIT_BARREL } }],
    });
    expect(judgeReport(grants, stdout).dead).toEqual([]);
  });
});

// ─── #2171 / #2172: the two zeros this arm must never confuse ───────────────────────────────────────
//
// Both live on the FAILURE path of one module, so they are pinned together and each row states which of
// the two zeros it is about. Neither needs a biome spawn: a vanished subject set is decided by `existsSync`
// before biome is ever invoked, and a malformed config is decided by the parse.

test("EVERY granted subject vanished reads DEAD, never `live` over 0 probed files (#2171)", ({ repoRoot }) => {
  // A judgeable row (exact include, no glob) whose file is NOT on the tree. `grant.files` is
  // `exactIncludes(...).filter(existsSync)`, so this is the empty-subject case.
  const configText = JSON.stringify({ overrides: [ruleOffOverride(["packages/kit/src/__absent-subject__.ts"])] });
  const outcome = judgeRuleLiveness({ root: repoRoot, configText, isExactPath: () => true });

  // THE DEFECT: this returned `live: 1, dead: []` — a LIVE count for a grant nothing measured, printed by
  // the operator line as `1 live · 0 dead … over 0 probed file(s)`.
  expect(outcome.live).toBe(0);
  expect(outcome.dead).toHaveLength(1);
  expect(outcome.dead[0]?.rule).toBe(DEAD_RULE);
  expect(outcome.filesProbed).toBe(0);
  // The (file × rule) denominator and its dead subset agree: nothing survived, so nothing is unaccounted.
  expect(outcome.deadFilePairs).toBe(outcome.filePairs);
});

test("NO grants at all stays honest — nothing dead, nothing live, and no refusal (#2171 boundary)", ({ repoRoot }) => {
  // The adjacent zero, and the reason the fix is not "empty ⇒ dead" unconditionally: a config with no
  // rule-off grants has nothing to judge, and reporting a phantom dead grant would be the mirror defect.
  const outcome = judgeRuleLiveness({ root: repoRoot, configText: JSON.stringify({ overrides: [] }), isExactPath: () => true });
  expect(outcome).toMatchObject({ dead: [], live: 0, filesProbed: 0, filePairs: 0, deadFilePairs: 0 });
});

test("a malformed biome.json refuses in the module's own words, naming file, arm and non-verdict (#2172)", ({ repoRoot }) => {
  // The exit CLASS was already right (a throw reaches run-tool as exit 2); the MESSAGE was V8's
  // `Expected property name or '}' in JSON at position 2`, which names none of the three.
  expect(() => judgeRuleLiveness({ root: repoRoot, configText: '{"overrides": [,]}', isExactPath: () => true })).toThrow(
    /biome-grant-liveness rule arm: biome\.json did not parse as JSON.*NOT a verdict/su,
  );
});

test("the two failure paths do not interact: a malformed config refuses BEFORE the empty-subject arm (#2171 + #2172)", ({ repoRoot }) => {
  // Both rows touch the same function. A malformed config would also produce zero grants, so if the parse
  // refusal were ordered after the empty-subject branch the #2172 message would be unreachable and this
  // suite would still be green on every other row.
  let caught: unknown;
  try {
    judgeRuleLiveness({ root: repoRoot, configText: "{ not json", isExactPath: () => true });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain("biome.json did not parse as JSON");
  // V8's position detail is preserved rather than swallowed.
  expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
});
