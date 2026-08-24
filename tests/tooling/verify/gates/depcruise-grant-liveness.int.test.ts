// The PERMANENT PIN for the `depcruise-grant-liveness` gate
// (tooling/src/verify/gates/depcruise-grant-liveness.ts): a file-exact `path`/`pathNot` in
// `.dependency-cruiser.cjs` whose file is GONE must be RED. It used to be invisible — no gate read the
// import-law config, so a deleted or moved subject left its boundary exemption standing forever.
// Conformance proves the matcher against synthetic mini-projects; THIS proves the promise against the REAL
// config and against planted controls in BOTH directions.
//
// TWO load-bearing arms beyond the dead-row control. (1) CODE-SHAPE COVERAGE: 112 of the config's 181
// derived values are TEMPLATE literals built from consts, so a StringLiteral-only reader would see almost
// nothing — the real-tree test asserts the DENOMINATOR, not just the verdict. (2) THE CONSERVATIVE
// DIRECTION: these lists are load-bearing import law and a false RED blocks every lane's floor, so the
// classifier must treat every ambiguous pattern (prefix, alternation, class, suffix-only) as a SKIP. Both
// directions are planted here.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { classifyRegex, gate } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
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
/** A const prefix + ONE template-built row — the config corpus's dominant shape (112 of 181 values). */
const UI_CONST = `const UI = "^packages/ui/src/";\n`;
const TEMPLATE_ONE_ROW = `${UI_CONST}module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: \`\${UI}gone\\.ts$\` } }] };\n`;
/** The SAME const consumed TWICE — the shape an accumulate-only cycle fence silently refused. */
const TEMPLATE_TWO_ROWS = `${UI_CONST}module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: [\`\${UI}a\\.ts$\`, \`\${UI}b\\.ts$\`] } }] };\n`;

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((f) => f.token);
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

describe("depcruise-grant-liveness — the DEAD-ROW control, both directions", () => {
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
    expect(messages(run)).not.toContain("CANNOT statically read");
  });
});

describe("depcruise-grant-liveness — the CONSERVATIVE direction (import law must never false-RED)", () => {
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

describe("depcruise-grant-liveness — a bare zero must be 'I could not measure', never 'clean'", () => {
  test("an ABSENT .dependency-cruiser.cjs REFUSES LOUDLY (the §4.6 blindness tripwire)", ({ scratch }) => {
    const run = runGate(scratch);
    expect(messages(run)).toContain("not at the repo root");
    expect(run.declarations[0]?.scanned).toBe(0);
  });

  test("an UNPARSEABLE config FAILS LOUD — a silent default would leave the package cake unguarded", ({ scratch }) => {
    plant(scratch, CONFIG_REL, "module.exports = { forbidden: [ ;;; (((( };\n");
    expect(messages(runGate(scratch))).toContain("did not parse");
  });

  test("an UNREADABLE shape (a call) REFUSES LOUDLY rather than being silently skipped", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'module.exports = { forbidden: [{ name: "r", from: { path: buildPath() }, to: {} }] };\n');
    const run = runGate(scratch);
    expect(messages(run)).toContain("CANNOT statically read");
    expect(tokens(run)).toEqual(["CallExpression"]);
  });

  test("an anchor-sized value set deriving ZERO exact rows REDs — the classifier-rot tripwire", ({ scratch }) => {
    plant(scratch, CONFIG_REL, `module.exports = { forbidden: [{ name: "r", from: { path: [${prefixFiller(ANCHOR)}] }, to: {} }] };\n`);
    expect(messages(runGate(scratch))).toContain("ZERO file-exact rows");
  });
});

describe("depcruise-grant-liveness — the REAL tree", () => {
  test("the real config parses, reads a substantial value set, and carries NO dead import-law row", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    const declared = run.declarations[0];
    expect(declared?.unit).toBe("grant row");
    // THE DENOMINATOR IS THE RECEIPT: 112 of the values are template literals, so a low candidate count
    // would mean the reader went blind even though the verdict looks green.
    expect(declared?.candidates ?? 0).toBeGreaterThanOrEqual(ANCHOR);
    expect(declared?.scanned ?? 0).toBeGreaterThan(0);
    expect(run.findings).toEqual([]);
  });
});
