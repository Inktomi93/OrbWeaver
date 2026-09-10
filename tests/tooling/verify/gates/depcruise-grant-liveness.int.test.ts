// The PERMANENT PIN for the `depcruise-grant-liveness` gate
// (tooling/src/verify/gates/depcruise-grant-liveness.ts): a file-exact `path`/`pathNot` in
// `.dependency-cruiser.cjs` whose file is GONE must be RED. It used to be invisible — no gate read the
// import-law config, so a deleted or moved subject left its boundary exemption standing forever.
// Conformance proves the matcher against synthetic mini-projects; THIS proves the promise against the REAL
// config and against planted controls in BOTH directions.
//
// TWO load-bearing arms beyond the dead-row control. (1) CODE-SHAPE COVERAGE: imported, called, spread and
// template-derived values are observed through dependency-cruiser's native executable-config loader, so
// the real-tree test asserts the DENOMINATOR, not just the verdict. (2) THE CONSERVATIVE
// DIRECTION: these lists are load-bearing import law and a false RED blocks every lane's floor, so the
// classifier must treat every ambiguous pattern (prefix, alternation, class, suffix-only) as a SKIP. Both
// directions are planted here.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { classifyRegex, gate } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { irreducibleBudgetFindings } from "../../../../tooling/src/verify/lib/grant-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
/** Mirrors the gate's own anchor (`REAL_CONFIG_MIN_CANDIDATES`). Restated, not imported — second opinion. */
const ANCHOR = 80;

interface Run {
  readonly findings: readonly Finding[];
  readonly declarations: readonly GateScanDeclaration[];
}

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

function rule(body: string): string {
  return `module.exports = { forbidden: [{ name: "r", from: {}, to: { ${body} } }] };\n`;
}

function prefixFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"^packages/p${i}/"`).join(", ");
}

// The planted configs below are SOURCE TEXT for a generated .cjs, so every backtick/`${`/backslash is
// escaped once for THIS file and read back by the generated file's own parser: `\${UI}` emits a literal
// `${UI}` template span, and `\\.` emits the regex escape `\.` that the generated template then resolves.
/** A const prefix + ONE template-built row — a common executable-config shape. */
const UI_CONST = `const UI = "^packages/ui/src/";\n`;
const TEMPLATE_ONE_ROW = `${UI_CONST}module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: \`\${UI}gone\\.ts$\` } }] };\n`;
/** The SAME const consumed TWICE — the shape an accumulate-only cycle fence silently refused. */
const TEMPLATE_TWO_ROWS = `${UI_CONST}module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: [\`\${UI}a\\.ts$\`, \`\${UI}b\\.ts$\`] } }] };\n`;

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((f) => f.token);
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

describe("depcruise-grant-liveness — the DEAD-ROW control, both directions", { tags: "slow" }, () => {
  test("a file-exact `pathNot` exemption whose file is GONE is RED, and names the dead path", ({ scratch }) => {
    plant(scratch, CONFIG_REL, rule(String.raw`pathNot: "^packages/ui/src/gone\.ts$"`));
    expect(tokens(runGate(scratch))).toEqual(["packages/ui/src/gone.ts"]);
  });

  test("the SAME config with the file present is silent — the control's other direction", ({ scratch }) => {
    plant(scratch, CONFIG_REL, rule(String.raw`pathNot: "^packages/ui/src/gone\.ts$"`));
    plant(scratch, "packages/ui/src/gone.ts", "export const x = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("a dead row behind a TEMPLATE literal built from a const is still found (the corpus's dominant shape)", ({ scratch }) => {
    plant(scratch, CONFIG_REL, TEMPLATE_ONE_ROW);
    expect(tokens(runGate(scratch))).toEqual(["packages/ui/src/gone.ts"]);
  });

  test("a const used TWICE resolves both times — the false-RED regression this gate nearly shipped", ({ scratch }) => {
    // MEASURED: an accumulate-only visited-set refused every use of a const after the first, which on the
    // REAL config turned 8 live import-law rows into false REDs. The fence backtracks now; this pins it.
    plant(scratch, CONFIG_REL, TEMPLATE_TWO_ROWS);
    const run = runGate(scratch);
    expect(tokens(run)).toEqual(["packages/ui/src/a.ts", "packages/ui/src/b.ts"]);
    expect(messages(run)).not.toContain("native config snapshot was unreadable");
  });
});

describe("depcruise-grant-liveness — the CONSERVATIVE direction (import law must never false-RED)", { tags: "slow" }, () => {
  test("every ambiguous pattern class is a SKIP, not a path — unit-level, on the real classifier", () => {
    for (const pattern of [
      "^packages/server/",
      "^packages/ui/src/(a|b)/",
      "^packages/client/src/features/[^/]+/.+$",
      "node_modules/(echarts|cmdk)/",
      String.raw`\.(test|spec)\.tsx?$`,
      "^packages/ui/src/live.ts",
    ]) {
      expect(classifyRegex(pattern)).toBeUndefined();
    }
    // ...and the one shape that IS a file resolves, unescaped.
    expect(classifyRegex(String.raw`^packages/ui/src/live\.ts$`)).toBe("packages/ui/src/live.ts");
  });

  test("a config of only ambiguous patterns produces ZERO findings (under the anchor)", ({ scratch }) => {
    plant(scratch, CONFIG_REL, rule(String.raw`pathNot: ["^packages/server/", "^packages/ui/src/(a|b)/", "\.test\.ts$"]`));
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.declarations[0]?.skipped?.["pattern"]).toBe(3);
  });
});

describe("depcruise-grant-liveness — a bare zero must be 'I could not measure', never 'clean'", { tags: "slow" }, () => {
  test("an ABSENT .dependency-cruiser.cjs REFUSES LOUDLY (the §4.6 blindness tripwire)", ({ scratch }) => {
    const run = runGate(scratch);
    expect(messages(run)).toContain("not at the repo root");
    expect(run.declarations[0]?.scanned).toBe(0);
  });

  test("an UNPARSEABLE config FAILS LOUD — a silent default would leave the package cake unguarded", ({ scratch }) => {
    plant(scratch, CONFIG_REL, "module.exports = { forbidden: [ ;;; (((( };\n");
    expect(messages(runGate(scratch))).toContain("did not load through dependency-cruiser's public config API");
  });

  test("a config call that throws REFUSES LOUDLY rather than being silently skipped", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'module.exports = { forbidden: [{ name: "r", from: { path: buildPath() }, to: {} }] };\n');
    const run = runGate(scratch);
    expect(messages(run)).toContain("native config snapshot was unreadable");
    expect(tokens(run)).toEqual([undefined]);
  });

  test("an anchor-sized value set deriving ZERO exact rows REDs — the classifier-rot tripwire", ({ scratch }) => {
    plant(scratch, CONFIG_REL, `module.exports = { forbidden: [{ name: "r", from: { path: [${prefixFiller(ANCHOR)}] }, to: {} }] };\n`);
    expect(messages(runGate(scratch))).toContain("ZERO file-exact rows");
  });
});

describe("depcruise-grant-liveness — the REAL tree", { tags: "slow" }, () => {
  test("the real config parses, reads a substantial value set, and carries NO dead import-law row", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    const declared = run.declarations[0];
    expect(declared?.unit).toBe("grant row");
    // THE DENOMINATOR IS THE RECEIPT: a low candidate count would mean the reader went blind even though
    // the verdict looks green.
    expect(declared?.candidates ?? 0).toBeGreaterThanOrEqual(ANCHOR);
    expect(declared?.scanned ?? 0).toBeGreaterThan(0);
    expect(run.findings).toEqual([]);
  });
});

// ── #973: the PATTERN half. A pattern grant is LIVE only while some TRACKED file or DECLARED dependency is
// still inside it. These arms need a real git work tree (the corpus is `git ls-files`, deliberately not an
// FS walk), so each plants a throwaway repo — which is also why conformance cannot drive them: its
// mini-projects are under the real-config anchor and have no work tree at all.

/** A throwaway git repo at `root` with `files` committed — the corpus these arms judge against. */
/** The gate's own module — its §4.5 real-tree anchor for the pattern half. */
const GATE_SELF_REL = "tooling/src/verify/gates/depcruise-grant-liveness.ts";

function plantRepo(root: string, files: Readonly<Record<string, string>>): void {
  // Plant the gate's OWN module: the pattern half is scoped to a root that carries it (the §4.5 real-tree
  // anchor shape), so a fixture opts IN by planting the anchor and the file-exact fixtures stay untouched.
  plant(root, GATE_SELF_REL, "export const gate = 1;\n");

  // The RATIFIED rows' cites must resolve in the planted root too — the DEAD-CITE arm is two-sided and
  // (correctly) reds a promise whose evidence is gone.
  for (const cite of RATIFIED_CITES) {
    plant(root, cite, "cite\n");
  }
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

/** An anchor-sized config: `patterns` under test plus prefix filler that clears REAL_CONFIG_MIN_CANDIDATES
 *  (below it the gate judges the file-exact half only, exactly as in a conformance mini-project). */
function patternConfig(patterns: readonly string[]): string {
  // The filler must be PATTERN-shaped (a fully-anchored literal would be judged by the file-exact half and
  // red as a dead file) AND live (or it would red as a dead pattern) — so each is an alternation that the
  // planted KIT_FILE satisfies.
  const filler = Array.from({ length: ANCHOR }, (_, i) => `^packages/kit/src/(f${String(i)}|live)\\.ts$`);
  // Plus ONE live FILE-EXACT row: an anchor-sized set that derives zero exact rows is the classifier-rot
  // tripwire, which would drown the pattern arm under test.
  const all = [...patterns, ...RATIFIED_KEYS, ...filler, String.raw`^${KIT_FILE}$`.replace(".ts", "\\.ts")]
    .map((pattern) => JSON.stringify(pattern))
    .join(", ");
  return `module.exports = { forbidden: [{ name: "r", from: { path: [${all}] }, to: {} }] };\n`;
}

/** The gate's RATIFIED keys, restated (the test is the SECOND opinion, not a re-import). A planted config
 *  must carry them or the two-sided STALE arm correctly reds every fixture. */
const RATIFIED_KEYS = [String.raw`(^|/)__g_`, String.raw`^packages/[^/]+/dist/`, String.raw`^@jitl/quickjs-ng-wasmfile-release-sync/wasm\?url$`];
/** The RATIFIED rows' cites, restated — the DEAD-CITE arm reds when one stops resolving. */
const RATIFIED_CITES = ["tooling/src/verify/gates/GATE-AUTHORING.md", ".gitignore", "packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts"];
const KIT_FILE = "packages/kit/src/live.ts";
const KIT_SOURCE = "export const live = 1;\n";

describe("depcruise-grant-liveness — PATTERN liveness (#973)", { tags: "slow" }, () => {
  test("a PATTERN whose class has no tracked member is RED, and names the pattern", ({ scratch }) => {
    plantRepo(scratch, { [CONFIG_REL]: patternConfig(["^packages/nonexistent-tier/"]), [KIT_FILE]: KIT_SOURCE });
    const run = runGate(scratch);
    expect(tokens(run)).toContain("^packages/nonexistent-tier/");
    expect(messages(run)).toContain("matches NOTHING this repo carries");
  });

  test("a LIVE multi-member pattern is accepted — the control's other direction", ({ scratch }) => {
    plantRepo(scratch, { [CONFIG_REL]: patternConfig(["^packages/kit/src/"]), [KIT_FILE]: KIT_SOURCE });
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("a DEPENDENCY pattern lives on the declared dependency set, not on repo paths", ({ scratch }) => {
    // dep-cruiser matches MODULE paths: `node_modules/echarts/` is live exactly while some package.json
    // still declares echarts. Judging it against repo paths alone would call every vendor seal dead.
    plantRepo(scratch, {
      [CONFIG_REL]: patternConfig(["node_modules/echarts/"]),
      [KIT_FILE]: KIT_SOURCE,
      "package.json": '{ "name": "p", "dependencies": { "echarts": "1.0.0" } }\n',
    });
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("the SAME dependency pattern reds once the dependency is undeclared", ({ scratch }) => {
    plantRepo(scratch, {
      [CONFIG_REL]: patternConfig(["node_modules/echarts/"]),
      [KIT_FILE]: KIT_SOURCE,
      "package.json": '{ "name": "p", "dependencies": {} }\n',
    });
    expect(tokens(runGate(scratch))).toContain("node_modules/echarts/");
  });

  test("a `$1` BACKREFERENCE is never judged — its member set is bound at cruise time, not by the tree", ({ scratch }) => {
    // dep-cruiser binds `$1` from the paired rule's capture, so the pattern denotes a different set per
    // matched file and no static reader can test it. It must not be accused of being dead.
    plantRepo(scratch, { [CONFIG_REL]: patternConfig([String.raw`^packages/server/src/domain/$1/`]), [KIT_FILE]: KIT_SOURCE });
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("the irreducible BUDGET is two-sided — growth AND an uncommitted shrink both RED", () => {
    // The budget is what stops that unjudgeable population from growing silently; a bare counter would
    // not. Driven directly because the arm is guarded by a real-tree anchor no planted root carries.
    const message = "actual {actual} budget {budget}";
    expect(irreducibleBudgetFindings(CONFIG_REL, 15, 15, message)).toEqual([]);
    expect(irreducibleBudgetFindings(CONFIG_REL, 16, 15, message)[0]?.message).toBe("actual 16 budget 15");
    expect(irreducibleBudgetFindings(CONFIG_REL, 14, 15, message)[0]?.message).toBe("actual 14 budget 15");
  });

  test("an EMPTY corpus refuses loudly rather than calling every pattern dead", ({ scratch }) => {
    // No `git init` — `git ls-files` cannot answer, so the pattern verdicts would all be vacuous.
    plant(scratch, CONFIG_REL, patternConfig(["^packages/kit/src/"]));
    plant(scratch, GATE_SELF_REL, "export const gate = 1;\n");
    expect(messages(runGate(scratch))).toContain("came back EMPTY");
  });
});
