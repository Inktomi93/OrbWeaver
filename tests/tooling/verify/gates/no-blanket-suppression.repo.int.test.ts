// The PERMANENT PIN for `no-blanket-suppression` (tooling/src/verify/gates/no-blanket-suppression.ts, #962):
// the arms conformance cannot reach. Arm A (the harness fileset) is proven by the gate's own mustFlag/mustPass
// rows; THIS proves arm B (the tracked non-TS corpus — a CSS, a JS and a JSON blanket each RED at its line, a
// path biome itself ignores skipped by derivation), arm C (THE INDEX — a stale STAGED blob carrying a blanket while
// the working file is clean is RED, the #954 shape, with its two control twins), the blindness tripwires (an
// anchored root with no git tree refuses loudly instead of printing a clean zero), and the REAL TREE: every
// arm over the actual repo reports ZERO findings across a non-zero denominator — the post-migration receipt
// in test form, so it keeps proving. Every fixture is a throwaway git repo under the scratch fixture, never
// the real tree (`__g_` stays the gate harness's).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-blanket-suppression.ts";
import { projectCtx, runPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** The gate's own module — its §4.5 real-tree anchor; planting it is how a fixture opts IN to arms B + C. */
const GATE_SELF_REL = "tooling/src/verify/gates/no-blanket-suppression.ts";
const CONFIG = '{ "files": { "includes": ["**", "!vendor"] } }\n';

interface Run {
  readonly findings: readonly Finding[];
  readonly declarations: readonly GateScanDeclaration[];
}

/** Drive the REAL descriptor's `run` over a root with an EMPTY harness fileset — arm A has nothing to walk,
 *  so every finding here comes from arm B or arm C. */
function runGate(root: string): Run {
  const project = new Project({ useInMemoryFileSystem: true });
  const findings: Finding[] = [];
  const declarations: GateScanDeclaration[] = [];
  const ctx: GateRunCtx = {
    root,
    project,
    scope: { kind: "project" },
    files: [],
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: (counts) => {
      declarations.push(counts);
    },
  };
  gate.run?.(ctx);
  return { findings, declarations };
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function git(root: string, args: readonly string[]): void {
  execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
}

/** A throwaway git repo carrying the anchor + a strict-JSON biome.json + `files`, all COMMITTED. */
function plantRepo(root: string, files: Readonly<Record<string, string>>): void {
  plant(root, GATE_SELF_REL, "export const gate = 1;\n");
  plant(root, "biome.json", CONFIG);
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  git(root, ["init", "-q"]);
  git(root, ["-c", "user.email=pin@example", "-c", "user.name=pin", "add", "-A"]);
  git(root, ["-c", "user.email=pin@example", "-c", "user.name=pin", "commit", "-q", "-m", "fixture"]);
}

const at = (run: Run): readonly string[] => run.findings.map((f) => `${f.file}:${String(f.line)} ${f.token ?? ""}`.trim());
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

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
    // 3 fixtures + biome.json + the anchor module (arm B judges everything the empty harness did not walk) + 1 index candidate (b.js).
    expect(run.declarations[0]?.scanned).toBe(6);
  });

  test("a path biome itself ignores is skipped by DERIVATION and counted, never judged", ({ scratch }) => {
    plantRepo(scratch, { "vendor/x.css": CSS_BLANKET, "styles/a.css": CSS_CLEAN });
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.declarations[0]?.skipped?.["biome-ignored"]).toBe(1);
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
  test("an anchored root with NO git tree refuses loudly on both git-backed arms", ({ scratch }) => {
    plant(scratch, GATE_SELF_REL, "export const gate = 1;\n");
    plant(scratch, "biome.json", CONFIG);
    plant(scratch, "styles/a.css", CSS_BLANKET);
    const run = runGate(scratch);
    expect(messages(run)).toContain("came back EMPTY");
    expect(messages(run)).toContain("could not read the index");
  });

  test("an anchored root whose biome.json is missing or unparseable refuses instead of deriving an empty ignore set", ({ scratch }) => {
    plant(scratch, GATE_SELF_REL, "export const gate = 1;\n");
    expect(messages(runGate(scratch))).toContain("not at the repo root");
    plant(scratch, "biome.json", '{\n  // strict JSON rejects this\n  "files": {}\n}\n');
    expect(messages(runGate(scratch))).toContain("did not parse as STRICT JSON");
  });

  test("an UNANCHORED root (a conformance-shaped mini-project) judges nothing beyond arm A — the declared limit", ({ scratch }) => {
    plant(scratch, "biome.json", CONFIG);
    plant(scratch, "styles/a.css", CSS_BLANKET);
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.declarations).toEqual([]);
  });
});

describe("no-blanket-suppression — the REAL tree", () => {
  // The harness project is the real cost here (~20s): arm A needs the actual fileset, and a receipt over an
  // empty fileset would be the zero-scan placebo this gate exists to refuse.
  test("every arm over the actual repo: ZERO findings, non-zero denominators on both sides", { timeout: scaledBudget(180_000) }, ({ repoRoot }) => {
    const pass = runPass([gate], projectCtx(repoRoot));
    expect(pass.toolErrors).toEqual([]);
    const result = pass.gates[0];
    expect(result?.findings).toEqual([]);
    // Arm A's denominator is the walk; arms B + C declare their own units on top of it.
    expect(result?.scan.scanned ?? 0).toBeGreaterThan(1000);
    expect(result?.scan.declared?.scanned ?? 0).toBeGreaterThan(20);
  });
});
