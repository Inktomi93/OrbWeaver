// CONVERSION-TIME EVIDENCE for the three §12.6 single-policy mixed-hook modules (#1584) — the §4.6
// DIFFERENTIAL, written to the `freeze-provenance-conversion.test.ts` recipe. NOT a standing regression
// gate: it freezes each legacy descriptor at the pre-conversion commit and RETIRES with the legacy loader.
//
// What it proves, and the reason each piece is here rather than in a proof row:
//   1. §4.6 — every LEGACY example replayed through the frozen legacy descriptor and through the final
//      policy over the SAME BYTES, with the finding CARDINALITY compared and every difference CLASSIFIED.
//      The conformance stage is structurally blind to this: a proof row rewritten after conversion only
//      proves the new code agrees with itself.
//   2. §4.5 — the receipt pair a complete resource run files, which no `mustFlag`/`mustPass` row asserts.
//
// THE REPLAY RUNS ON A REAL TMPDIR, not on a virtual in-memory root, because the legacy
// `tooling-instrument-proof` answers arm A with `existsSync(join(ctx.root, "tooling/src", member))`. Under
// a synthetic root every registry row would read DEAD and the differential would report a catch explosion
// that is an artifact of the harness — the shape guide §6.4 calls a faked nonzero side.
//
// MEASURED RESULT, 2026-09-12 (the table below is asserted, not narrated): **every one of the 34 legacy
// examples produces the SAME NUMBER of findings on both sides.** The only differences are ANCHOR MOVES,
// forced by the final report sink refusing a finding outside the effective population
// (`lib/policy-pass-context.ts`): the legacy engine anchored registry-level verdicts at `<file>:0` and
// anchored two ABSENCE verdicts at the very file it was reporting missing. No arm was retired, no
// population narrowed, and no example changed sides.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as agentBridgeLock } from "../../../../tooling/src/verify/gates/agent-bridge-lock.ts";
import { gate as designAuditRuleProof } from "../../../../tooling/src/verify/gates/design-audit-rule-proof.ts";
import { gate as toolingInstrumentProof } from "../../../../tooling/src/verify/gates/tooling-instrument-proof.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const DIFFERENTIAL_TIMEOUT_MS = scaledBudget(120_000);
/** The commit immediately before the conversion — the last one carrying all three legacy descriptors. */
const BASE = "250c9eb60";
const GATES_DIR = "tooling/src/verify/gates";

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), GATES_DIR, relFromGates)).href);
}

/** The frozen legacy descriptor, imported from a scratch copy OUTSIDE the repository. Its own relative
 *  imports are rewritten to absolute file URLs; bare `ts-morph` still resolves, because Vite resolves a
 *  package specifier from the project root rather than from the importing file.
 *
 *  THE REWRITE IS LINE-ANCHORED, AND THE FIRST VERSION OF IT WAS NOT — measured 2026-09-12, and it is the
 *  §4.1 `String.replace` hazard one axis over. `agent-bridge-lock`'s own FIXTURE STRING contains
 *  `import type { RouteResolution } from "../lib/app-ready-signal.ts"`, so an unanchored pattern rewrote
 *  the fixture as well as the module's imports: both engines then judged the planted router file against a
 *  specifier that no longer matched, both reported an extra finding, and the differential read as a
 *  perfectly matched pair of WRONG numbers. The `m`-anchored form can only reach a real top-level import,
 *  and the assertion below refuses if one is left behind. */
async function frozenLegacyGate(scratch: string, gateFile: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${GATES_DIR}/${gateFile}`], { encoding: "utf8" });
  const target = join(scratch, basename(gateFile));
  const rewritten = source.replaceAll(
    /^(import .*?from )"(\.\.\/(?:contract|lib)\/[\w-]+\.ts)"/gmu,
    (_match, head: string, specifier: string) => `${head}${toolingHref(specifier)}`,
  );
  expect(/^import .*?from "\.\.\//mu.test(rewritten), `${gateFile}: a relative import survived the rewrite`).toBe(false);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${gateFile}`)) as { readonly gate: GateDescriptor }).gate;
}

function plant(root: string, files: Readonly<Record<string, string>>): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.addSourceFileAtPath(absolute);
    }
  }
  return project;
}

interface Hit {
  readonly file: string;
  readonly line: number;
}

function sortHits(hits: readonly Hit[]): readonly Hit[] {
  return [...hits].toSorted((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

function legacySide(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly Hit[] {
  const root = mkdtempSync(join(tmpdir(), "orb-mixed-hook-legacy-"));
  try {
    const project = plant(root, files);
    const result = runPass([gate], { root, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
    expect(result.toolErrors).toEqual([]);
    return sortHits((result.gates[0]?.findings ?? []).map((finding) => ({ file: finding.file, line: finding.line })));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function finalSide(policy: GatePolicy, files: Readonly<Record<string, string>>): readonly Hit[] {
  const root = mkdtempSync(join(tmpdir(), "orb-mixed-hook-final-"));
  try {
    const project = plant(root, files);
    const parser = new Project({ useInMemoryFileSystem: true });
    const result = runPolicyPass({
      knownPolicies: [policy],
      policies: [policy],
      root,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
      resourceOptions: { overlay: files, parseSource: (path, text) => parser.createSourceFile(`${root}/${path}`, text, { overwrite: true }) },
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    return sortHits(result.authority.effectiveFindings.map((finding) => ({ file: finding.file, line: finding.line })));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The three comparable outcomes. CARDINALITY is compared first and separately, because it is the axis a
 *  catch regression lives on; an anchor move changes WHERE a verdict is reported, never WHETHER. */
const DELTAS = ["identical", "anchor-line", "anchor-file"] as const;
type Delta = (typeof DELTAS)[number];

function classify(legacy: readonly Hit[], final: readonly Hit[]): Delta {
  if (JSON.stringify(legacy) === JSON.stringify(final)) {
    return "identical";
  }
  const files = (hits: readonly Hit[]): string => JSON.stringify(hits.map((hit) => hit.file));
  return files(legacy) === files(final) ? "anchor-line" : "anchor-file";
}

function exampleFiles(example: GateExample): Readonly<Record<string, string>> {
  if (typeof example.files !== "string") {
    return example.files;
  }
  const at = example.at;
  expect(at, "a string-form legacy example must name its `at` path").toBeDefined();
  return { [at as string]: example.files };
}

interface Subject {
  readonly gateFile: string;
  readonly policy: GatePolicy;
  /** The measured per-example outcome, in legacy `mustFlag` then `mustPass` order. */
  readonly expected: readonly (readonly [Delta, number])[];
}

/** MEASURED 2026-09-12. Second element is the finding count, which is EQUAL on both sides in every row —
 *  that equality is the catch-parity claim, and the `Delta` beside it is the classification of the rest. */
const SUBJECTS: readonly Subject[] = [
  {
    gateFile: "agent-bridge-lock.ts",
    policy: agentBridgeLock,
    // Every arm already anchored on a file inside the population, so nothing moved.
    expected: [
      ["identical", 1],
      ["identical", 1],
      ["identical", 1],
      ["identical", 2],
      ["identical", 1],
      ["identical", 1],
      ["identical", 1],
      ["identical", 0],
    ],
  },
  {
    gateFile: "design-audit-rule-proof.ts",
    policy: designAuditRuleProof,
    // Seven anchor-LINE moves: the legacy engine reported every registry-level verdict at `rules.ts:0`, a
    // coordinate the final contract rejects (`assertCoordinate` requires a positive integer), and the
    // duplicate/missing-proof verdicts now anchor on the registry ROW they are about. One anchor-FILE move:
    // the MISSING-registry verdict, which legacy anchored at the very file it was reporting absent.
    expected: [
      ["anchor-line", 3],
      ["anchor-line", 3],
      ["anchor-line", 3],
      ["anchor-file", 1],
      ["anchor-line", 1],
      ["anchor-line", 1],
      ["anchor-line", 1],
      ["identical", 1],
      ["anchor-line", 2],
      ["identical", 0],
      ["identical", 0],
    ],
  },
  {
    gateFile: "tooling-instrument-proof.ts",
    policy: toolingInstrumentProof,
    // One anchor-FILE move: the blind-registry tripwire (arm E), which legacy anchored at the missing
    // registry itself and which now anchors on the exit-contract ANCHOR that proved the run reached the
    // tooling tree at all. Every other arm — including all three #1506 arm-F spellings, replayed here
    // WITHOUT the artifacts home planted — keeps its exact site.
    expected: [
      ["identical", 1],
      ["identical", 2],
      ["identical", 2],
      ["identical", 1],
      ["identical", 1],
      ["identical", 2],
      ["anchor-file", 1],
      ["identical", 1],
      ["identical", 1],
      ["identical", 1],
      ["identical", 0],
      ["identical", 0],
      ["identical", 0],
      ["identical", 0],
      ["identical", 0],
      ["identical", 0],
    ],
  },
];

test("§4.6 — every legacy example produces the same finding count on both engines, with each difference classified", {
  timeout: DIFFERENTIAL_TIMEOUT_MS,
}, async ({ scratch }) => {
  for (const subject of SUBJECTS) {
    const legacyGate = await frozenLegacyGate(scratch, subject.gateFile);
    const examples = [...legacyGate.mustFlag, ...legacyGate.mustPass];
    const measured = examples.map((example) => {
      const files = exampleFiles(example);
      const legacy = legacySide(legacyGate, files);
      const final = finalSide(subject.policy, files);
      // Cardinality FIRST and on its own: a catch regression lives here, an anchor move does not.
      expect(final.length, `${subject.gateFile} example ${example.why}`).toBe(legacy.length);
      return [classify(legacy, final), legacy.length] as const;
    });
    expect(measured, subject.gateFile).toEqual(subject.expected);
  }
});

test("§4.5 — a complete tooling-instrument-proof run files its demand receipt and reaches a verdict", ({ scratch }) => {
  const files = {
    "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
    "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
    "tooling/src/_shared/artifacts.ts": "export function printResult(_tool: string, _pairs: unknown): void {}\n",
    "tooling/src/snapx/index.ts": "export {};\n",
    "tests/tooling/snapx/proof.test.ts":
      "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
  };
  const project = plant(scratch, files);
  const parser = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({
    knownPolicies: [toolingInstrumentProof],
    policies: [toolingInstrumentProof],
    root: scratch,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    resourceOptions: { overlay: files, parseSource: (path, text) => parser.createSourceFile(`${scratch}/${path}`, text, { overwrite: true }) },
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // `authored-path` is an UNPOPULATED DEMAND kind: it admits no path, so the population-phase refusal that
  // guards every other kind does not apply to it and the RECEIPT is the only thing that proves the door was
  // called at all. One member selector demanded, one resolved, zero unresolved — plus the source-population
  // receipt naming the denominator this policy actually walked.
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "population", source: "instrument-proof-corpus", members: 5, unresolved: 0 },
      { kind: "resource", source: "authored-path#1", resources: 1, unresolved: 0 },
    ],
  ]);
});
