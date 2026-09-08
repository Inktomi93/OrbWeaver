// The PERMANENT PIN for the `runner-config-path-liveness` gate
// (tooling/src/verify/gates/runner-config-path-liveness.ts): a FILE-EXACT path in a test-runner config's
// file-SELECTION lists whose file is GONE must be RED. It used to be invisible — no gate read the runner
// configs, and no RUNNER complains either (vitest silently drops a non-matching include/exclude entry), so
// `tests/tooling/ast-observability.int.test.ts`'s rename left its SERIAL_INT row matching NOTHING for
// months and the repo's heaviest file (17.6 min) ran in the PARALLEL lane (#1018 / #1012).
//
// Conformance proves the matcher against synthetic mini-projects; THIS proves the promise against the REAL
// configs and against planted controls in BOTH directions, so the lie cannot be reintroduced. The
// load-bearing arm is EXECUTED CONFIG COVERAGE: named arrays and kind globs are derived through imports,
// calls and spreads, so the gate drives Vitest's public native loader through config-snapshot and asserts
// the resulting denominator rather than teaching a partial AST interpreter more syntax.
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/runner-config-path-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const VITEST_REL = "vitest.config.ts";
const E2E_REL = "playwright.config.ts";
const CT_REL = "playwright-ct.config.ts";
const E2E_SOURCE = 'export default { testDir: "tests/e2e", testMatch: "**/*.spec.ts" };\n';
const CT_SOURCE = 'export default { testDir: "tests", testMatch: "**/*.ct.tsx" };\n';
const LIVE_REL = "tests/tooling/live.int.test.ts";
const DEAD_REL = "tests/tooling/gone.int.test.ts";
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

/** Every arm needs all three configs present — the gate is keyed on their EXACT filenames, so an absent one
 *  is (correctly) the blindness arm and would drown the row under test. */
function plantConfigs(root: string, vitest: string): void {
  plant(root, VITEST_REL, vitest);
  plant(root, E2E_REL, E2E_SOURCE);
  plant(root, CT_REL, CT_SOURCE);
  plant(root, "tests/e2e/keep.spec.ts", "export const keep = 1;\n");
}

function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"tests/p${i}/**"`).join(", ");
}

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((f) => f.token);
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

describe("runner-config-path-liveness — the DEAD-ROW control, both directions", () => {
  test("a file-exact runner row whose file is GONE is RED, and names the dead path", ({ scratch }) => {
    plantConfigs(scratch, `export default { test: { projects: [{ test: { include: ["${DEAD_REL}"] } }] } };\n`);
    expect(tokens(runGate(scratch))).toEqual([DEAD_REL]);
  });

  test("the SAME config with the file present is silent — the control's other direction", ({ scratch }) => {
    plantConfigs(scratch, `export default { test: { projects: [{ test: { include: ["${DEAD_REL}"] } }] } };\n`);
    plant(scratch, DEAD_REL, "export const x = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("glob rows are declared skips, never resolved as paths", ({ scratch }) => {
    plantConfigs(scratch, 'export default { test: { exclude: ["tests/**/*.int.test.ts", "**/__g_*", "tests/**/*.{int,contract}.test.ts"] } };\n');
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    // The two planted playwright `testDir` values are the only exact rows in this arm.
    expect(run.declarations[0]?.skipped?.["glob"]).toBeGreaterThanOrEqual(3);
  });
});

describe("runner-config-path-liveness — exact selectors stay inside the repository", () => {
  test("an existing ../outside.test.ts cannot satisfy liveness", ({ scratch }) => {
    const outside = join(dirname(scratch), `${basename(scratch)}-outside.test.ts`);
    const selector = relative(scratch, outside);
    writeFileSync(outside, "export const outside = 1;\n");
    try {
      plantConfigs(scratch, `export default { test: { projects: [{ test: { include: [${JSON.stringify(selector)}] } }] } };\n`);
      const run = runGate(scratch);
      expect(tokens(run)).toContain(selector);
      expect(messages(run)).toContain("resolves outside the repository root");
    } finally {
      rmSync(outside, { force: true });
    }
  });

  test("a missing ../outside.test.ts is a containment finding, not an ordinary dead in-repo row", ({ scratch }) => {
    const selector = `../${basename(scratch)}-missing.test.ts`;
    plantConfigs(scratch, `export default { test: { projects: [{ test: { include: [${JSON.stringify(selector)}] } }] } };\n`);
    const run = runGate(scratch);
    expect(tokens(run)).toContain(selector);
    expect(messages(run)).toContain("resolves outside the repository root");
  });

  test("an in-repo selector containing .. normalizes to its live target", ({ scratch }) => {
    const selector = "tests/tooling/../tooling/live.int.test.ts";
    plantConfigs(scratch, `export default { test: { projects: [{ test: { include: [${JSON.stringify(selector)}] } }] } };\n`);
    plant(scratch, LIVE_REL, "export const live = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("an absolute selector resolving inside the repository stays valid", ({ scratch }) => {
    const selector = join(scratch, LIVE_REL);
    plantConfigs(scratch, `export default { test: { projects: [{ test: { include: [${JSON.stringify(selector)}] } }] } };\n`);
    plant(scratch, LIVE_REL, "export const live = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("an in-repo symlink cannot make an outside target satisfy liveness", ({ scratch }) => {
    const outside = join(dirname(scratch), `${basename(scratch)}-symlink-target.test.ts`);
    const selector = "tests/tooling/linked.int.test.ts";
    writeFileSync(outside, "export const outside = 1;\n");
    mkdirSync(join(scratch, "tests/tooling"), { recursive: true });
    symlinkSync(outside, join(scratch, selector));
    try {
      plantConfigs(scratch, `export default { test: { projects: [{ test: { include: [${JSON.stringify(selector)}] } }] } };\n`);
      const run = runGate(scratch);
      expect(tokens(run)).toContain(selector);
      expect(messages(run)).toContain("in-repo symlink cannot grant");
    } finally {
      rmSync(outside, { force: true });
    }
  });
});

describe("runner-config-path-liveness — Vitest exact includes select files", () => {
  test("an empty exact include cannot pass by resolving to the repository root", ({ scratch }) => {
    plantConfigs(scratch, 'export default { test: { projects: [{ test: { include: [""] } }] } };\n');
    const run = runGate(scratch);
    expect(tokens(run)).toContain("");
    expect(messages(run)).toContain("collects zero tests for an exact empty/root or directory include");
  });

  test("an existing directory exact include cannot pass filesystem-only liveness", ({ scratch }) => {
    plantConfigs(scratch, 'export default { test: { projects: [{ test: { include: ["tests"] } }] } };\n');
    const run = runGate(scratch);
    expect(tokens(run)).toContain("tests");
    expect(messages(run)).toContain("resolves to a directory rather than a file");
  });

  test("a valid exact test-file include remains live", ({ scratch }) => {
    plantConfigs(scratch, `export default { test: { projects: [{ test: { include: ["${LIVE_REL}"] } }] } };\n`);
    plant(scratch, LIVE_REL, "export const live = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });
});

describe("runner-config-path-liveness — named-array spreads a StringLiteral-only reader would miss", () => {
  test("a dead path behind a named const SPREAD into two projects reds ONCE PER SITE", ({ scratch }) => {
    // A named array is spread into one execution group's exclude and another's include, so a rename must
    // repoint both — the gate names both sites.
    plantConfigs(
      scratch,
      `const SERIAL = ["${DEAD_REL}", "${LIVE_REL}"];\n` +
        `export default { test: { projects: [{ test: { include: ["tests/**/*.int.test.ts"], exclude: [...SERIAL] } }, { test: { include: SERIAL } }] } };\n`,
    );
    plant(scratch, LIVE_REL, "export const live = 1;\n");
    const run = runGate(scratch);
    expect(tokens(run)).toEqual([DEAD_REL, DEAD_REL]);
    expect(messages(run)).toContain("project[0].test.exclude");
    expect(messages(run)).toContain("project[1].test.include");
  });

  test("the live sibling in that same const stays silent — the spread reader is not a blanket accuser", ({ scratch }) => {
    plantConfigs(scratch, `const SERIAL = ["${LIVE_REL}"];\nexport default { test: { projects: [{ test: { include: SERIAL } }] } };\n`);
    plant(scratch, LIVE_REL, "export const live = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });
});

describe("runner-config-path-liveness — a bare zero must be 'I could not measure', never 'clean'", () => {
  test("an ABSENT runner config REFUSES LOUDLY (the §4.6 blindness tripwire)", ({ scratch }) => {
    plant(scratch, VITEST_REL, "export default {};\n");
    plant(scratch, E2E_REL, E2E_SOURCE);
    const run = runGate(scratch);
    expect(messages(run)).toContain("not at the repo root");
    expect(tokens(run)).toEqual([CT_REL]);
  });

  test("an UNPARSEABLE runner config FAILS LOUD — no silent default-fallback", ({ scratch }) => {
    plantConfigs(scratch, "export default { test: { include: [ ;;; (((( } };\n");
    expect(messages(runGate(scratch))).toContain("did not parse");
  });

  test("an UNREADABLE shape (a call) REFUSES LOUDLY rather than being silently skipped", ({ scratch }) => {
    plantConfigs(scratch, "export default { test: { include: [resolvePaths()] } };\n");
    const run = runGate(scratch);
    expect(messages(run)).toContain("CANNOT resolve through its owning config reader");
    expect(tokens(run)).toContain("native-loader");
  });

  test("an anchor-sized value set deriving ZERO exact rows REDs — the classifier-rot tripwire", ({ scratch }) => {
    // No playwright configs' testDir here: they would each contribute an exact row and mask the arm.
    plant(scratch, VITEST_REL, `export default { test: { include: [${globFiller(ANCHOR)}] } };\n`);
    plant(scratch, E2E_REL, 'export default { testMatch: "**/*.spec.ts" };\n');
    plant(scratch, CT_REL, 'export default { testMatch: "**/*.ct.tsx" };\n');
    expect(messages(runGate(scratch))).toContain("ZERO file-exact rows");
  });
});

describe("runner-config-path-liveness — the REAL tree", () => {
  test("the real runner configs parse, read a substantial value set, and carry NO dead row", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    const declared = run.declarations[0];
    expect(declared?.unit).toBe("runner path row");
    // THE DENOMINATOR IS THE RECEIPT: kind globs hide behind imports and calls, so a low candidate count
    // would mean the reader went blind even though the verdict looks green.
    expect(declared?.candidates ?? 0).toBeGreaterThanOrEqual(ANCHOR);
    // The current exact selectors are Playwright testDir/globalSetup rows; repository-resource selection
    // is registry-derived globs, so an exact-row roster is deliberately absent.
    expect(declared?.scanned ?? 0).toBeGreaterThan(0);
    expect(run.findings).toEqual([]);
  });
});
