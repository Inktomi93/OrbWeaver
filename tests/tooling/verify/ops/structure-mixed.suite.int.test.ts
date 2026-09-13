// THE MIXED-CORPUS PROOF (docs/design/gate-runtime-standardization.md §1; the twelve assertions) at the
// production door: `cli.ts structure` spawned over planted roots whose gates dir holds real final policies as
// RE-EXPORT SHIMS (`baseui-render-prop-composition` ordinary, `no-raw-matchmedia` reviewed-grant,
// `verify-registry-parity` hard/resource) beside ONE AUTHORED LEGACY DESCRIPTOR. A shim imports the real module by
// absolute file URL, so the object the door runs IS the production descriptor (the loader's identity law refuses a
// copy, proven in lib/loader.test.ts) and the shim's basename is the id (the filename law).
//
// THE LEGACY SIDE CARRIES ITS OWN FIXTURE, AND THAT IS THE #2052 REPAIR — the third instance of the #1983
// legacy-roster-shrink class. It used to shim the live `assumes-single-replica`, its ONLY legacy member, and
// `04e455f4d` converted that gate: the shim then loaded a `defineGate` policy, `legacy:` became `final:`, and the
// whole suite went RED. A proof whose PREMISE is "some live gate is still legacy" cannot survive a program whose
// entire purpose is that none of them are, so the premise is now MATERIALIZED rather than borrowed —
// `LEGACY_DESCRIPTOR_SOURCE` below is a self-contained descriptor planted into the fixture tree, importing nothing
// from the corpus and therefore unretirable by any conversion. What the arms assert about it is unchanged: the
// legacy DISPATCHER's finding shape, its file-scan denominator, its GATE_PHASES timing and its own marker door.
// At the atomic cutover, when the production legacy roster is empty, this suite still has a legacy side to prove
// the mixed door with — which is exactly what "mixed runtime" must keep meaning until the door itself retires.
//
// Every arm reads the ONE artifact (`reports/check-structure.json`) and the exit code the reader meets, never an
// in-process shortcut. The routing arms plant a marker on the WRONG side and assert the reconciliation finding —
// silence would be the defect.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GATE_PHASES } from "../../../../tooling/src/verify/contract/pass.ts";
import { POLICY_PHASES } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { FinalPolicyRow, LegacyGateRow, StructurePolicyReport, StructureReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES = "tooling/src/verify/gates";
/** A spawned mixed run over a planted root loads the harness Project and both dispatchers: ~3-6 s quiet. */
const RUN_TIMEOUT_MS = scaledBudget(120_000);

/** The AUTHORED legacy carrier. Its name is its basename by the loader's filename law, and `probe-` marks it
 *  as this suite's own fixture rather than a corpus member anyone could mistake for a real gate. */
const LEGACY = "probe-legacy-module-state";
const ORDINARY = "baseui-render-prop-composition";
const REVIEWED = "no-raw-matchmedia";
const HARD_RESOURCE = "verify-registry-parity";

function shim(repoRoot: string, id: string): string {
  return `export { gate } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${id}.ts`)).href)};\n`;
}

/** The legacy subject: a module-scope `new Map()` under packages/server/src. */
const SERVER_CACHE = "packages/server/src/domain/probe/cache.ts";
const MAP_LINE = "export const cache = new Map<string, number>();\n";
const LEGACY_MESSAGE = "module-scope mutable per-process state";

/** A COMPLETE legacy `GateDescriptor`, authored as source and planted into the fixture tree's gates dir.
 *
 *  It imports NOTHING — not the contract types (a planted root resolves no workspace package), not ts-morph
 *  (hence `visitFile` + a text scan rather than `kinds`/`visit`, which would need a `SyntaxKind` value). That
 *  is the whole point: a fixture with no corpus edge cannot be retired by a conversion, which is what
 *  happened to the live gate this replaces. The file-level `Finding` overload of `ctx.report` is the legacy
 *  sink every arm here reads, and reporting AT the matched line is what makes the `@orb-gate-ignore` door on
 *  the line above bind. */
const LEGACY_DESCRIPTOR_SOURCE = `const MESSAGE = ${JSON.stringify(`${LEGACY_MESSAGE} — a module-scope mutable Map survives every request on this process`)};
/** Line-anchored on purpose: a \`new Map()\` built INSIDE a function is per-call, not module-scope state, and
 *  the mustPass row below is exactly that discrimination. */
const MODULE_SCOPE_MAP = /^export const \\w+ = new Map[<(]/u;

export const gate = {
  name: ${JSON.stringify(LEGACY)},
  docRow: "tests/tooling/verify/ops/structure-mixed.suite.int.test.ts — the mixed door's authored legacy carrier (#2052)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  scanRoot: (path) => path.startsWith("packages/server/src/"),
  visitFile: (sourceFile, ctx) => {
    const lines = sourceFile.getFullText().split("\\n");
    const index = lines.findIndex((line) => MODULE_SCOPE_MAP.test(line));
    if (index === -1) {
      return;
    }
    ctx.report({
      file: sourceFile.getFilePath().slice(ctx.root.length + 1),
      line: index + 1,
      message: MESSAGE,
    });
  },
  mustFlag: [{ files: { "packages/server/src/x.ts": ${JSON.stringify(MAP_LINE)} }, why: "a module-scope Map in the scan root" }],
  mustPass: [{ files: { "packages/server/src/x.ts": "export const make = () => new Map();\\n" }, why: "a Map built per call is not module-scope state" }],
};
`;
// The ordinary subject: the Radix spelling on a Base UI part, under the @ui population root.
const UI_MENU = "packages/ui/src/primitives/probe/menu.tsx";
const AS_CHILD_LINE = "export const G = <Menu.Trigger asChild />;\n";
/** The reviewed-grant subject: a raw matchMedia read — at a NON-subject path it is effective, at a real grant
 *  row's subject it is granted. The five real rows are in lib/reviewed-grants.ts. */
const GRANT_SUBJECT = "packages/ui/src/lib/coarse-pointer-now.ts";
const STRAY_READ = "packages/client/src/features/probe/x.tsx";
const CLIENT_STRAY_FILE = "packages/client/src/features/probe/y.ts";
const MATCH_MEDIA_LINE = 'export const G = (): unknown => globalThis.matchMedia("(prefers-reduced-motion: reduce)");\n';

function readArtifact(root: string): StructureReport {
  return JSON.parse(readFileSync(join(root, "reports", "check-structure.json"), "utf8")) as StructureReport;
}

function rowOf(report: StructureReport, name: string): LegacyGateRow | FinalPolicyRow {
  const row = report.gates.find((g) => g.name === name);
  if (row === undefined) {
    throw new Error(`no row for ${name} in ${report.gates.map((g) => g.name).join(", ")}`);
  }
  return row;
}

function finalRow(report: StructureReport, name: string): FinalPolicyRow {
  const row = rowOf(report, name);
  if (row.contract !== "final") {
    throw new Error(`${name} is not a final row`);
  }
  return row;
}

/** The final side's aggregate, which every mixed tree here has (a null block is the legacy-only tree's, not ours). */
function policyOf(report: StructureReport): StructurePolicyReport {
  if (report.policy === null) {
    throw new Error("the artifact carries no final-side block");
  }
  return report.policy;
}

function legacyRow(report: StructureReport, name: string): LegacyGateRow {
  const row = rowOf(report, name);
  if (row.contract !== "legacy") {
    throw new Error(`${name} is not a legacy row`);
  }
  return row;
}

const mixedTree = (repoRoot: string, files: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({
  [`${GATES}/${LEGACY}.ts`]: LEGACY_DESCRIPTOR_SOURCE,
  [`${GATES}/${ORDINARY}.ts`]: shim(repoRoot, ORDINARY),
  [`${GATES}/${REVIEWED}.ts`]: shim(repoRoot, REVIEWED),
  ...files,
});

// ── 1-4. both contracts execute in ONE invocation, contribute to ONE report, distinguishable per contract ─────

test("one invocation runs both dispatchers and lands both contracts in one roster, each in its own vocabulary", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(mixedTree(repoRoot, { [SERVER_CACHE]: MAP_LINE, [UI_MENU]: AS_CHILD_LINE, [STRAY_READ]: MATCH_MEDIA_LINE }));
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  // violations on both sides, no tool error on either: exit 1, one artifact, one completeness line naming both
  await expect(res).toExitWith(1);
  expect(res.stdout).toContain("ran 3/3 active gate(s) (1/1 legacy · 2/2 final)");
  const report = readArtifact(root);
  expect(report.run).toMatchObject({
    complete: true,
    corpusFiles: 3,
    registered: 3,
    active: 3,
    ran: 3,
    legacy: { registered: 1, active: 1, ran: 1 },
    final: { registered: 2, ran: 2, withheld: 0 },
  });
  expect(report.gates.map((g) => `${g.contract}:${g.name}`)).toEqual([`legacy:${LEGACY}`, `final:${ORDINARY}`, `final:${REVIEWED}`]);

  // the legacy row: file-scan denominator, GATE_PHASES timing, the legacy finding shape
  const legacy = legacyRow(report, LEGACY);
  expect(legacy.ok).toBe(false);
  expect(legacy.violations).toEqual([{ file: SERVER_CACHE, line: 1, message: expect.stringContaining("module-scope mutable per-process state") }]);
  expect(legacy.scan.scanned).toBeGreaterThan(0);
  expect(Object.keys(legacy.timing.phaseMs).toSorted()).toEqual([...GATE_PHASES].toSorted());
  // the final rows: authority/severity/owner/population counts/receipts/POLICY_PHASES timing, severity-stamped findings
  const ordinary = finalRow(report, ORDINARY);
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
    { file: UI_MENU, line: 1, column: 32, token: "asChild", severity: "error", message: expect.stringContaining("Radix's composition idiom") },
  ]);
  expect(Object.keys(ordinary.timing.phaseMs).toSorted()).toEqual([...POLICY_PHASES].toSorted());
  const reviewed = finalRow(report, REVIEWED);
  expect(reviewed).toMatchObject({ authority: "reviewed-grant", severity: "error", ok: false, withheld: false, granted: 0 });
  expect(reviewed.violations.map((v) => v.file)).toEqual([STRAY_READ]);
  // the final aggregate: no refusals; the five real grant rows are STALE after a complete owner run (this tree holds
  // none of their subjects) — an alarm each, which is how a grant that reaches nothing stays loud
  expect(report.policy).not.toBeNull();
  expect(policyOf(report).authority.toolErrors).toEqual([]);
  expect(policyOf(report).factErrors).toEqual([]);
  expect(policyOf(report).toolErrors).toEqual([]);
  expect(policyOf(report).authority.alarms.map((a) => a.kind)).toEqual(Array.from({ length: 5 }, () => "stale-reviewed-grant"));
  expect(policyOf(report).authority.verdict).toEqual({ errors: 2 + 5, warnings: 0, blocking: 7, failOnWarnings: false });
  // total = legacy violations + final blocking; ok false
  expect(report.total).toBe(1 + 7);
  expect(report.ok).toBe(false);
});

// ── 5-7. routing: legacy markers → legacy owners only; @orb-waive → final ordinary only; grants → reviewed-grant only ─

test("a legacy marker reaches only the legacy owner, and the same marker naming a final policy is inert on that side", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(
    mixedTree(repoRoot, {
      // the legacy door, on the legacy subject: suppressed
      [SERVER_CACHE]: `// @orb-gate-ignore ${LEGACY}: planted — the legacy door on a legacy finding\n${MAP_LINE}`,
      // the legacy door written above a FINAL policy's finding: the final side does not read it
      [UI_MENU]: `// @orb-gate-ignore ${ORDINARY}: planted — a legacy marker on a final finding\n${AS_CHILD_LINE}`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  expect(rowOf(report, LEGACY).violations).toEqual([]);
  expect(finalRow(report, ORDINARY).violations.map((v) => v.token)).toEqual(["asChild"]);
  expect(finalRow(report, ORDINARY).waived).toBe(0);
});

test("@orb-waive reaches only a final ORDINARY policy: it waives there, alarms as unknown on a legacy gate and as wrong-authority on a reviewed-grant policy", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(
    mixedTree(repoRoot, {
      // the central door on a final ordinary finding, at the reported position: waived
      [UI_MENU]: `// @orb-waive ${ORDINARY}(asChild): planted — the central door on an ordinary finding\n${AS_CHILD_LINE}`,
      // the central door naming a LEGACY gate: the legacy side never reads it and the engine reports it
      // the central door naming a LEGACY gate above the legacy finding: the legacy side never reads it, so the
      // finding survives. DECLARED LIMIT (the engine's marker universe, not the door): the final side acquires
      // carriers only from its policies' effective populations, and this planted roster covers @client/@ui only, so
      // a marker under packages/server is invisible to it here — on the real tree every authored TS/TSX path sits
      // inside some final population. The alarm itself is proven on the @client carrier below.
      [SERVER_CACHE]: `// @orb-waive ${LEGACY}(cache): planted — a final marker on a legacy finding\n${MAP_LINE}`,
      [CLIENT_STRAY_FILE]: `// @orb-waive ${LEGACY}(cache): planted — names a legacy gate from inside a final population\nexport const y = 1;\n`,
      // the central door naming a REVIEWED-GRANT policy: no waiver door there — wrong authority
      [STRAY_READ]: `// @orb-waive ${REVIEWED}(matchMedia): planted — a waiver on a reviewed-grant finding\n${MATCH_MEDIA_LINE}`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  const ordinary = finalRow(report, ORDINARY);
  expect(ordinary.violations).toEqual([]);
  expect(ordinary.waived).toBe(1);
  expect(ordinary.ok).toBe(true);
  // the legacy finding survives its foreign marker
  expect(rowOf(report, LEGACY).violations).toHaveLength(1);
  // the reviewed-grant finding survives its foreign marker
  expect(finalRow(report, REVIEWED).violations).toHaveLength(1);
  const alarms = policyOf(report).authority.alarms;
  expect(alarms).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "ordinary-waiver", policyId: LEGACY, message: expect.stringContaining(`targets unknown policy ${LEGACY}`) }),
      expect.objectContaining({ kind: "ordinary-waiver", policyId: REVIEWED, message: expect.stringContaining(`targets non-ordinary policy ${REVIEWED}`) }),
    ]),
  );
});

test("a reviewed grant reaches only a final reviewed-grant policy: the real row's subject is granted, the other real rows stay stale", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  // SERVER_CACHE keeps the legacy gate's scan non-zero: a real-tree run with a blind gate is exit 2, correctly.
  const root = await plantedTree(mixedTree(repoRoot, { [GRANT_SUBJECT]: MATCH_MEDIA_LINE, [SERVER_CACHE]: MAP_LINE }));
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  const reviewed = finalRow(report, REVIEWED);
  expect(reviewed.violations).toEqual([]);
  expect(reviewed.granted).toBe(1);
  expect(policyOf(report).authority.reviewedGrantConsumption.find(({ id }) => id === "no-raw-matchmedia:coarse-pointer-now")?.count).toBe(1);
  // the four rows whose subjects this tree does not hold are STALE — loud, never silently forgiven
  const stale = policyOf(report).authority.alarms.filter((a) => a.kind === "stale-reviewed-grant");
  expect(stale.map((a) => a.grantId).toSorted()).toEqual([
    "no-raw-matchmedia:media-grid",
    "no-raw-matchmedia:reduced-motion-now",
    "no-raw-matchmedia:use-is-mobile-viewport",
    "no-raw-matchmedia:use-prefers-reduced-motion",
  ]);
  // and the door hands the pass ONLY rows naming a loaded policy: no invalid-grant error for the rest of the table
  expect(policyOf(report).authority.toolErrors).toEqual([]);
});

// ── 8-9. the loader's refusals at the door ─────────────────────────────────────────────────────────────────

test("an unbranded lookalike in the corpus is a load refusal (exit 2, the in-flight stub), naming the module and both reasons", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const root = await plantedTree(
    mixedTree(repoRoot, {
      [`${GATES}/spread-copy.ts`]: `import { defineGate } from ${JSON.stringify(contract)};\nimport { gate as real } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${ORDINARY}.ts`)).href)};\nvoid defineGate;\nexport const gate = { ...real, id: "spread-copy", family: "spread-copy" };\n`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain("gate module tooling/src/verify/gates/spread-copy.ts: `gate` is neither branded by defineGate nor a valid legacy descriptor");
  expect(res.stderr).toContain("has the final contract's shape but was not created through defineGate");
  // the load never got far enough to write a report — the stub survives, and it says so
  const slots = readdirSync(join(root, "reports", "runs", "structure"));
  expect(slots).toHaveLength(1);
  const stub = JSON.parse(readFileSync(join(root, "reports", "runs", "structure", slots[0] ?? "", "check-structure.json"), "utf8")) as StructureReport;
  expect(stub.run.complete).toBe(false);
  expect(existsSync(join(root, "reports", "check-structure.json"))).toBe(false);
});

test("a duplicate policy id across two modules is a load refusal naming both paths", { timeout: RUN_TIMEOUT_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(mixedTree(repoRoot, { [`${GATES}/aaa-twin.ts`]: shim(repoRoot, ORDINARY) }));
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
  // no package.json in this root: verify-registry-parity's `package-metadata:root` resource cannot resolve, so its
  // population phase throws — the ordinary sibling beside it still waives its finding.
  const root = await plantedTree(
    mixedTree(repoRoot, {
      [`${GATES}/${HARD_RESOURCE}.ts`]: shim(repoRoot, HARD_RESOURCE),
      [UI_MENU]: `// @orb-waive ${ORDINARY}(asChild): planted — reconciled beside a failed owner\n${AS_CHILD_LINE}`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  const report = readArtifact(root);
  const failed = finalRow(report, HARD_RESOURCE);
  expect(failed.owner).toMatchObject({ status: "incomplete", population: "incomplete" });
  expect(failed.withheld).toBe(true);
  expect(failed.ok).toBe(false);
  expect(report.run.final.withheld).toBe(1);
  expect(policyOf(report).toolErrors).toEqual([{ policyId: HARD_RESOURCE, phase: "population", message: expect.stringContaining("package.json") }]);
  expect(policyOf(report).authority.withheldPolicyIds).toEqual([HARD_RESOURCE]);
  expect(policyOf(report).authority.toolErrors.map((e) => e.kind)).toEqual(["owner-incomplete"]);
  // the sibling reconciled: its waiver was consumed, its row is ok, and it is NOT withheld
  const ordinary = finalRow(report, ORDINARY);
  expect(ordinary).toMatchObject({ ok: true, waived: 1, withheld: false });
  expect(res.stdout).toContain(`⚠ ${HARD_RESOURCE}`);
  expect(res.stdout).toContain("WITHHELD by authority");
});

// ── 11. exit status and JSON are deterministic ────────────────────────────────────────────────────────────

/** The fields a second run legitimately changes: run identity, clocks, cost. Everything else must be byte-equal. */
function stable(report: StructureReport): unknown {
  const { run, timing, policy, gates, ...rest } = report;
  const { runId, startedAt, finishedAt, artifactDir, concurrent, ...runRest } = run;
  void runId;
  void startedAt;
  void finishedAt;
  void artifactDir;
  void concurrent;
  void timing;
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
  const root = await plantedTree(mixedTree(repoRoot, { [SERVER_CACHE]: MAP_LINE, [UI_MENU]: AS_CHILD_LINE, [GRANT_SUBJECT]: MATCH_MEDIA_LINE }));
  const first = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const firstReport = stable(readArtifact(root));
  const second = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(second.code).toBe(first.code);
  expect(stable(readArtifact(root))).toEqual(firstReport);
});

// ── 12. the one reader renders both ──────────────────────────────────────────────────────────────────────

test("check:show reads the mixed artifact: a final row in its own vocabulary, a legacy row as before", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(mixedTree(repoRoot, { [SERVER_CACHE]: MAP_LINE, [UI_MENU]: AS_CHILD_LINE }));
  expect((await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS })).code).toBe(1);
  const shown = await runCli("verify", ["show", "--gate", ORDINARY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(shown.stdout).toContain(`✗ ${ORDINARY} (1 violation)`);
  expect(shown.stdout).toContain("final ordinary/error · population");
  expect(shown.stdout).toContain(`${UI_MENU}:1:32`);
  const legacyShown = await runCli("verify", ["show", "--gate", LEGACY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(legacyShown.stdout).toContain(`✗ ${LEGACY} (1 violation)`);
  expect(legacyShown.stdout).toContain("scanned ");
  expect(legacyShown.stdout).not.toContain("final ");
  const all = await runCli("verify", ["show", "--errors-only"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(all).toExitWith(1);
  expect(all.stdout).toContain("AUTHORITY ALARM");
});
