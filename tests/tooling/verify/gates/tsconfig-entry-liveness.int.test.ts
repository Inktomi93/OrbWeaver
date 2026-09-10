// The PERMANENT PIN for the `tsconfig-entry-liveness` gate (tooling/src/verify/gates/tsconfig-entry-liveness.ts):
// a file-exact `include`/`exclude` entry in a `tsconfig*.json` whose path is GONE must be RED. It used to be
// invisible — no gate read the type configs, so a deleted or moved entry left its exclude as dead weight or
// silently dropped the coverage an include carried (and, for tsconfig.tests-dom.json, stopped libbing a
// DOM-coupled escapee). Conformance proves the matcher against synthetic mini-projects; THIS proves the
// promise against the REAL tsconfig set and against planted controls in BOTH directions, so the lie cannot
// be reintroduced. Every arm here is a planted control: a dead row REDs, a live row is silent, a
// zero-row/unparseable/absent config REFUSES LOUDLY rather than printing a clean zero, and the real tree
// derives a substantial exact-entry count with NO unexempted dead entry.
import { execFileSync } from "node:child_process";
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

// ── #973: the PATTERN half. A pattern grant is LIVE only while some TRACKED file is still inside it, so
// these arms need a real git work tree (the corpus is `git ls-files`, deliberately not an FS walk) — which
// is also why conformance cannot drive them: its mini-projects are under the real-config anchor and have
// no work tree at all.

/** A throwaway git repo at `root` with `files` committed — the corpus these arms judge against. */
/** The gate's own module — its §4.5 real-tree anchor for the pattern half. */
const GATE_SELF_REL = "tooling/src/verify/gates/tsconfig-entry-liveness.ts";

function plantRepo(root: string, files: Readonly<Record<string, string>>): void {
  // Plant the gate's OWN module: the pattern half is scoped to a root that carries it (the §4.5 real-tree
  // anchor shape), so a fixture opts IN by planting the anchor and the file-exact fixtures stay untouched.
  plant(root, GATE_SELF_REL, "export const gate = 1;\n");

  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

const TS_LIVE_SRC = "packages/ui/src/live.ts";
const TS_LIVE_SOURCE = "export const live = 1;\n";
/** The gate's RATIFIED keys + cite, restated — a planted config must carry them or the two-sided STALE arm
 *  correctly reds every fixture. */
const TS_RATIFIED_KEYS = [
  "**/node_modules",
  "**/__g_*",
  "**/__g_*/**",
  "scripts/**/*.cts",
  "scripts/**/*.mts",
  "scripts/**/*.tsx",
  "tests/**/*.cts",
  "tests/support/iso/**/*",
];
const TS_RATIFIED_CITES = [".gitignore", "docs/architecture/core/Core-Tooling-Law.md", "tooling/src/verify/gates/GATE-AUTHORING.md"];

/** An anchor-sized root tsconfig: `globs` under test, the ratified excludes a real config carries, LIVE
 *  glob filler, and ONE live file-exact entry. */
function globEntryConfig(globs: readonly string[]): string {
  const filler = Array.from({ length: ANCHOR }, (_, i) => `packages/ui/src/**/{live,f${String(i)}}.ts`);
  // The file-exact EXEMPT row must be CARRIED too — its stale arm is two-sided and would otherwise red
  // every fixture that clears the anchor.
  const include = [...globs, ...filler, TS_LIVE_SRC, ST_GOLDENS_RUNTIME];
  return `${JSON.stringify({ include, exclude: TS_RATIFIED_KEYS }, null, 2)}\n`;
}

function plantTsconfigRepo(root: string, globs: readonly string[]): void {
  const cites = Object.fromEntries([...TS_RATIFIED_CITES, ST_GOLDENS_README].map((cite) => [cite, "cite\n"]));
  plantRepo(root, { [CONFIG_REL]: globEntryConfig(globs), [TS_LIVE_SRC]: TS_LIVE_SOURCE, ...cites });
}

describe("tsconfig-entry-liveness — PATTERN liveness (#973)", () => {
  test("a GLOB entry matching no tracked file is RED, and names the entry as authored", ({ scratch }) => {
    plantTsconfigRepo(scratch, ["packages/nonexistent/**/*.ts"]);
    const run = runGate(scratch);
    expect(tokens(run)).toContain("packages/nonexistent/**/*.ts");
    expect(messages(run)).toContain("matches NO tracked file");
  });

  test("a LIVE multi-member glob entry is accepted — the control's other direction", ({ scratch }) => {
    plantTsconfigRepo(scratch, ["packages/ui/src/**/*.ts"]);
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("an EMPTY corpus refuses loudly rather than calling every glob entry dead", ({ scratch }) => {
    plant(scratch, CONFIG_REL, globEntryConfig(["packages/ui/src/**/*.ts"]));
    plant(scratch, TS_LIVE_SRC, TS_LIVE_SOURCE);
    plant(scratch, ST_GOLDENS_README, "cite\n");
    plant(scratch, GATE_SELF_REL, "export const gate = 1;\n");
    expect(messages(runGate(scratch))).toContain("came back EMPTY");
  });
});
