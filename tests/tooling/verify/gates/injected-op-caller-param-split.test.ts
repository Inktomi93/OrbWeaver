// The §4.6 SPLIT-ARM DIFFERENTIAL for `injected-op-caller-param` + `injected-op-caller-param-health`
// (#2000, p-parity-tier1). The family's CONFORMANCE entry already exists and stays where it is —
// `contract-shape-wave-1.test.ts` runs `verifyPolicyProofs` for all three wave-1 split families. This file
// adds only what a proof row and a conformance run structurally cannot express: the differential.
//
// The `-health` policy exists BECAUSE one legacy descriptor carried a per-node occurrence `visit` (an op
// that takes an entity id and returns a Promise but names no caller) and a whole-tree `finalize` with two
// ratchets — BLIND (the `@orb/kit/ids` entity-id derivation came back empty) and STALE (a CALLER_FREE_OPS
// row names an op no contract declares). The split gave the occurrence half `execution: "selected-files"`
// and `authority: "ordinary"`, and the ratchets `execution: "entire-population"` + `authority: "hard"`, so
// the legacy gate's behaviour is now the behaviour of the two policies TOGETHER. This file compares them
// against the frozen legacy descriptor at `7993f264c`, the commit immediately before `f693a27a9` split them.
//
// THE CLASSIFIED DIFFERENCES:
//   1. SPLIT — one legacy gate, two final policies; the UNION is compared.
//   2. RATCHET FINDING ANCHOR — the legacy `finalize` reported both ratchets on line 1 of the GATE MODULE
//      ITSELF, a path in neither policy's population. The health policy anchors on its own real-tree anchor
//      (`packages/db/src/schema/index.ts`) and the message text is otherwise unchanged.
//   3. **A CATCH-REGRESSION THIS DIFFERENTIAL FOUND, AND THE RULING THAT CLOSED IT (owner, 2026-09-12,
//      #2000).** The legacy `seenOps.add(...)` ran only AFTER the entity-id trigger, so an op that still
//      exists but no longer takes a branded entity id was STALE. The conversion widened the census to EVERY
//      Promise-returning op function type, so such a row kept its caller-free exemption silently forever —
//      a standing permission on an op that reaches no tenant data, which is the exact rot the two-sided
//      ratchet exists to kill. Ruling: the LEGACY PREDICATE is correct (a row is dead the moment its
//      premise stops holding, and the ordinary sibling only fires on branded-entity-id ops, so an exemption
//      for an op without one suppresses nothing) and the LEGACY MESSAGE was wrong (it described the widened
//      predicate). Both restored/corrected in `injected-op-caller-param-health.ts`; the last test in this
//      file is the recovered catch, asserted in both engines.
//
// THE ANCHOR-GUARD FACT: the legacy `finalize` self-guarded on the real-tree anchor and NONE of the legacy
// gate's 2 mustFlag / 6 mustPass examples loads it — the arm the split carried out into its own policy had
// ZERO legacy coverage, so its successor proof below is CONSTRUCTED from the arm's own trigger conditions.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { CALLER_FREE_OPS, IDS_MODULE, gate as occurrence } from "../../../../tooling/src/verify/gates/injected-op-caller-param.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/injected-op-caller-param-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/injected-op-caller-param";
/** The commit immediately before `f693a27a9` split the gate — the last one carrying both arms. */
const BASE = "7993f264c43f96f5b3595d184919d4cdee253a43";
const LEGACY_PATH = "tooling/src/verify/gates/injected-op-caller-param.ts";
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const CONTRACT_FILE = "packages/server/src/domain/character/contract/service.ts";
const CALLER_FREE_NAMES = Object.keys(CALLER_FREE_OPS);

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? CONTRACT_FILE]: example.files } : example.files;
}

const STALE_RE = /CALLER_FREE_OPS names "(?<op>[^"]+)"/u;

function verdictOf(
  findings: readonly { readonly file: string; readonly line: number; readonly token?: string; readonly message: string }[],
): readonly string[] {
  return findings
    .map((finding) => {
      if (finding.message.includes("derived ZERO entity-id type names")) {
        return "BLIND";
      }
      const stale = STALE_RE.exec(finding.message)?.groups?.["op"];
      return stale === undefined ? `OCCURRENCE ${finding.file}:${finding.line} ${finding.token ?? "<no token>"}` : `STALE ${stale}`;
    })
    .toSorted((left, right) => left.localeCompare(right));
}

function legacyVerdict(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return verdictOf((result.gates[0]?.findings ?? []).map((finding) => ({ ...finding, message: finding.message ?? gate.message })));
}

function finalVerdict(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: policies, policies: [...policies], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  for (const policy of result.policies) {
    expect(policy.owner.status, policy.id).toBe("success");
  }
  const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
  return verdictOf(result.authority.effectiveFindings.map((finding) => ({ ...finding, message: finding.message ?? messageOf.get(finding.policyId) ?? "" })));
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${LEGACY_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_PATH));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the occurrence half reproduces the frozen legacy gate on every original example", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples.length).toBeGreaterThan(0);
  let flagged = 0;
  for (const example of examples) {
    const files = legacyFiles(example);
    const label = `${occurrence.id}: ${example.why}`;
    // The legacy finalize self-guarded OFF here — the coverage gap this differential found.
    expect(Object.keys(files), label).not.toContain(REAL_TREE_ANCHOR);
    const before = legacyVerdict(legacy, files);
    expect(
      before.filter((line) => line.startsWith("STALE") || line === "BLIND"),
      `${label}: the legacy corpus must not reach the moved arms`,
    ).toEqual([]);
    expect(finalVerdict([occurrence], files), label).toEqual(before);
    flagged += before.length;
  }
  expect(flagged).toBeGreaterThan(0);
});

// ─── SUCCESSOR PROOF for the two ratchets (§4.6) ─────────────────────────────────────────────────────────
// CONSTRUCTED, not replayed. Built off the LIVE `CALLER_FREE_OPS` keys so a row added or removed there
// cannot leave this proof describing a table nobody has.
const IDS_LIVE = 'export type AssetId = TypeIdOf<"asset">;\nexport type CharacterId = TypeIdOf<"character">;\n';
const IDS_BLIND = "export type NotAnEntityId = string;\n";

/** Each named op declared as a real entity-id-taking, caller-free op — the shape its exemption row is ABOUT.
 *  `omit` drops one so the stale arm has exactly one subject. */
function contractDeclaring(omit?: string): string {
  return CALLER_FREE_NAMES.filter((name) => name !== omit)
    .map((name) => `export type ${name} = (assetId: AssetId) => Promise<void>;\n`)
    .join("");
}

test("the health half reproduces the legacy BLIND and STALE ratchets the legacy corpus never reached", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const scenarios: readonly { readonly why: string; readonly files: Readonly<Record<string, string>>; readonly expected: readonly string[] }[] = [
    {
      why: "HEALTHY — every CALLER_FREE_OPS row is declared by a live contract and the id vocabulary is nonempty",
      files: { [REAL_TREE_ANCHOR]: "export const schema = {};\n", [IDS_MODULE]: IDS_LIVE, [CONTRACT_FILE]: contractDeclaring() },
      expected: [],
    },
    {
      why: "STALE — one exemption row names an op no contract declares any more",
      files: { [REAL_TREE_ANCHOR]: "export const schema = {};\n", [IDS_MODULE]: IDS_LIVE, [CONTRACT_FILE]: contractDeclaring("LoadCardText") },
      expected: ["STALE LoadCardText"],
    },
    {
      why: "BLIND + every row stale — the ids module derives no TypeIdOf-shaped export and no contract is present at all",
      files: { [REAL_TREE_ANCHOR]: "export const schema = {};\n", [IDS_MODULE]: IDS_BLIND },
      expected: ["BLIND", ...CALLER_FREE_NAMES.map((name) => `STALE ${name}`)].toSorted((left, right) => left.localeCompare(right)),
    },
    {
      why: "THE ANCHOR GUARD, both sides — no real-tree anchor, so neither engine claims the tree blind or every row stale",
      files: { [IDS_MODULE]: IDS_LIVE, [CONTRACT_FILE]: contractDeclaring() },
      expected: [],
    },
  ];
  for (const scenario of scenarios) {
    expect(legacyVerdict(legacy, scenario.files), `legacy: ${scenario.why}`).toEqual(scenario.expected);
    expect(finalVerdict([occurrence, health], scenario.files), `final: ${scenario.why}`).toEqual(scenario.expected);
  }
});

test("THE RECOVERED CATCH (#2000): an exemption whose op stopped taking a branded entity id is stale in BOTH engines", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const target = CALLER_FREE_NAMES[0] as string;
  // Every row's op is declared, but ONE of them no longer takes a branded entity id — so it no longer
  // reaches tenant data, and its caller-free exemption permits nothing.
  const files = {
    [REAL_TREE_ANCHOR]: "export const schema = {};\n",
    [IDS_MODULE]: IDS_LIVE,
    [CONTRACT_FILE]: `export type ${target} = (label: string) => Promise<void>;\n${contractDeclaring(target)}`,
  };
  // LEGACY: `seenOps.add` ran only AFTER the entity-id trigger, so the row reads as stale and ratchets down.
  expect(legacyVerdict(legacy, files)).toEqual([`STALE ${target}`]);
  // FINAL, after the owner ruling of 2026-09-12: the conversion had widened the health census to EVERY
  // Promise-returning op function type, which let this row stand silently forever — the catch-regression
  // this differential found. The ruling restored the legacy predicate (an op is SEEN only when its params
  // mention a branded entity id, the exact condition under which the ordinary sibling could fire) and
  // corrected the message, which described the widened predicate and was false of the restored one. This
  // assertion is the recovered catch.
  expect(finalVerdict([occurrence, health], files)).toEqual([`STALE ${target}`]);
});
