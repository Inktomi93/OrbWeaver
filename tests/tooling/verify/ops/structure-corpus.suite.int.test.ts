// Public structure entrypoints reconcile owned ordinary fixtures with real reviewed-grant/resource policies.
// Authority, loader and artifact behavior must not depend on a borrowed application policy's lifetime.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { POLICY_PHASES } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { FinalPolicyRow, StructurePolicyReport, StructureReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { WAIVER_BUDGET_ENV } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { scaledBudget } from "../../_load-budget.ts";
import {
  ORDINARY_POLICY as ORDINARY,
  ORDINARY_COLUMN,
  ORDINARY_LINE,
  ORDINARY_MARKER,
  ORDINARY_MESSAGE,
  ORDINARY_SUBJECT,
  ordinaryPolicyModule,
} from "./_ordinary-policy-fixture.ts";

const GATES = "tooling/src/verify/gates";
/** A spawned mixed run over a planted root loads the harness Project and both dispatchers: ~3-6 s quiet. */
const RUN_TIMEOUT_MS = scaledBudget(120_000);

/** An id that names NOTHING in any corpus — the subject of the unknown-policy waiver alarm below. `probe-`
 *  marks it as this suite's own fixture rather than a corpus member anyone could mistake for a real gate. */
const ABSENT_POLICY = "probe-no-such-policy";
const REVIEWED = "scrubber-home";
/** A planted hard resource policy over the `docs` authored tree, which none of the planted roots below holds. */
const HARD_RESOURCE = "planted-resource";
const HARD_RESOURCE_TREE = "docs";
/** THE NONBLOCKING-WARNING SUBJECT IS PLANTED, NOT BORROWED (#2497) — this file's own §"MATERIALIZE the
 *  premise" lesson, applied to SEVERITY. It used to shim the live `over-art-plate-arm` for its
 *  `severity: "warning"`; `8300c13bbc` raised that policy to `"error"` (its warning-debt flip condition was met
 *  at #2389) and the reconciliation arm below silently measured ZERO warnings — the middle term of the
 *  equation it exists to prove. A severity another owner may flip is not a premise to borrow. */
const WARNING_POLICY_ID = "planted-warning";
const WARNING_SUBJECT = "packages/client/src/features/probe/warned.ts";
const WARNING_MARKER = "PLANTED_WARNING_SUBJECT";
const WARNING_SUBJECT_SOURCE = `export const marker = "${WARNING_MARKER}";\n`;
const WARNING_MESSAGE = "planted nonblocking warning";

/** A minimal ordinary/warning policy with a live work item: one finding per file carrying the marker. */
function warningPolicy(repoRoot: string): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  return `import { defineGate } from ${JSON.stringify(contract)};
export const gate = defineGate({
  id: ${JSON.stringify(WARNING_POLICY_ID)},
  family: ${JSON.stringify(WARNING_POLICY_ID)},
  authority: "ordinary",
  severity: "warning",
  workItem: 2497,
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: ${JSON.stringify(WARNING_MESSAGE)},
  fix: "delete the marker, or waive with @orb-waive ${WARNING_POLICY_ID}(position): reason",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      if (sourceFile.getFullText().includes(${JSON.stringify(WARNING_MARKER)})) {
        ctx.report.file(ctx.relativePath(sourceFile), { line: 1, column: 1, message: ${JSON.stringify(WARNING_MESSAGE)} });
      }
    },
  }),
  mustFlag: [{ mode: "source", files: { ${JSON.stringify(WARNING_SUBJECT)}: ${JSON.stringify(WARNING_SUBJECT_SOURCE)} }, why: "the marker" }],
  mustPass: [{ mode: "source", files: { "packages/client/src/features/probe/clean.ts": "export const clean = 1;\\n" }, why: "no marker" }],
} as never);
`;
}

/** A hard resource policy that reports one finding when its tree holds `docs/flag.md`; with no tree it never reaches `evaluate`. */
function resourcePolicy(repoRoot: string): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  return `import { defineGate } from ${JSON.stringify(contract)};
export const gate = defineGate({
  id: ${JSON.stringify(HARD_RESOURCE)},
  application: "resources",
  family: ${JSON.stringify(HARD_RESOURCE)},
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "planted fixture over a ResourceHost tree" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: ${JSON.stringify(HARD_RESOURCE_TREE)} }],
  message: "planted resource finding",
  fix: "remove docs/flag.md",
  create: (ctx) => ({
    evaluate: () => {
      const tree = ctx.resources.authoredTree(${JSON.stringify(HARD_RESOURCE_TREE)});
      if (tree.status === "ready" && tree.value.some((entry) => entry.path === "docs/flag.md")) {
        ctx.report.file("docs/flag.md", { line: 1, column: 1, message: "planted resource finding" });
      }
    },
  }),
  mustFlag: [{ mode: "resource", files: { "docs/flag.md": "x\\n" }, expect: { count: 1 }, why: "the planted flag file" }],
  mustPass: [{ mode: "resource", files: { "docs/ok.md": "x\\n" }, why: "a docs tree without the flag file" }],
});
`;
}

function shim(repoRoot: string, id: string): string {
  return `export { gate } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${id}.ts`)).href)};\n`;
}

/** The actual scrubber factory is licensed only at the retained producer stamp. */
const GRANT_SUBJECT = "packages/server/src/domain/chat/substrate/member-visibility.ts";
const REVIEWED_GRANT_IDS = ["scrubber-home:member-visibility-stamp"] as const;
/** A planted tree is judged against the waivers and grants IT plants, never the real tree's committed budget:
 *  `rows` is the application budget per policy id, and the implementation part is empty. */
const plantedBudget = (rows: Readonly<Record<string, number>>): string => JSON.stringify({ application: rows, implementation: {} });
const STRAY_READ = "packages/client/src/features/probe/x.tsx";
const CLIENT_STRAY_FILE = "packages/client/src/features/probe/y.ts";
const FACTORY_SUBJECT = "packages/kit/src/content/index.ts";
const FACTORY_SOURCE = "export function createHiddenSpanStreamScrubber(): {readonly push:(text:string)=>string} {return {push:text=>text};}\n";
function reviewedLine(subject: string): string {
  const door = relative(dirname(subject), FACTORY_SUBJECT).replaceAll("\\", "/");
  return `import {createHiddenSpanStreamScrubber} from ${JSON.stringify(door.startsWith(".") ? door : `./${door}`)};\nexport const G=createHiddenSpanStreamScrubber();\n`;
}
const REVIEWED_LINE = reviewedLine(STRAY_READ);
const PLATELESS_COMPOSER =
  'html[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n';

function readArtifact(root: string): StructureReport {
  return JSON.parse(readFileSync(join(root, "reports", "check-structure.json"), "utf8")) as StructureReport;
}

function rowOf(report: StructureReport, name: string): FinalPolicyRow {
  const row = report.gates.find((g) => g.name === name);
  if (row === undefined) {
    throw new Error(`no row for ${name} in ${report.gates.map((g) => g.name).join(", ")}`);
  }
  return row;
}

/** The dispatcher's aggregate, which every planted tree here has (a null block means no policy loaded at all). */
function policyOf(report: StructureReport): StructurePolicyReport {
  if (report.policy === null) {
    throw new Error("the artifact carries no final-side block");
  }
  return report.policy;
}

const mixedTree = (repoRoot: string, files: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({
  ".gitignore": "reports/\n.cache/\nnode_modules/\n",
  "tsconfig.json": JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, types: [], lib: ["ES2022", "DOM"], jsx: "preserve" },
    include: ["packages/**/*.ts", "packages/**/*.tsx"],
  }),
  "tooling/tsconfig.json": JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [] },
    include: ["src/verify/gates/**/*.ts"],
  }),
  [`${GATES}/${ORDINARY}.ts`]: ordinaryPolicyModule(repoRoot),
  [`${GATES}/${REVIEWED}.ts`]: shim(repoRoot, REVIEWED),
  [FACTORY_SUBJECT]: FACTORY_SOURCE,
  ...files,
});

async function corpusTree(plant: ToolFixtures["plantedTree"], files: Readonly<Record<string, string>>): Promise<string> {
  const root = await plant(files);
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  execFixtureGit(root, ["add", "."]);
  return root;
}

// ── 1-4. both contracts execute in ONE invocation, contribute to ONE report, distinguishable per contract ─────

test("one invocation runs the whole roster into one artifact, each row in the contract's vocabulary", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await corpusTree(plantedTree, mixedTree(repoRoot, { [ORDINARY_SUBJECT]: ORDINARY_LINE, [STRAY_READ]: REVIEWED_LINE }));
  const res = await withProcessEnv(WAIVER_BUDGET_ENV, plantedBudget({}), () => runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS }));
  expect(policyOf(readArtifact(root)).toolErrors).toEqual([]);
  // violations, no tool error: exit 1, one artifact, one completeness line naming the roster it ran
  await expect(res).toExitWith(1);
  expect(res.stdout).toContain("ran 2/2 registered gate(s) (2/2 policies)");
  const report = readArtifact(root);
  expect(report.run).toMatchObject({
    complete: true,
    corpusFiles: 2,
    registered: 2,
    active: 2,
    ran: 2,
    final: { registered: 2, ran: 2, withheld: 0 },
  });
  expect(report.gates.map((g) => `${g.contract}:${g.name}`)).toEqual([`final:${ORDINARY}`, `final:${REVIEWED}`]);

  // the rows: authority/severity/owner/population counts/receipts/POLICY_PHASES timing, severity-stamped findings
  const ordinary = rowOf(report, ORDINARY);
  expect(ordinary).toMatchObject({
    authority: "ordinary",
    severity: "error",
    family: ORDINARY,
    workItem: null,
    ok: false,
    withheld: false,
    waived: 0,
    granted: 0,
  });
  expect(ordinary.owner).toEqual({ status: "success", population: "complete" });
  expect(ordinary.population.effectiveSourcePaths).toBeGreaterThan(0);
  expect(ordinary.population.requestedPaths).toBeNull();
  expect(ordinary.violations).toEqual([
    {
      file: ORDINARY_SUBJECT,
      line: 1,
      column: ORDINARY_COLUMN,
      token: ORDINARY_MARKER,
      severity: "error",
      message: ORDINARY_MESSAGE,
    },
  ]);
  expect(Object.keys(ordinary.timing.phaseMs).toSorted()).toEqual([...POLICY_PHASES].toSorted());
  const reviewed = rowOf(report, REVIEWED);
  expect(reviewed).toMatchObject({ authority: "reviewed-grant", severity: "error", ok: false, withheld: false, granted: 0 });
  expect(reviewed.violations.map((v) => v.file)).toEqual([STRAY_READ]);
  // No granted subject is planted: every exact central identity must raise its stale alarm.
  expect(report.policy).not.toBeNull();
  expect(policyOf(report).authority.toolErrors).toEqual([]);
  expect(policyOf(report).factErrors).toEqual([]);
  expect(policyOf(report).toolErrors).toEqual([]);
  expect(policyOf(report).authority.alarms.map((a) => a.kind)).toEqual(REVIEWED_GRANT_IDS.map(() => "stale-reviewed-grant"));
  expect(policyOf(report).authority.alarms.flatMap((a) => (a.kind === "stale-reviewed-grant" ? [a.grantId] : []))).toEqual(REVIEWED_GRANT_IDS);
  const blocking = 2 + REVIEWED_GRANT_IDS.length;
  expect(policyOf(report).authority.verdict).toEqual({ errors: blocking, warnings: 0, blocking, failOnWarnings: false });
  // total = the blocking count the authority verdict produced; ok false
  expect(report.total).toBe(blocking);
  expect(report.ok).toBe(false);
});

test("the artifact and both readers reconcile effective findings, warnings, and authority alarms", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  const root = await corpusTree(plantedTree, {
    "packages/client/tsconfig.json": JSON.stringify({
      compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"], jsx: "react-jsx", customConditions: ["browser"] },
      files: ["src/lib/probe.ts", "src/features/probe/x.tsx", "src/features/probe/warned.ts"],
    }),
    "tooling/tsconfig.json": JSON.stringify({
      compilerOptions,
      files: [`src/verify/gates/${ORDINARY}.ts`, `src/verify/gates/${REVIEWED}.ts`, `src/verify/gates/${WARNING_POLICY_ID}.ts`],
    }),
    ...mixedTree(repoRoot, {
      [ORDINARY_SUBJECT]: ORDINARY_LINE,
      [STRAY_READ]: REVIEWED_LINE,
      "packages/client/src/styles/probe.css": PLATELESS_COMPOSER,
      "packages/ui/src/styles/keep.css": ".keep { color: var(--color-foreground); }\n",
      [WARNING_SUBJECT]: WARNING_SUBJECT_SOURCE,
    }),
    [`${GATES}/${WARNING_POLICY_ID}.ts`]: warningPolicy(repoRoot),
  });

  execFixtureGit(root, ["init", "--quiet", "--template="]);
  configureFixtureGitIdentity(root);
  execFixtureGit(root, ["add", "."]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "Seed structure reconciliation fixture"]);
  const run = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(existsSync(join(root, "reports", "check-structure.json")), run.stdout + run.stderr).toBe(true);
  const report = readArtifact(root);
  expect(policyOf(report).toolErrors).toEqual([]);
  expect(policyOf(report).authority.toolErrors).toEqual([]);
  await expect(run).toExitWith(1);
  const finalEffective = report.gates.reduce((count, row) => count + row.violations.length, 0);
  const warnings = policyOf(report).authority.verdict.warnings;
  const alarms = policyOf(report).authority.alarms.length;

  expect(warnings).toBeGreaterThan(0);
  expect(alarms).toBeGreaterThan(0);
  expect(report.reconciliation).toEqual({
    finalEffectiveFindings: finalEffective,
    nonblockingWarnings: warnings,
    authorityAlarms: alarms,
    blocking: report.total,
  });
  const equation = `${report.total} blocking = ${finalEffective} effective - ${warnings} nonblocking warning(s) + ${alarms} authority alarm(s)`;
  expect(run.stdout).toContain(equation);

  const shown = await runCli("verify", ["show", "--errors-only"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(shown).toExitWith(1);
  expect(shown.stdout).toContain(equation);
});

// ── 5-7. routing: @orb-waive → an ordinary policy only; grants → a reviewed-grant policy only ────────────────
//
// The third routing arm — `@orb-gate-ignore` reaching only its legacy owner — retired with the suppressor at
// #2176 Phase F. Its successor is not a second arm here: a final policy has NO inline door at all, which the
// authority declaration itself carries, and `gate-ignore-inventory` reds every residual marker on the tree.

test("@orb-waive reaches only a final ORDINARY policy: it waives there, alarms as unknown on an id nobody registers and as wrong-authority on a reviewed-grant policy", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await corpusTree(
    plantedTree,
    mixedTree(repoRoot, {
      // the central door on a final ordinary finding, at the reported position: waived
      [ORDINARY_SUBJECT]: `// @orb-waive ${ORDINARY}(${ORDINARY_MARKER}): planted — the central door on an ordinary finding\n${ORDINARY_LINE}`,
      // the central door naming an id NOBODY REGISTERS: the engine reports it rather than absorbing it.
      // DECLARED LIMIT (the engine's marker universe, not the door): the dispatcher acquires carriers only from
      // its policies' effective populations, and this planted roster covers the client carriers — on the real tree
      // every authored TS/TSX path sits inside some population. The carrier below is inside one, deliberately.
      [CLIENT_STRAY_FILE]: `// @orb-waive ${ABSENT_POLICY}(cache): planted — names a policy the corpus does not hold\nexport const y = 1;\n`,
      // the central door naming a REVIEWED-GRANT policy: no waiver door there — wrong authority
      [STRAY_READ]: `// @orb-waive ${REVIEWED}(createHiddenSpanStreamScrubber): planted — a waiver on a reviewed-grant finding\n${REVIEWED_LINE}`,
    }),
  );
  const res = await withProcessEnv(WAIVER_BUDGET_ENV, plantedBudget({ [ORDINARY]: 1 }), () =>
    runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS }),
  );
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  const ordinary = rowOf(report, ORDINARY);
  expect(ordinary.violations).toEqual([]);
  expect(ordinary.waived).toBe(1);
  expect(ordinary.ok).toBe(true);
  // the reviewed-grant finding survives its foreign marker
  expect(rowOf(report, REVIEWED).violations).toHaveLength(1);
  const alarms = policyOf(report).authority.alarms;
  expect(alarms).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "ordinary-waiver",
        policyId: ABSENT_POLICY,
        message: expect.stringContaining(`targets unknown policy ${ABSENT_POLICY}`),
      }),
      expect.objectContaining({ kind: "ordinary-waiver", policyId: REVIEWED, message: expect.stringContaining(`targets non-ordinary policy ${REVIEWED}`) }),
    ]),
  );
});

test("a reviewed grant reaches only a final reviewed-grant policy: the real row's subject is granted, the other real rows stay stale", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await corpusTree(plantedTree, mixedTree(repoRoot, { [ORDINARY_SUBJECT]: ORDINARY_LINE, [GRANT_SUBJECT]: reviewedLine(GRANT_SUBJECT) }));
  const res = await withProcessEnv(WAIVER_BUDGET_ENV, plantedBudget({ [REVIEWED]: 1 }), () =>
    runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS }),
  );
  expect(policyOf(readArtifact(root)).toolErrors).toEqual([]);
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  const reviewed = rowOf(report, REVIEWED);
  expect(reviewed.violations).toEqual([]);
  expect(reviewed.granted).toBe(1);
  expect(policyOf(report).authority.reviewedGrantConsumption.find(({ id }) => id === "scrubber-home:member-visibility-stamp")?.count).toBe(1);
  // The planted producer stamp binds the only row, so no identity stays stale.
  const stale = policyOf(report).authority.alarms.filter((a) => a.kind === "stale-reviewed-grant");
  expect(stale).toEqual([]);
  // and the door hands the pass ONLY rows naming a loaded policy: no invalid-grant error for the rest of the table
  expect(policyOf(report).authority.toolErrors).toEqual([]);
});

// ── the waiver-budget ratchet at the door ───────────────────────────────────────────────────────────────────

test("a planted budget that differs from what the tree waives alarms: a rise says fix the finding, a fall says lower the row", {
  timeout: RUN_TIMEOUT_MS * 2,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await corpusTree(
    plantedTree,
    mixedTree(repoRoot, {
      [ORDINARY_SUBJECT]: `// @orb-waive ${ORDINARY}(${ORDINARY_MARKER}): planted — one waiver against a mismatched budget\n${ORDINARY_LINE}`,
    }),
  );
  const budgetAlarms = async (budget: Readonly<Record<string, number>>): Promise<readonly unknown[]> => {
    await withProcessEnv(WAIVER_BUDGET_ENV, plantedBudget(budget), () => runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS }));
    return policyOf(readArtifact(root)).authority.alarms.filter((a) => a.kind === "waiver-budget" && a.policyId === ORDINARY);
  };
  expect(await budgetAlarms({ [ORDINARY]: 1 })).toEqual([]);
  expect(await budgetAlarms({})).toMatchObject([{ budget: 0, count: 1, message: expect.stringContaining("fix the new finding") }]);
  expect(await budgetAlarms({ [ORDINARY]: 2 })).toMatchObject([{ budget: 2, count: 1, message: expect.stringContaining("lower its rows") }]);
});

test("the injected budget is refused on the real repository root, before any run slot opens", { timeout: RUN_TIMEOUT_MS }, async ({ repoRoot, runCli }) => {
  const res = await withProcessEnv(WAIVER_BUDGET_ENV, plantedBudget({}), () => runCli("verify", ["structure"], { cwd: repoRoot, timeoutMs: RUN_TIMEOUT_MS }));
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain(WAIVER_BUDGET_ENV);
});

// ── 8-9. the loader's refusals at the door ─────────────────────────────────────────────────────────────────

test("an unbranded lookalike in the corpus is a load refusal (exit 2, the in-flight stub), naming the module and the reason", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const root = await corpusTree(
    plantedTree,
    mixedTree(repoRoot, {
      [`${GATES}/spread-copy.ts`]: `import { defineGate } from ${JSON.stringify(contract)};\nimport { gate as real } from ${JSON.stringify("./" + ORDINARY + ".ts")};\nvoid defineGate;\nexport const gate = { ...real, id: "spread-copy", family: "spread-copy" };\n`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain(
    "gate module tooling/src/verify/gates/spread-copy.ts: `gate` has the policy contract's shape but was not created through defineGate",
  );
  expect(res.stderr).toContain("a spread, clone or copy loses the brand");
  // the load never got far enough to write a report — the stub survives, and it says so
  const slots = readdirSync(join(root, "reports", "runs", "structure"));
  expect(slots).toHaveLength(1);
  const stub = JSON.parse(readFileSync(join(root, "reports", "runs", "structure", slots[0] ?? "", "check-structure.json"), "utf8")) as StructureReport;
  expect(stub.run.complete).toBe(false);
  expect(existsSync(join(root, "reports", "check-structure.json"))).toBe(false);
});

test("a duplicate policy id across two modules is a load refusal naming both paths", { timeout: RUN_TIMEOUT_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await corpusTree(plantedTree, mixedTree(repoRoot, { [`${GATES}/aaa-twin.ts`]: `export {gate} from "./${ORDINARY}.ts";\n` }));
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain(`duplicate gate policy id ${ORDINARY}: tooling/src/verify/gates/aaa-twin.ts, tooling/src/verify/gates/${ORDINARY}.ts`);
});

// ── 10. one failed owner withholds only its own authority reconciliation, with explicit failure state ────────

test("a resource policy whose resource is missing is withheld with explicit failure state while its siblings reconcile", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  // No docs tree in this root: the planted policy's authored-tree resource cannot resolve, so its
  // population phase throws — the ordinary sibling beside it still waives its finding.
  const root = await corpusTree(
    plantedTree,
    mixedTree(repoRoot, {
      [`${GATES}/${HARD_RESOURCE}.ts`]: resourcePolicy(repoRoot),
      [ORDINARY_SUBJECT]: `// @orb-waive ${ORDINARY}(${ORDINARY_MARKER}): planted — reconciled beside a failed owner\n${ORDINARY_LINE}`,
    }),
  );
  const res = await withProcessEnv(WAIVER_BUDGET_ENV, plantedBudget({ [ORDINARY]: 1 }), () =>
    runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS }),
  );
  await expect(res).toExitWith(2);
  const report = readArtifact(root);
  const failed = rowOf(report, HARD_RESOURCE);
  expect(failed.owner).toMatchObject({ status: "incomplete", population: "incomplete" });
  expect(failed.withheld).toBe(true);
  expect(failed.ok).toBe(false);
  expect(report.run.final.withheld).toBe(1);
  expect(policyOf(report).toolErrors).toEqual([
    { policyId: HARD_RESOURCE, phase: "population", message: expect.stringContaining(`authored-tree:${HARD_RESOURCE_TREE} is missing`) },
  ]);
  expect(policyOf(report).authority.withheldPolicyIds).toEqual([HARD_RESOURCE]);
  expect(policyOf(report).authority.toolErrors.map((e) => e.kind)).toEqual(["owner-incomplete"]);
  // the sibling reconciled: its waiver was consumed, its row is ok, and it is NOT withheld
  const ordinary = rowOf(report, ORDINARY);
  expect(ordinary).toMatchObject({ ok: true, waived: 1, withheld: false });
  expect(res.stdout).toContain(`⚠ ${HARD_RESOURCE}`);
  expect(res.stdout).toContain("WITHHELD by authority");
});

// ── 11. exit status and JSON are deterministic ────────────────────────────────────────────────────────────

/** The fields a second run legitimately changes: run identity, clocks, cost. Everything else must be byte-equal. */
function stable(report: StructureReport): unknown {
  const { run, policy, gates, ...rest } = report;
  const { runId, startedAt, finishedAt, artifactDir, concurrent, ...runRest } = run;
  void runId;
  void startedAt;
  void finishedAt;
  void artifactDir;
  void concurrent;
  return {
    ...rest,
    run: runRest,
    gates: gates.map((g) => {
      const { timing: t, ...g2 } = g;
      void t;
      return g2;
    }),
    policy: policy === null ? null : { ...policy, timing: undefined, facts: policy.facts.map((f) => ({ ...f, timing: undefined })) },
  };
}

test("two runs over the same tree produce the same exit and the same artifact modulo identity and clocks", { timeout: RUN_TIMEOUT_MS * 2 }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await corpusTree(plantedTree, mixedTree(repoRoot, { [ORDINARY_SUBJECT]: ORDINARY_LINE, [GRANT_SUBJECT]: reviewedLine(GRANT_SUBJECT) }));
  const first = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const firstReport = stable(readArtifact(root));
  const second = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(second.code).toBe(first.code);
  expect(stable(readArtifact(root))).toEqual(firstReport);
});

// ── 12. the one reader renders both ──────────────────────────────────────────────────────────────────────

test("check:show reads the artifact: a policy row in its own vocabulary, with its authority and position", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await corpusTree(plantedTree, mixedTree(repoRoot, { [ORDINARY_SUBJECT]: ORDINARY_LINE }));
  expect((await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS })).code).toBe(1);
  const shown = await runCli("verify", ["show", "--gate", ORDINARY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(shown.stdout).toContain(`✗ ${ORDINARY} (1 violation)`);
  expect(shown.stdout).toContain("final ordinary/error · population");
  expect(shown.stdout).toContain(`${ORDINARY_SUBJECT}:1:${String(ORDINARY_COLUMN)}`);
  const all = await runCli("verify", ["show", "--errors-only"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(all).toExitWith(1);
  expect(all.stdout).toContain("AUTHORITY ALARM");
});
