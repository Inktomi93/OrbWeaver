// The standing family floor for the two tooling front-door families converted in #1950 group 2:
//
//   `tooling-front-door`      → `tooling-front-door` (ordinary import boundary) + `tooling-root-config-import`
//                                (reviewed relative-escape grant) — family `tooling-front-door`.
//   `tooling-argv-front-door` → `tooling-argv-front-door` (reviewed argv reader) + `tooling-argv-front-door-health`
//                                (hard blindness tripwire) — family `tooling-argv-front-door`.
//
// What a declared row structurally cannot express lives here:
//   §4.2 — the ordinary policy's identity arm, all three assertions, alarms first.
//   §4.3 — grant identity for BOTH reviewed-grant policies with the REAL rows from `lib/reviewed-grants.ts`:
//          the intended row is consumed exactly once; a row keyed on the wrong operation licenses nothing;
//          a row whose subject no longer performs the act is STALE after a complete run. The retired legacy
//          int test's two-sided ROOT_CONFIG_IMPORTS sweep and the legacy ARGV_ENTRIES stale sweep (both
//          modes) are exactly these pins.
//   §4.5 — every `entire-population` policy DEFERS a narrowed request instead of adjudicating a row its
//          scope cannot see — the successor of the legacy int test's scoped-run defect pin (2026-08-30).
//   §4.6 — the two split differentials against the frozen legacy descriptors (`1f5e25c00`, `4097be20d`):
//          every legacy example replayed through the legacy `runPass` and through the UNION of the two
//          final policies, differences CLASSIFIED rather than averaged, and the legacy-side coverage of every
//          moved arm asserted. Classified for the import family: (1) POSITION — the finding moved from the
//          whole ImportDeclaration (legacy `token: spec, offset: 0`, not even an exact slice) to the quoted
//          specifier literal; (2) the root-config row is a FINDING now (licensed by a grant the differential
//          does not carry) where legacy passed it through its table; (3) the legacy escape example's
//          `../../../packages/...` resolved INSIDE `tooling/` — legacy called any non-`tooling/src/` path an
//          escape and so does the final policy. For the argv family: (4) POSITION of the element-access
//          spelling — legacy normalized `process["argv"]` to `process.argv`; (5) the six entry rows are
//          FINDINGS licensed by grants where legacy passed them through its table, and the two-sided stale
//          example is a stale-grant pin here, not a finding; (6) the blindness arm anchors on the anchor
//          file, not the gate module; (7) the ambient `process` spelling is UNREADABLE in a project without
//          `@types/node`, so it is reported fail-closed under the unreadable text where legacy matched text
//          (count identical, message differs) — the planted-types rows in the module pin the precise branch.
//   Plus the real-tree fact the retired test carried: `ast/ops/prodonly.ts` imports `knip.ts` by relative
//   path, read off disk — the second, independent method behind the one root-config grant.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as argvFrontDoor } from "../../../../tooling/src/verify/gates/tooling-argv-front-door.ts";
import { gate as argvHealth } from "../../../../tooling/src/verify/gates/tooling-argv-front-door-health.ts";
import { gate as frontDoor } from "../../../../tooling/src/verify/gates/tooling-front-door.ts";
import { gate as rootConfigImport } from "../../../../tooling/src/verify/gates/tooling-root-config-import.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/tooling-front-door-family";
const IMPORT_FAMILY: readonly GatePolicy[] = [frontDoor, rootConfigImport];
const ARGV_FAMILY: readonly GatePolicy[] = [argvFrontDoor, argvHealth];
const ALL: readonly GatePolicy[] = [...IMPORT_FAMILY, ...ARGV_FAMILY];
const ANCHOR = "tooling/src/_shared/exit-contract.ts";
const ANCHOR_SOURCE = "export const EXIT = { clean: 0 } as const;\n";
const KNIP_GRANT_ID = "tooling-root-config-import:prodonly-knip";
const ENGINES_GRANT_ID = "tooling-argv-front-door:stack-engines";
const PRODONLY = "tooling/src/ast/ops/prodonly.ts";
const KNIP_IMPORT = 'import knipConfig from "../../../../knip.ts";';
const ENGINES = "tooling/src/stack/ops/engines.ts";
const ENGINES_READ = 'import process from "node:process";\nexport const g = process.argv.includes("--detach");\n';
/** The legacy descriptors, byte-identical to the modules the brief named as the pre-conversion source. */
const LEGACY_FRONT_DOOR = { sha: "1f5e25c00", path: "tooling/src/verify/gates/tooling-front-door.ts" } as const;
const LEGACY_ARGV = { sha: "4097be20d", path: "tooling/src/verify/gates/tooling-argv-front-door.ts" } as const;
const DIFFERENTIAL_BUDGET_MS = scaledBudget(120_000);

function grantOf(id: string): ReviewedGateGrant {
  const grant = REVIEWED_GRANTS.find((row) => row.id === id);
  if (grant === undefined) {
    throw new Error(`grant ${id} is not in the central table`);
  }
  return grant;
}

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

interface PassOptions {
  readonly grants?: readonly ReviewedGateGrant[];
  readonly requestedPaths?: readonly string[];
}

function passOf(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>, options: PassOptions = {}): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(options.requestedPaths === undefined ? {} : { requestedPaths: options.requestedPaths }),
    reviewedGrants: options.grants ?? [],
    failOnWarnings: false,
  });
}

test("all four front-door policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY ─────────────────────────────────────────────────────────────────────────────
test("an ordinary waiver binds to the exact policy and the QUOTED-SPECIFIER position tooling-front-door reports", () => {
  const waived = passOf([frontDoor], {
    "tooling/src/aa/ops/x.ts":
      '// @orb-waive tooling-front-door("../../bb/ops/y.ts"): the proof\'s stand-in reason and its end condition.\nimport { y } from "../../bb/ops/y.ts";\nexport const x = y;\n',
    "tooling/src/bb/ops/y.ts": "export const y = 1;\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── §4.3 GRANT IDENTITY — the real rows ────────────────────────────────────────────────────────────────
test("the prodonly/knip grant is consumed exactly once by the real subject and operation", () => {
  const granted = passOf([rootConfigImport], { [PRODONLY]: `${KNIP_IMPORT}\nexport const globs = knipConfig;\n` }, { grants: [grantOf(KNIP_GRANT_ID)] });
  expect(granted.toolErrors).toEqual([]);
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: KNIP_GRANT_ID, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("the knip grant keyed on the WRONG config licenses nothing — the operation carries the resolved target", () => {
  const mismatched = passOf(
    [rootConfigImport],
    { [PRODONLY]: `${KNIP_IMPORT}\nexport const globs = knipConfig;\n` },
    { grants: [{ ...grantOf(KNIP_GRANT_ID), operation: "root-config-import:biome.json" }] },
  );
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: KNIP_GRANT_ID }]);
});

test("the knip grant is STALE after a complete run in which prodonly no longer imports the config — the legacy sweep's mode (A)", () => {
  const stale = passOf([rootConfigImport], { [PRODONLY]: "export const globs = [];\n" }, { grants: [grantOf(KNIP_GRANT_ID)] });
  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: KNIP_GRANT_ID }]);
});

test("the knip grant is STALE when its subject is GONE from the tree — the legacy sweep's mode (B)", () => {
  const gone = passOf([rootConfigImport], { "tooling/src/ast/ops/other.ts": "export const other = 1;\n" }, { grants: [grantOf(KNIP_GRANT_ID)] });
  expect(gone.authority.effectiveFindings).toEqual([]);
  expect(gone.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: KNIP_GRANT_ID }]);
});

test("the stack/engines argv grant is consumed exactly once by the real entry", () => {
  const granted = passOf([argvFrontDoor], { [ENGINES]: ENGINES_READ }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(granted.toolErrors).toEqual([]);
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: ENGINES_GRANT_ID, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("an argv grant keyed on the WRONG operation licenses nothing", () => {
  const mismatched = passOf([argvFrontDoor], { [ENGINES]: ENGINES_READ }, { grants: [{ ...grantOf(ENGINES_GRANT_ID), operation: "process-env-read" }] });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);
});

test("an argv grant whose entry stopped reading argv is STALE after a complete run — both legacy staleness modes are this one alarm", () => {
  const stoppedReading = passOf([argvFrontDoor], { [ENGINES]: "export const g = false;\n" }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(stoppedReading.authority.effectiveFindings).toEqual([]);
  expect(stoppedReading.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);

  const gone = passOf([argvFrontDoor], { "tooling/src/stack/ops/other.ts": "export const other = 1;\n" }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(gone.authority.effectiveFindings).toEqual([]);
  expect(gone.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);
});

test("every argv grant row in the central table names a subject that exists on the tree and is not a cli.ts", ({ repoRoot }) => {
  const rows = REVIEWED_GRANTS.filter((grant) => grant.policyId === argvFrontDoor.id);
  expect(rows).toHaveLength(6);
  for (const row of rows) {
    expect(existsSync(join(repoRoot, row.subject)), row.id).toBe(true);
    expect(row.subject.endsWith("/cli.ts"), row.id).toBe(false);
    expect(row.operation).toBe("process-argv-read");
  }
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a narrowed request DEFERS every entire-population policy in both families instead of adjudicating a row its scope cannot see", () => {
  const files = {
    [ANCHOR]: ANCHOR_SOURCE,
    [PRODONLY]: `${KNIP_IMPORT}\nexport const globs = knipConfig;\n`,
    "tooling/src/snap/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
    "tooling/src/_shared/log.ts": "export const warn = 1;\n",
  };
  for (const policy of [rootConfigImport, argvFrontDoor, argvHealth]) {
    const narrowed = passOf([policy], files, { requestedPaths: ["tooling/src/_shared/log.ts"] });
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
    expect(narrowed.authority.authorityAlarms, policy.id).toEqual([]);
  }
});

// ─── THE REAL-TREE FACT behind the one root-config grant (the retired int test's independent method) ────
test("the knip grant is LIVE on today's tree: ast/ops/prodonly imports the knip config by relative path and consumes it", ({ repoRoot }) => {
  const consumer = join(repoRoot, PRODONLY);
  expect(existsSync(consumer), `${PRODONLY} is the row's only justification`).toBe(true);
  const source = readFileSync(consumer, "utf8");
  expect(source, "the root-config import IS the row").toContain(KNIP_IMPORT);
  expect(source, "…and it must still be CONSUMED, not merely imported").toContain("knipConfig as");
  expect(grantOf(KNIP_GRANT_ID).subject).toBe(PRODONLY);
});

// ─── §4.6 SPLIT-ARM DIFFERENTIALS ───────────────────────────────────────────────────────────────────────
function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(legacy: { readonly sha: string; readonly path: string }, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${legacy.sha}:${legacy.path}`], { encoding: "utf8" });
  const target = join(scratch, basename(legacy.path));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. Every named
  // module is still on the tree and untouched by this conversion.
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
    .replace('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`);
  expect(rewritten).not.toBe(source);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(legacy.path)}`)) as { readonly gate: GateDescriptor }).gate;
}

function legacyFiles(example: GateExample, fallback: string): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? fallback]: example.files } : example.files;
}

const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

interface Verdict {
  readonly lines: readonly string[];
  readonly refusals: readonly string[];
}

function legacyVerdict(
  gateDescriptor: GateDescriptor,
  files: Readonly<Record<string, string>>,
  line: (finding: { readonly file: string; readonly line: number; readonly column: number; readonly token?: string; readonly message?: string }) => string,
): Verdict {
  const project = projectOf(files);
  const result = runPass([gateDescriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return { lines: sorted((result.gates[0]?.findings ?? []).map(line)), refusals: result.toolErrors.map((error) => error.phase) };
}

function finalVerdict(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  line: (finding: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
    readonly token?: string;
    readonly message?: string;
    readonly policyId: string;
  }) => string,
): Verdict {
  const result = passOf(policies, files);
  return {
    lines: sorted(result.authority.effectiveFindings.map(line)),
    refusals: sorted(result.toolErrors.map((error) => `${error.policyId} ${error.phase}`)),
  };
}

const admitsNothing = (files: Readonly<Record<string, string>>, policies: readonly GatePolicy[]): readonly string[] =>
  Object.keys(files).some((path) => path.startsWith("tooling/src/")) ? [] : sorted(policies.map((policy) => `${policy.id} population`));

test(
  "tooling-front-door + tooling-root-config-import reproduce the frozen legacy gate on every original example",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(LEGACY_FRONT_DOOR, scratch);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples).toHaveLength(6);
    const arms: string[] = [];
    for (const example of examples) {
      const files = legacyFiles(example, "tooling/src/aa/ops/x.ts");
      // Legacy reported on the ImportDeclaration with the bare specifier as token; the final policies report on
      // the specifier LITERAL. The comparable line is `<arm> <file>:<line> <specifier>` — position difference (1)
      // is classified by reading the token off the quoted literal.
      const before = legacyVerdict(legacy, files, (finding) => `IMPORT ${finding.file}:${finding.line} ${finding.token ?? "<no token>"}`);
      arms.push(...before.lines.map(() => "IMPORT"));
      const after = finalVerdict(IMPORT_FAMILY, files, (finding) => `IMPORT ${finding.file}:${finding.line} ${(finding.token ?? "").replace(/^"|"$/gu, "")}`);
      // Difference (2): the knip-row example is a FINDING now (the grant is not carried here); legacy passed it.
      const knipRow = Object.keys(files).includes("knip.ts");
      const expectedLines = knipRow ? ["IMPORT tooling/src/aa/ops/x.ts:1 ../../../../knip.ts"] : before.lines;
      expect(before.refusals, example.why).toEqual([]);
      expect(after, example.why).toEqual({ lines: expectedLines, refusals: admitsNothing(files, IMPORT_FAMILY) });
    }
    // The legacy corpus exercised the occurrence arm (three flag examples) — the replay is evidence.
    expect(arms).toHaveLength(3);
  },
  DIFFERENTIAL_BUDGET_MS,
);

test(
  "tooling-argv-front-door + tooling-argv-front-door-health reproduce the frozen legacy gate on every original example",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(LEGACY_ARGV, scratch);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples).toHaveLength(11);
    const arms: string[] = [];
    for (const example of examples) {
      const files = legacyFiles(example, "tooling/src/x.ts");
      const before = legacyVerdict(legacy, files, (finding) => {
        if (finding.file === LEGACY_ARGV.path) {
          return "BLIND";
        }
        return (finding.message ?? "").startsWith("stale ARGV_ENTRIES row") ? `STALE ${finding.file}` : `READ ${finding.file}:${finding.line}`;
      });
      arms.push(...before.lines.map((entry) => entry.split(" ")[0] ?? ""));
      const after = finalVerdict(ARGV_FAMILY, files, (finding) => (finding.policyId === argvHealth.id ? "BLIND" : `READ ${finding.file}:${finding.line}`));
      // Differences (5): a censused entry is a FINDING here (its grant is not carried by the differential) where
      // legacy passed it, and the six stale-row findings of the two-sided sweep example are grant liveness, not
      // findings. Difference (6): the blindness verdict anchors on the anchor file — its LINE is compared, not
      // its path. Difference (4)/(7) are position/message deltas invisible to these lines by construction.
      const entryReads = Object.keys(files)
        .filter((path) => REVIEWED_GRANTS.some((grant) => grant.policyId === argvFrontDoor.id && grant.subject === path))
        .map((path) => `READ ${path}:2`);
      const expectedLines = sorted([...before.lines.filter((entry) => !entry.startsWith("STALE ")), ...entryReads]);
      expect(before.refusals, example.why).toEqual([]);
      expect(after, example.why).toEqual({ lines: expectedLines, refusals: admitsNothing(files, ARGV_FAMILY) });
    }
    // The legacy corpus exercised all three arms: three reader examples, the six-row stale sweep, one blindness.
    expect(arms.filter((arm) => arm === "READ")).toHaveLength(3);
    expect(arms.filter((arm) => arm === "STALE")).toHaveLength(6);
    expect(arms.filter((arm) => arm === "BLIND")).toHaveLength(1);
  },
  DIFFERENTIAL_BUDGET_MS,
);
