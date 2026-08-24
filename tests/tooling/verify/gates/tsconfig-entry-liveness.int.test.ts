// The PERMANENT PIN for the `tsconfig-entry-liveness` gate (tooling/src/verify/gates/tsconfig-entry-liveness.ts):
// a file-exact `include`/`exclude` entry in a `tsconfig*.json` whose path is GONE must be RED. It used to be
// invisible — no gate read the type configs, so a deleted or moved entry left its exclude as dead weight or
// silently dropped the coverage an include carried (and, for tsconfig.tests-dom.json, stopped libbing a
// DOM-coupled escapee). Conformance proves the matcher against synthetic mini-projects; THIS proves the
// promise against the REAL tsconfig set and against planted controls in BOTH directions, so the lie cannot
// be reintroduced. Every arm here is a planted control: a dead row REDs, a live row is silent, a
// zero-row/unparseable/absent config REFUSES LOUDLY rather than printing a clean zero, and the real tree
// derives a substantial exact-entry count with NO unexempted dead entry.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = "tsconfig.json";
/** Mirrors the gate's own anchor (`REAL_CONFIG_MIN_CANDIDATES`) — the size at which its exemption + blindness
 *  arms come alive. Restated rather than exported: the test is the SECOND opinion, not a re-import of it. */
const ANCHOR = 30;
const ST_GOLDENS_RUNTIME = "scripts/probes/st-goldens/sillytavern-runtime";
const ST_GOLDENS_README = "scripts/probes/st-goldens/README.md";

interface Run {
  readonly findings: readonly Finding[];
  readonly declarations: readonly GateScanDeclaration[];
}

/** Drive the gate's own `run` over a root. It reads only `ctx.root`, `ctx.scan` and `ctx.report`, so the
 *  context is minimal on purpose — this exercises the REAL descriptor, never a re-implementation. */
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

/** `count` glob entries — filler that clears the gate's anchor without deriving a single exact row. */
function globFiller(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `"packages/p${i}/**"`);
}

function includeConfig(entries: readonly string[]): string {
  return `{\n  "include": [${entries.join(", ")}]\n}\n`;
}

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((f) => f.token);
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

describe("tsconfig-entry-liveness — the DEAD-ENTRY control, both directions", () => {
  test("a file-exact EXCLUDE whose file is GONE is RED, and names the dead path", ({ scratch }) => {
    plant(scratch, CONFIG_REL, '{\n  "exclude": ["packages/client/src/gone.ts"]\n}\n');
    const run = runGate(scratch);
    expect(tokens(run)).toEqual(["packages/client/src/gone.ts"]);
    expect(run.findings[0]?.line).toBe(2);
  });

  test("the SAME config with the file present is silent — the control's other direction", ({ scratch }) => {
    plant(scratch, CONFIG_REL, '{\n  "exclude": ["packages/client/src/gone.ts"]\n}\n');
    plant(scratch, "packages/client/src/gone.ts", "export const x = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("glob + template rows are declared skips, never resolved as paths", ({ scratch }) => {
    plant(scratch, CONFIG_REL, includeConfig([`"packages/*/src"`, `"tests/**/*.tsx"`, `"packages/p/**"`]));
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.declarations[0]?.skipped?.["glob"]).toBe(3);
    expect(run.declarations[0]?.scanned).toBe(0);
  });
});

describe("tsconfig-entry-liveness — a bare zero must be 'I could not measure', never 'clean'", () => {
  test("an ABSENT tsconfig.json REFUSES LOUDLY (the §4.6 blindness tripwire)", ({ scratch }) => {
    const run = runGate(scratch);
    expect(messages(run)).toContain("not at the repo root");
    expect(run.declarations[0]?.scanned).toBe(0);
  });

  test("an UNPARSEABLE tsconfig FAILS LOUD — no silent default-fallback", ({ scratch }) => {
    plant(scratch, CONFIG_REL, '{\n  "include": [ \n}\n');
    const run = runGate(scratch);
    expect(messages(run)).toContain("did not parse as JSONC");
  });

  test("an anchor-sized set deriving ZERO exact entries REDs — the classifier-rot tripwire", ({ scratch }) => {
    plant(scratch, CONFIG_REL, includeConfig(globFiller(ANCHOR)));
    const run = runGate(scratch);
    expect(messages(run)).toContain("ZERO file-exact");
  });
});

describe("tsconfig-entry-liveness — the exemption table is two-sided (§4.4)", () => {
  const filler = globFiller(ANCHOR - 1);

  test("an EXEMPT row no scanned tsconfig carries is a loaded gun — RED", ({ scratch }) => {
    plant(scratch, CONFIG_REL, includeConfig([...filler, `"packages/client/src/live.ts"`]));
    plant(scratch, "packages/client/src/live.ts", "export const x = 1;\n");
    const run = runGate(scratch);
    expect(tokens(run)).toEqual([ST_GOLDENS_RUNTIME]);
    expect(messages(run)).toContain("no scanned tsconfig carries");
  });

  test("an EXEMPT row whose cited doc MOVED — RED (the promise outlived its evidence)", ({ scratch }) => {
    plant(scratch, CONFIG_REL, includeConfig([...filler, `"${ST_GOLDENS_RUNTIME}"`]));
    const run = runGate(scratch);
    expect(tokens(run)).toEqual([ST_GOLDENS_README]);
    expect(messages(run)).toContain("`cite` no longer resolves");
  });

  test("the exemption HONOURED: an absent-by-design entry with a resolving cite is silent", ({ scratch }) => {
    plant(scratch, CONFIG_REL, includeConfig([...filler, `"${ST_GOLDENS_RUNTIME}"`]));
    plant(scratch, ST_GOLDENS_README, "# st goldens\n");
    expect(runGate(scratch).findings).toEqual([]);
  });
});

describe("tsconfig-entry-liveness — the REAL tree", () => {
  test("the real tsconfig set parses, derives a substantial exact count, and carries NO unexempted dead entry", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    const declared = run.declarations[0];
    expect(declared?.unit).toBe("tsconfig entry");
    expect(declared?.scanned ?? 0).toBeGreaterThan(0);
    expect(run.findings).toEqual([]);
  });

  test("the exemption's cited doc is still on the tree (the §3 path-constant tripwire, live)", ({ repoRoot }) => {
    expect(existsSync(join(repoRoot, ST_GOLDENS_README))).toBe(true);
  });
});
