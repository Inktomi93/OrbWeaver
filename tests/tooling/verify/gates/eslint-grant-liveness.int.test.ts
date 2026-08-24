// The PERMANENT PIN for the `eslint-grant-liveness` gate (tooling/src/verify/gates/eslint-grant-liveness.ts):
// a file-exact path in an `eslint.config.js` block's `files`/`ignores` whose file is GONE must be RED. It
// used to be invisible — no gate read the lint config's per-file grants, so a deleted or moved subject left
// its rule posture standing forever and the next file created at that path silently inherited it.
// Conformance proves the matcher against synthetic mini-projects; THIS proves the promise against the REAL
// eslint.config.js and against planted controls in BOTH directions, so the lie cannot be reintroduced.
//
// The load-bearing arm here is CODE-SHAPE COVERAGE. eslint.config.js is JS: only 6 of its 84 derived values
// are bare string literals, the rest arrive through named consts, const ARRAYS and spreads. A reader that
// saw only StringLiterals would have found almost nothing and printed a clean zero — so the real-tree test
// asserts the DENOMINATOR, not just the verdict, and the planted controls exercise each hiding shape.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = "eslint.config.js";
/** Mirrors the gate's own anchor (`REAL_CONFIG_MIN_CANDIDATES`) — the size at which its blindness arm comes
 *  alive. Restated rather than imported: the test is the SECOND opinion, not a re-import of the subject. */
const ANCHOR = 40;

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

function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"packages/p${i}/**"`).join(", ");
}

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((f) => f.token);
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

describe("eslint-grant-liveness — the DEAD-GRANT control, both directions", () => {
  test("a file-exact grant whose file is GONE is RED, and names the dead path", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'export default [{ ignores: ["packages/ui/src/gone.ts"] }];\n');
    expect(tokens(runGate(scratch))).toEqual(["packages/ui/src/gone.ts"]);
  });

  test("the SAME config with the file present is silent — the control's other direction", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'export default [{ ignores: ["packages/ui/src/gone.ts"] }];\n');
    plant(scratch, "packages/ui/src/gone.ts", "export const x = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("glob rows are declared skips, never resolved as paths", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'export default [{ files: ["packages/**/*.{ts,tsx}", "**/__g_*", "tests/**/*.ct.tsx"] }];\n');
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.declarations[0]?.skipped?.["glob"]).toBe(3);
    expect(run.declarations[0]?.scanned).toBe(0);
  });
});

describe("eslint-grant-liveness — the CODE shapes a StringLiteral-only reader would miss", () => {
  test("a dead row behind a named CONST is still found", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'const DEAD = "packages/ui/src/gone.ts";\nexport default [{ ignores: [DEAD] }];\n');
    expect(tokens(runGate(scratch))).toEqual(["packages/ui/src/gone.ts"]);
  });

  test("a dead row inside a SPREAD of a const array is still found", ({ scratch }) => {
    plant(scratch, CONFIG_REL, 'const A = ["packages/ui/src/gone.ts"];\nconst B = [...A, "packages/ui/**"];\nexport default [{ ignores: B }];\n');
    expect(tokens(runGate(scratch))).toEqual(["packages/ui/src/gone.ts"]);
  });

  test("a const used TWICE resolves both times — the cycle fence must not eat a repeat use", ({ scratch }) => {
    // The measured regression this pins: an accumulate-only visited-set refused every use of a const after
    // the first, which on the REAL depcruise config turned 8 live rows into false REDs over import law.
    plant(scratch, CONFIG_REL, 'const P = "packages/ui/src/";\nexport default [{ ignores: [`${P}gone.ts`, `${P}alsogone.ts`] }];\n');
    expect(tokens(runGate(scratch))).toEqual(["packages/ui/src/gone.ts", "packages/ui/src/alsogone.ts"]);
  });
});

describe("eslint-grant-liveness — a bare zero must be 'I could not measure', never 'clean'", () => {
  test("an ABSENT eslint.config.js REFUSES LOUDLY (the §4.6 blindness tripwire)", ({ scratch }) => {
    const run = runGate(scratch);
    expect(messages(run)).toContain("not at the repo root");
    expect(run.declarations[0]?.scanned).toBe(0);
  });

  test("an UNPARSEABLE eslint.config.js FAILS LOUD — no silent default-fallback", ({ scratch }) => {
    plant(scratch, CONFIG_REL, "export default [{ files: [ ;;; (((( }];\n");
    expect(messages(runGate(scratch))).toContain("did not parse");
  });

  test("an UNREADABLE shape (a call) REFUSES LOUDLY rather than being silently skipped", ({ scratch }) => {
    plant(scratch, CONFIG_REL, "export default [{ files: [resolvePaths()] }];\n");
    const run = runGate(scratch);
    expect(messages(run)).toContain("CANNOT statically read");
    expect(tokens(run)).toEqual(["CallExpression"]);
  });

  test("an anchor-sized value set deriving ZERO exact rows REDs — the classifier-rot tripwire", ({ scratch }) => {
    plant(scratch, CONFIG_REL, `export default [{ files: [${globFiller(ANCHOR)}] }];\n`);
    expect(messages(runGate(scratch))).toContain("ZERO file-exact grant rows");
  });
});

describe("eslint-grant-liveness — the REAL tree", () => {
  test("the real eslint.config.js parses, reads a substantial value set, and carries NO dead grant", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    const declared = run.declarations[0];
    expect(declared?.unit).toBe("grant row");
    // THE DENOMINATOR IS THE RECEIPT: most values hide behind consts/spreads, so a low candidate count
    // would mean the reader went blind even though the verdict looks green.
    expect(declared?.candidates ?? 0).toBeGreaterThanOrEqual(ANCHOR);
    expect(declared?.scanned ?? 0).toBeGreaterThan(0);
    expect(run.findings).toEqual([]);
  });
});
