// The standing family floor for `union-axis` — the #1584 conversion of the legacy `no-inline-union-redecl`
// descriptor into ONE ordinary policy reading `lib/union-axis.ts`. What a declared proof row structurally
// cannot express lives here:
//
//   §4.2 — the ordinary identity arm, ALL THREE assertions (`effectiveFindings []`, `waivedFindings 1`,
//          `authorityAlarms []`), once per ARM, because the two arms anchor differently: arm A on the
//          ALIAS NAME, arm B on the inline SET's own source text. A `mustPass` row asserts only the first.
//   §4.5 — the policy is `entire-population` and that is the whole reason the field exists here: arm B
//          matches a re-spell in one package against a tuple homed in ANOTHER, so a request admitting only
//          the re-speller would "prove" the axis has no home and report nothing. A proper subset must
//          DEFER, not partially run.
//   §4.6 — the conversion differential against the frozen legacy descriptor at 2030ab180, replayed over
//          each legacy example's OWN file map. Legacy-side coverage is stated per example rather than
//          averaged: 5 of the 10 legacy examples flag, covering both arms and all three legacy token
//          sub-kinds, so the replay is evidence rather than a vacuous zero-vs-zero. ONE classified
//          difference: POSITION/TOKEN. Every legacy token was a synthetic discriminator label (`union
//          Mode`, `re-spell AXIS`, `z.enum re-spell MODE`) that appears in no source file and THROWS under
//          `report.node`'s exact-slice validation; each becomes an authored slice, and arm B's z.enum
//          sub-kind additionally moves from the CALL to its ARRAY argument (a call's text carries parens,
//          which the marker grammar's `[^()\r\n]+` position group cannot hold).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as unionRedecl } from "../../../../tooling/src/verify/gates/no-inline-union-redecl.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/union-axis-family";
const FAMILY: readonly GatePolicy[] = [unionRedecl];
const LEGACY_PATH = "tooling/src/verify/gates/no-inline-union-redecl.ts";
/** The pre-conversion SHA the brief names; verified byte-identical to the module at this lane's base. */
const LEGACY_SHA = "2030ab180";
const HOME = "packages/contracts/src/axis-home.ts";
const RESPELL = "packages/server/src/axis-respell.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: FAMILY,
    policies: FAMILY,
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the union-axis policy preserves its founding fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY, ONE ARM EACH ───────────────────────────────────────────────────────────────
test("an arm-A waiver binds to the exact policy and the ALIAS NAME the report supplies", () => {
  const waived = passOf({
    "packages/contracts/src/alias.ts":
      "// @orb-waive no-inline-union-redecl(Mode): the proof's stand-in reason; ends when this fixture stops flagging.\nexport type Mode = 'a' | 'b' | 'c';\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

test("an arm-B waiver binds to the inline SET's own source text, spacing included", () => {
  const waived = passOf({
    [HOME]: "export const AXIS = ['a', 'b', 'c'] as const;\n",
    [RESPELL]:
      "// @orb-waive no-inline-union-redecl('a' | 'b' | 'c'): the proof's stand-in reason; ends when this fixture stops flagging.\nexport interface T { mode: 'a' | 'b' | 'c' }\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a request admitting only the re-speller DEFERS instead of declaring the axis unhomed", () => {
  const files = {
    [HOME]: "export const AXIS = ['a', 'b', 'c'] as const;\n",
    [RESPELL]: "export interface T { mode: 'a' | 'b' | 'c' }\n",
  };
  const whole = passOf(files);
  expect(whole.toolErrors).toEqual([]);
  expect(whole.authority.effectiveFindings).toHaveLength(1);

  const narrowed = passOf(files, [RESPELL]);
  expect(narrowed.toolErrors).toEqual([]);
  expect(narrowed.policies[0]?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  // The point of the pin: the narrowed run must produce NO verdict, not a silent clean one. Without the
  // deferral the same request would run arm B against a tuple map the selection never let it collect.
  expect(narrowed.authority.effectiveFindings).toEqual([]);
});

// ─── §4.6 CONVERSION DIFFERENTIAL ───────────────────────────────────────────────────────────────────────
function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY_SHA}:${LEGACY_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_PATH));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. Both named
  // modules are still on the tree and untouched by this conversion.
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  expect(rewritten).not.toBe(source);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/contracts/src/x.ts"]: example.files } : example.files;
}

/** One comparable line per finding: where it landed and what it named. */
function line(finding: { readonly file: string; readonly line: number; readonly column: number; readonly token?: string }): string {
  return `${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`;
}

const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

function legacyVerdict(
  descriptor: GateDescriptor,
  files: Readonly<Record<string, string>>,
): { readonly lines: readonly string[]; readonly refusals: readonly string[] } {
  const project = projectOf(files);
  const result = runPass([descriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    // The legacy side is driven over the SAME admitted set the final policy declares — the descriptor's own
    // `scanRoot` still applies inside `runPass`, and no fixture here sits under `tooling/src/verify/gates/`.
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return { lines: sorted((result.gates[0]?.findings ?? []).map(line)), refusals: result.toolErrors.map((error) => error.phase) };
}

function finalVerdict(files: Readonly<Record<string, string>>): { readonly lines: readonly string[]; readonly refusals: readonly string[] } {
  const result = passOf(files);
  return {
    lines: sorted(result.authority.effectiveFindings.map(line)),
    refusals: sorted(result.toolErrors.map((error) => `${error.policyId} ${error.phase}`)),
  };
}

/** THE ONE CLASSIFIED DIFFERENCE — position/token — applied per legacy finding, so the comparison is one
 *  `toEqual` and an unclassified change cannot average out against a classified one. */
const TOKEN_MOVE: ReadonlyMap<string, { readonly token: string; readonly columnDelta: number }> = new Map([
  // arm A: the alias DECLARATION's start → its NAME. `export type ` is 12 characters.
  ["union Mode", { token: "Mode", columnDelta: 12 }],
  // arm B union: same column, synthetic label → the set's own text.
  ["re-spell AXIS", { token: "'a' | 'b' | 'c'", columnDelta: 0 }],
  ["re-spell PAIR", { token: "'x' | 'y'", columnDelta: 0 }],
  ["re-spell MODES", { token: "'a' | 'b' | 'c'", columnDelta: 0 }],
  // arm B z.enum: the CALL → its ARRAY argument. `z.enum(` is 7 characters.
  ["z.enum re-spell MODE", { token: "['a', 'b', 'c']", columnDelta: 7 }],
]);

test("the converted policy reproduces the frozen legacy gate on every original example", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(10);
  let flagging = 0;
  const movedTokens = new Set<string>();
  for (const example of examples) {
    const files = legacyFiles(example);
    const before = legacyVerdict(legacy, files);
    expect(before.refusals, example.why).toEqual([]);
    flagging += before.lines.length > 0 ? 1 : 0;
    const expected = before.lines.map((entry) => {
      const match = /^(?<file>[^:]+):(?<row>\d+):(?<column>\d+) (?<token>.+)$/u.exec(entry);
      const groups = match?.groups ?? {};
      const move = TOKEN_MOVE.get(groups["token"] ?? "");
      expect(move, `unclassified legacy token in ${entry}`).toBeDefined();
      movedTokens.add(groups["token"] ?? "");
      return `${groups["file"]}:${groups["row"]}:${String(Number(groups["column"]) + (move?.columnDelta ?? 0))} ${move?.token ?? ""}`;
    });
    expect(finalVerdict(files), example.why).toEqual({ lines: sorted(expected), refusals: [] });
  }
  // LEGACY-SIDE COVERAGE, asserted rather than assumed: a replay over examples that never flagged would be
  // green whatever the conversion did. Five of ten flag, and between them they exercise every legacy token
  // shape both arms could emit — which is what makes the position move above a measured delta.
  expect(flagging).toBe(5);
  expect(movedTokens.size).toBe(5);
});
