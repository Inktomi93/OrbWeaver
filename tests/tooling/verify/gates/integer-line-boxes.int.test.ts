// Retained token arithmetic, semantic class pairing/rest scale and their failure lifetimes.
// Stylesheet occurrence/permission/refusal controls belong to the native Stylelint suite.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ScriptKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as integerLineBoxes } from "../../../../tooling/src/verify/gates/integer-line-boxes.ts";
import { gate as restTransformGrid } from "../../../../tooling/src/verify/gates/rest-transform-grid.ts";
import { runPolicyPass as nativePass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

function runPolicyPass(input: Parameters<typeof nativePass>[0]): ReturnType<typeof nativePass> {
  return nativePass({ ...input, nativeTypeFacts: () => isolatedTypeFacts(input.project) });
}

const TOKENS_JSON_REL = "packages/ui/src/tokens/tokens.json";
const ANCHOR_REL = "packages/ui/src/lib/class-merge.ts";

const SNAPPED_SCALE = JSON.stringify({
  text: {
    label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } },
    micro: { $type: "dimension", $value: { value: 0.656_25, unit: "rem" } },
  },
  leading: {
    none: { $type: "number", $value: 1 },
    label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } },
  },
});

// Integer token arithmetic reads these exact resource bytes; each class control adds its own carrier.
const CORPUS = {
  "packages/ui/src/keep.tsx": "export const Keep = () => null;\n",
  [TOKENS_JSON_REL]: SNAPPED_SCALE,
} as const;

/** Materialize a file map into the scratch root AND into a ts-morph project, then run one policy over it.
 *  `mode: "resource"` fixtures are real directories, so the resource reader sees exactly these bytes. */
function pass(policy: GatePolicy, scratch: string, files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { jsx: 4 } });
  for (const [rel, text] of Object.entries(files)) {
    const absolute = join(scratch, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
    if (rel.endsWith(".ts") || rel.endsWith(".tsx")) {
      project.createSourceFile(absolute, text, { scriptKind: rel.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS, overwrite: true });
    }
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: scratch,
    project,
    resourceOptions: { overlay: files },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

/** The four facts that together say "this run is not a verdict" rather than "the tree is clean". Read as
 *  one object so a refusal that drifted on ONE axis — a finding leaking through, an owner completing —
 *  fails with the whole shape in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function populationRefusal(policyId: string, fragment: string): Record<string, unknown> {
  return {
    findings: [],
    toolErrors: [{ policyId, phase: "population", message: expect.stringContaining(fragment) }],
    owners: [[policyId, "incomplete"]],
    withheld: [policyId],
  };
}

// The two policies' declared rows through the conformance runner. MEASURED: 7.4 s alone at per-core load 0.4, and
// 16.6 s under a loaded lane run. The base is twice the worst loaded reading.
const FAMILY_PROOFS_TIMEOUT = scaledBudget(34_000);

test("the static-class-expression family keeps its declared proofs", { timeout: FAMILY_PROOFS_TIMEOUT }, () => {
  expect(verifyPolicyProofs([integerLineBoxes, restTransformGrid])).toEqual([]);
});

test("§4.2 — the exact ordinary waiver at the reported position suppresses, waives one, and alarms not at all", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, {
    ...CORPUS,
    "packages/ui/src/waived.tsx":
      '// @orb-waive integer-line-boxes(text-label): SVG text has no line box; ends when this carrier becomes HTML text.\nexport const G = <text className="text-label" />;\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("§4.2 control — the SAME fixture with a dead position ALARMS, so the arm above discriminates", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, {
    ...CORPUS,
    "packages/ui/src/waived.tsx":
      '// @orb-waive integer-line-boxes(no-such-utility): SVG text has no line box; ends when this carrier becomes HTML text.\nexport const G = <text className="text-label" />;\n',
  });

  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["ordinary-waiver"]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
});

test("§4.5 — a missing token vault REFUSES at the population phase instead of silencing the gate", ({ scratch }) => {
  // The legacy `readTypeScale` returned `undefined` here and every arm of the gate went quiet. That branch
  // is the one this conversion deleted, and this is its successor: the run stops being a verdict.
  const { [TOKENS_JSON_REL]: _vault, ...withoutVault } = CORPUS;
  const result = pass(integerLineBoxes, scratch, withoutVault);

  expect(refusalShape(result)).toEqual(populationRefusal("integer-line-boxes", "resource declaration json:tokens is missing"));
});

test("§4.5 — an UNPARSEABLE token vault refuses with its own status word, never as `{}`", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, { ...CORPUS, [TOKENS_JSON_REL]: '{"text":' });

  expect(refusalShape(result)).toEqual(populationRefusal("integer-line-boxes", "resource declaration json:tokens is unresolved"));
});

test("a complete run files one resource receipt per declaration with nothing unresolved", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, CORPUS);

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ kind, source, unresolved }) => ({ kind, source, unresolved })))).toEqual([
    [
      { kind: "resource", source: "authored-text#1", unresolved: 0 },
      { kind: "resource", source: "json:tokens", unresolved: 0 },
    ],
  ]);
});

test("ARM B — the blindness floors fire on an ANCHORED tree and are silent without the anchor", ({ scratch }) => {
  // No conformance fixture can reach these: the real-tree guard suppresses them on every proof row, which
  // is exactly why cutting either floor comes back clean and why the pin lives here instead.
  const anchored = pass(integerLineBoxes, scratch, {
    ...CORPUS,
    [ANCHOR_REL]: "export const anchor = 1;\n",
    "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-label" />;\n',
  });
  expect(anchored.authority.effectiveFindings.map(({ message }) => message ?? "")).toEqual([
    expect.stringContaining("pairing census below the real-tree floor"),
  ]);

  const unanchored = pass(integerLineBoxes, scratch, {
    ...CORPUS,
    "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-label" />;\n',
  });
  expect(unanchored.authority.effectiveFindings).toEqual([]);
});

test("ARM B — rest-transform-grid's own floors behave the same way, and name the transform census", ({ scratch }) => {
  const anchored = pass(restTransformGrid, scratch, {
    [ANCHOR_REL]: "export const anchor = 1;\n",
    "packages/ui/src/x.tsx": 'export const G = <div className="scale-100" />;\n',
  });
  expect(anchored.toolErrors).toEqual([]);
  expect(anchored.authority.effectiveFindings.map(({ message }) => message ?? "")).toEqual([
    expect.stringContaining("transform-utility census below the real-tree floor"),
  ]);
});
