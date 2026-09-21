// The PERMANENT PIN for `no-blanket-suppression` (tooling/src/verify/gates/no-blanket-suppression.ts, #962):
// the arms conformance cannot reach. Arm A (the harness fileset) is proven by the gate's policy-proof
// rows; THIS proves arm B (the tracked non-TS corpus — a CSS, a JS and a JSON blanket each RED at its line, a
// path biome itself ignores skipped by derivation), arm C (THE INDEX — a stale STAGED blob carrying a blanket while
// the working file is clean is RED, the #954 shape, with its two control twins), the blindness tripwires (an
// populated root with no git tree refuses loudly instead of printing a clean zero), and the REAL TREE: every
// arm over the actual repo reports ZERO findings across a non-zero denominator — the post-migration receipt
// in test form, so it keeps proving. Every fixture is a throwaway git repo under the scratch fixture, never
// the real tree (`__g_` stays the gate harness's).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { CoordinatedGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyToolError } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { GatePolicyReceipt } from "../../../../tooling/src/verify/contract/policy-primitives.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-blanket-suppression.ts";
import { projectCtx } from "../../../../tooling/src/verify/index.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** A clean tracked TypeScript member keeps the fixture's governed population explicit. */
const FIXTURE_SOURCE_REL = "tooling/src/verify/gates/no-blanket-suppression.ts";
const CONFIG = '{ "files": { "includes": ["**", "!vendor"] } }\n';

interface Run {
  readonly findings: readonly CoordinatedGateFinding[];
  readonly receipts: readonly GatePolicyReceipt[];
  readonly toolErrors: readonly PolicyToolError[];
}

type ResourceReceipt = Extract<GatePolicyReceipt, { readonly kind: "resource" }>;

/** Drive the production policy over a root with an EMPTY harness fileset — arm A has nothing to walk,
 *  so every finding here comes from arm B or arm C. */
function runGate(root: string, suppliedProject?: Project): Run {
  const project = suppliedProject ?? new Project({ useInMemoryFileSystem: true });
  if (suppliedProject === undefined) {
    project.createSourceFile(join(root, "packages/kit/src/__harness_anchor.ts"), "export const anchor = true;\n");
  }
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  return {
    findings: result.authority.effectiveFindings,
    receipts: result.policies[0]?.receipts ?? [],
    toolErrors: result.toolErrors,
  };
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function git(root: string, args: readonly string[]): void {
  execFixtureGit(root, args);
}

/** A throwaway git repo carrying a governed source + strict-JSON biome.json + `files`, all COMMITTED. */
function plantRepo(root: string, files: Readonly<Record<string, string>>): void {
  plant(root, FIXTURE_SOURCE_REL, "export const gate = 1;\n");
  plant(root, "biome.json", CONFIG);
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  git(root, ["init", "-q"]);
  git(root, ["-c", "user.email=pin@example", "-c", "user.name=pin", "add", "-A"]);
  git(root, ["-c", "user.email=pin@example", "-c", "user.name=pin", "commit", "-q", "-m", "fixture"]);
}

const at = (run: Run): readonly string[] => run.findings.map((f) => `${f.file}:${String(f.line)} ${f.token ?? ""}`.trim());
const messages = (run: Run): string => [...run.findings.map((f) => f.message ?? ""), ...run.toolErrors.map((error) => error.message)].join("\n");

const CSS_BLANKET = "/* biome-ignore-all lint/suspicious/noDuplicateSelectorsKeyframeBlock: css blanket */\n.a { color: red; }\n";
const CSS_CLEAN = ".a { color: red; }\n/* biome-ignore lint/suspicious/noDuplicateSelectorsKeyframeBlock: one site */\n@keyframes k { from { top: 0 } }\n";
const JS_BLANKET = "export const a = 1;\n/* eslint-disable */\nexport const b = 2;\n";
const JSON_BLANKET = '// biome-ignore-all lint: json blanket\n{ "a": 1 }\n';

describe("no-blanket-suppression — arm B, the tracked non-TS corpus (planted controls both directions)", () => {
  test("a CSS, a JS and a JSON blanket are each RED at their own line, naming the directive", ({ scratch }) => {
    plantRepo(scratch, { "styles/a.css": CSS_BLANKET, "config/b.js": JS_BLANKET, "data/c.json": JSON_BLANKET });
    const run = runGate(scratch);
    expect(at(run)).toEqual(["config/b.js:2 eslint-disable", "data/c.json:1 biome-ignore-all", "styles/a.css:1 biome-ignore-all"]);
    expect(messages(run)).toContain("never closed");
  });

  test("the same corpus with bounded directives is silent — the control's other direction", ({ scratch }) => {
    plantRepo(scratch, {
      "styles/a.css": CSS_CLEAN,
      "config/b.js": "/* eslint-disable no-alert */\nexport const a = 1;\n/* eslint-enable no-alert */\nexport const b = 2;\n",
      "data/c.json": '{ "a": 1 }\n',
    });
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    // 3 fixtures + biome.json + the governed TypeScript member all came through the tracked resource.
    expect(run.receipts.find((receipt): receipt is ResourceReceipt => receipt.kind === "resource" && receipt.source === "tracked-files")).toMatchObject({
      resources: 5,
      unresolved: 0,
    });
  });

  test("a path biome itself ignores is skipped by DERIVATION and counted, never judged", ({ scratch }) => {
    plantRepo(scratch, { "vendor/x.css": CSS_BLANKET, "styles/a.css": CSS_CLEAN });
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.toolErrors).toEqual([]);
  });

  test("a CSS string value carrying a comment opener is not a comment (quote-aware lexer)", ({ scratch }) => {
    plantRepo(scratch, { "styles/a.css": '.a { content: "/* biome-ignore-all lint: inside a string */"; }\n' });
    expect(runGate(scratch).findings).toEqual([]);
  });
});

describe("no-blanket-suppression — arm C, THE INDEX (the #954 shape)", () => {
  test("a STAGED blob carrying a blanket while the working file is CLEAN is RED, and says so", ({ scratch }) => {
    plantRepo(scratch, { "styles/a.css": CSS_CLEAN });
    // Stage the blanket, then repair the working copy WITHOUT re-staging — exactly what a lane did in #954.
    plant(scratch, "styles/a.css", CSS_BLANKET);
    git(scratch, ["add", "styles/a.css"]);
    plant(scratch, "styles/a.css", CSS_CLEAN);
    const run = runGate(scratch);
    expect(at(run)).toEqual(["styles/a.css:1 biome-ignore-all"]);
    expect(messages(run)).toContain("STAGED");
    expect(messages(run)).toContain("WORKING TREE does not");
  });

  test("staged clean + working clean is silent; staged clean + working blanket is arm B's finding, not arm C's", ({ scratch }) => {
    plantRepo(scratch, { "styles/a.css": CSS_CLEAN });
    expect(runGate(scratch).findings).toEqual([]);
    plant(scratch, "styles/a.css", CSS_BLANKET);
    const run = runGate(scratch);
    expect(at(run)).toEqual(["styles/a.css:1 biome-ignore-all"]);
    expect(messages(run)).not.toContain("STAGED");
  });

  test("a blanket in BOTH the index and the working tree is reported ONCE (arm B), never doubled by arm C", ({ scratch }) => {
    plantRepo(scratch, { "styles/a.css": CSS_BLANKET });
    const run = runGate(scratch);
    expect(at(run)).toEqual(["styles/a.css:1 biome-ignore-all"]);
    expect(messages(run)).not.toContain("STAGED");
  });

  test("a staged TS blob is judged by the same reader (arm C reads what arm A would have)", ({ scratch }) => {
    plantRepo(scratch, { "packages/kit/src/x.ts": "export const a = 1;\n" });
    plant(scratch, "packages/kit/src/x.ts", "// biome-ignore-all lint/suspicious/noBitwiseOperators: staged blanket\nexport const a = 1 | 2;\n");
    git(scratch, ["add", "packages/kit/src/x.ts"]);
    plant(scratch, "packages/kit/src/x.ts", "export const a = 1;\n");
    const run = runGate(scratch);
    expect(at(run)).toEqual(["packages/kit/src/x.ts:1 biome-ignore-all"]);
    expect(messages(run)).toContain("STAGED");
  });
});

describe("no-blanket-suppression — a bare zero must be 'I could not measure', never 'clean'", () => {
  test("a populated root with NO git tree refuses loudly on both git-backed arms", ({ scratch }) => {
    plant(scratch, FIXTURE_SOURCE_REL, "export const gate = 1;\n");
    plant(scratch, "biome.json", CONFIG);
    plant(scratch, "styles/a.css", CSS_BLANKET);
    const run = runGate(scratch);
    expect(messages(run)).toContain("git index could not resolve");
    expect(run.toolErrors).toHaveLength(1);
  });

  test("a populated root whose biome.json is missing or unparseable refuses instead of deriving an empty ignore set", ({ scratch }) => {
    plant(scratch, FIXTURE_SOURCE_REL, "export const gate = 1;\n");
    expect(messages(runGate(scratch))).toContain("resource declaration json:biome is missing");
    plant(scratch, "biome.json", '{\n  // strict JSON rejects this\n  "files": {}\n}\n');
    expect(messages(runGate(scratch))).toContain("did not parse as strict JSON");
  });

  test("a root without the former gate-file anchor still refuses when its Git resource is unavailable", ({ scratch }) => {
    plant(scratch, "biome.json", CONFIG);
    plant(scratch, "styles/a.css", CSS_BLANKET);
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(messages(run)).toContain("git index could not resolve");
  });
});

describe("no-blanket-suppression — the REAL tree", () => {
  // The harness project is the real cost here (~20s): arm A needs the actual fileset, and a receipt over an
  // empty fileset would be the zero-scan placebo this gate exists to refuse.
  test("every arm over the actual repo: ZERO findings, non-zero denominators on both sides", { timeout: scaledBudget(180_000) }, ({ repoRoot }) => {
    const run = runGate(repoRoot, projectCtx(repoRoot).project);
    expect(run.toolErrors).toEqual([]);
    expect(run.findings).toEqual([]);
    expect(
      run.receipts.find((receipt): receipt is ResourceReceipt => receipt.kind === "resource" && receipt.source === "tracked-files")?.resources ?? 0,
    ).toBeGreaterThan(1000);
    expect(
      run.receipts.find((receipt): receipt is ResourceReceipt => receipt.kind === "resource" && receipt.source.startsWith("authored-text"))?.resources ?? 0,
    ).toBeGreaterThan(20);
  });
});
