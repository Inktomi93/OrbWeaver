// The `static-class-expression` FAMILY — `integer-line-boxes` and `rest-transform-grid`, the two policies
// whose subject is decided by `lib/static-class-expression.ts#walkStaticClassExpressions`. The file keeps
// its original name because a family test is routinely filed under one member's name; grep the POLICY ID
// across this directory, never the filename.
//
// WHAT LIVES HERE AND WHY, since a conversion no longer owes a family test for its DECLARED rows (the
// conformance stage runs every `mustFlag`/`mustPass` on the static tier). These are the four things a proof
// row structurally cannot express:
//
//   §4.2 the POSITIVE IDENTITY ARM for the one ORDINARY member. A `mustPass` row asserts only that zero
//        effective findings remain; the arm is all THREE assertions — `effectiveFindings []`,
//        `waivedFindings 1`, `authorityAlarms []` — because an over-broad or duplicate marker alarms
//        WITHOUT changing the finding count. Its discrimination control is here too: the same fixture with
//        the marker's position flipped must ALARM, or "my arm is green" is not "my arm discriminates".
//   §6.3 the REFUSALS. Both policies declare `authored-css`; `integer-line-boxes` also declares
//        `json:tokens` and `authored-text`. The family drive pins the complete runtime outcome for missing,
//        empty, and unresolved inputs: no effective findings, a named population-phase tool error, an
//        incomplete owner, and that owner withheld. Its healthy twin pins one unresolved-zero receipt per
//        declaration. These assertions are stronger than refusal-text matching alone and remain family-owned.
//   ARM B, both members. The blindness floors fire only on a tree carrying the REAL_TREE_ANCHOR, so no
//        conformance fixture reaches them — the §4.1 cut of each floor comes back clean for that reason
//        alone. Driven here with the anchor present, and with it absent as the negative control.
//   §4.6 the CONVERSION DIFFERENTIAL for the population port: the admitted CSS set must be the same set the
//        legacy `readdirSync`/`globSync` walk produced.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project, ScriptKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as integerLineBoxes } from "../../../../tooling/src/verify/gates/integer-line-boxes.ts";
import { gate as restTransformGrid } from "../../../../tooling/src/verify/gates/rest-transform-grid.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { loadAuthoredCss } from "../../../../tooling/src/verify/ops/resource-tree.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TOKENS_JSON_REL = "packages/ui/src/tokens/tokens.json";
const ANCHOR_REL = "packages/ui/src/lib/class-merge.ts";
const GENERATED_THEME_CSS = "packages/ui/src/styles/theme.css";

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

/** The cheapest file map that makes every declared resource of BOTH members resolvable: `authored-css` is
 *  assembled from the `client-source` AND `ui-source` trees, so each must be non-empty, and at least one
 *  `.css` must exist or the CSS fact itself is empty. */
const CORPUS = {
  "packages/client/src/styles/keep.css": ".keep {\n  color: var(--color-foreground);\n}\n",
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
// 8.0 s beside a whole affected-test run. The base is twice the worst loaded reading.
const FAMILY_PROOFS_TIMEOUT = scaledBudget(16_000);

test("the static-class-expression family keeps its declared proofs", { timeout: FAMILY_PROOFS_TIMEOUT }, () => {
  expect(verifyPolicyProofs([integerLineBoxes, restTransformGrid])).toEqual([]);
});

test("§4.2 — the exact ordinary waiver at the reported position suppresses, waives one, and alarms not at all", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, {
    ...CORPUS,
    "packages/client/src/styles/waived.css":
      ".reading {\n  /* @orb-waive integer-line-boxes(--reading-line-height): the user-owned continuous multiplier. */\n  line-height: var(--reading-line-height);\n}\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("§4.2 control — the SAME fixture with a dead position ALARMS, so the arm above discriminates", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, {
    ...CORPUS,
    "packages/client/src/styles/waived.css":
      ".reading {\n  /* @orb-waive integer-line-boxes(--no-such-property): the user-owned continuous multiplier. */\n  line-height: var(--reading-line-height);\n}\n",
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

test("§4.5 — a CSS corpus with no members refuses for BOTH members of the family, not just the one that reads it first", ({ scratch }) => {
  const forInteger = pass(integerLineBoxes, scratch, { "packages/ui/src/keep.tsx": CORPUS["packages/ui/src/keep.tsx"], [TOKENS_JSON_REL]: SNAPPED_SCALE });
  expect(refusalShape(forInteger)).toEqual(populationRefusal("integer-line-boxes", "resource declaration authored-css is missing"));

  const forRest = pass(restTransformGrid, scratch, { "packages/ui/src/keep.tsx": CORPUS["packages/ui/src/keep.tsx"] });
  expect(refusalShape(forRest)).toEqual(populationRefusal("rest-transform-grid", "resource declaration authored-css is missing"));
});

test("a complete run files one resource receipt per declaration with nothing unresolved", ({ scratch }) => {
  const result = pass(integerLineBoxes, scratch, CORPUS);

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ kind, source, unresolved }) => ({ kind, source, unresolved })))).toEqual([
    [
      { kind: "resource", source: "authored-text#1", unresolved: 0 },
      { kind: "resource", source: "css-inventory:authored", unresolved: 0 },
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
    "packages/client/src/styles/keep.css": CORPUS["packages/client/src/styles/keep.css"],
    [ANCHOR_REL]: "export const anchor = 1;\n",
    "packages/ui/src/x.tsx": 'export const G = <div className="scale-100" />;\n',
  });
  expect(anchored.authority.effectiveFindings.map(({ message }) => message ?? "")).toEqual([
    expect.stringContaining("transform-utility census below the real-tree floor"),
  ]);
});

test("§4.6 differential — the converted CSS population is byte-identical to the legacy walk's set, and neither side is zero", ({ repoRoot }) => {
  // READ THE LEGACY SIDE FIRST (guide §6.4): both sides zero would be evidence of nothing. The LEGACY side
  // is re-derived here from the descriptor's own walk — `readdirSync(recursive)` over `packages/ui/src` and
  // `packages/client/src`, every `.css`, MINUS the generated theme — and compared with the set the declared
  // `authored-css` resource admits after the policy's own theme carve-out. This is the POPULATION third of
  // the differential; the FINDING third is the real-tree drive recorded in the conversion commit, and the
  // TOOL-ERROR third is the refusal pins above.
  const legacy = ["packages/ui/src", "packages/client/src"]
    .flatMap((root) =>
      existsSync(join(repoRoot, root))
        ? readdirSync(join(repoRoot, root), { recursive: true, encoding: "utf8" }).map((entry) => `${root}/${entry.replaceAll("\\", "/")}`)
        : [],
    )
    .filter((rel) => rel.endsWith(".css") && rel !== GENERATED_THEME_CSS)
    .toSorted((a, b) => a.localeCompare(b));

  const corpus = loadAuthoredCss(createResourceReader({ root: repoRoot }));
  expect(corpus.status).toBe("ready");
  const converted = (corpus.status === "ready" ? corpus.value : [])
    .map(({ path }) => path)
    .filter((path) => path !== GENERATED_THEME_CSS)
    .toSorted((a, b) => a.localeCompare(b));

  expect(legacy.length).toBeGreaterThan(0);
  expect(converted).toEqual(legacy);
});
