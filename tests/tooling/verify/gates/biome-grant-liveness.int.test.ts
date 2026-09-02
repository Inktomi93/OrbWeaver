// The PERMANENT PIN for the `biome-grant-liveness` gate (tooling/src/verify/gates/biome-grant-liveness.ts):
// a file-exact grant in a `biome.json` override `includes` whose file is GONE must be RED. It used to be
// invisible — no gate read the lint config, so a deleted or moved grant subject left its suppression
// standing forever and the next file created at that path silently inherited a rule exemption nobody
// re-approved. Conformance proves the matcher against synthetic mini-projects; THIS proves the promise
// against the REAL biome.json and against planted controls in BOTH directions, so the lie cannot be
// reintroduced. Every arm here is a planted control: a dead row REDs, a live row is silent, a
// zero-row/unparseable/absent config REFUSES LOUDLY rather than printing a clean zero, and the real tree
// derives a substantial row count (a green over a count you did not expect is the blind-gate failure mode).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/biome-grant-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = "biome.json";
/** Mirrors the gate's own anchor (`REAL_CONFIG_MIN_INCLUDES`) — the size at which its exemption + blindness
 *  arms come alive. Restated rather than exported: the test is the SECOND opinion, not a re-import of it. */
const ANCHOR_INCLUDES = 30;
const TRANSIENT_CATALOG_TMP = "docs/catalog/catalog.tmp.*.json";
const CATALOG_SERIALIZER = "tooling/src/doc-catalog/ops/tree.ts";

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
function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"packages/p${i}/**"`).join(", ");
}

function configWith(entries: string): string {
  return `{\n  "overrides": [{ "includes": [${entries}], "linter": { "rules": {} } }]\n}\n`;
}

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((f) => f.token);
const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");

describe("biome-grant-liveness — the DEAD-GRANT control, both directions", () => {
  test("a file-exact grant whose file is GONE is RED, and names the dead path", ({ scratch }) => {
    plant(scratch, CONFIG_REL, configWith('"packages/client/src/gone.ts"'));
    const run = runGate(scratch);
    expect(tokens(run)).toEqual(["packages/client/src/gone.ts"]);
    // Anchored at the row, not the file: the config is one line of includes, so line 2.
    expect(run.findings[0]?.line).toBe(2);
  });

  test("the SAME config with the file present is silent — the control's other direction", ({ scratch }) => {
    plant(scratch, CONFIG_REL, configWith('"packages/client/src/gone.ts"'));
    plant(scratch, "packages/client/src/gone.ts", "export const x = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("glob rows are v1 out of scope and are never resolved as paths (declared skip, not a finding)", ({ scratch }) => {
    plant(scratch, CONFIG_REL, configWith('"packages/client/**", "**/*.config.ts", "playwright*.config.ts", "tests/{a,b}/x.ts"'));
    const run = runGate(scratch);
    expect(run.findings).toEqual([]);
    expect(run.declarations[0]?.skipped?.["glob"]).toBe(4);
    expect(run.declarations[0]?.scanned).toBe(0);
  });
});

describe("biome-grant-liveness — a bare zero must be 'I could not measure', never 'clean'", () => {
  test("an ABSENT biome.json REFUSES LOUDLY (the §4.6 blindness tripwire), it does not pass green", ({ scratch }) => {
    const run = runGate(scratch);
    expect(messages(run)).toContain("not at the repo root");
    expect(run.declarations[0]?.scanned).toBe(0);
  });

  test("an UNPARSEABLE biome.json FAILS LOUD — no silent default-fallback (biome.json is STRICT JSON)", ({ scratch }) => {
    plant(scratch, CONFIG_REL, '{\n  // a comment strict JSON rejects\n  "overrides": []\n}\n');
    const run = runGate(scratch);
    expect(messages(run)).toContain("did not parse as STRICT JSON");
  });

  test("an anchor-sized config deriving ZERO exact rows REDs — the classifier-rot tripwire", ({ scratch }) => {
    plant(scratch, CONFIG_REL, configWith(globFiller(ANCHOR_INCLUDES)));
    const run = runGate(scratch);
    expect(messages(run)).toContain("ZERO file-exact grant rows");
  });
});

describe("biome-grant-liveness — the exemption table is two-sided (§4.4)", () => {
  const filler = globFiller(ANCHOR_INCLUDES - 1);

  test("an EXEMPT row biome.json no longer carries is a loaded gun — RED", ({ scratch }) => {
    plant(scratch, CONFIG_REL, configWith(`${filler}, "packages/client/src/live.ts"`));
    plant(scratch, "packages/client/src/live.ts", "export const x = 1;\n");
    const run = runGate(scratch);
    expect(tokens(run)).toEqual([TRANSIENT_CATALOG_TMP]);
    expect(messages(run)).toContain("no longer carries");
  });

  test("an EXEMPT row whose cited producer MOVED — RED (the promise outlived its evidence)", ({ scratch }) => {
    // The exempt row is a GLOB since #1029, so one live file-exact row rides beside it — without it the
    // §4.6 zero-exact-rows tripwire fires first and this arm is never reached.
    plant(scratch, CONFIG_REL, configWith(`${filler}, "packages/client/src/live.ts", "${TRANSIENT_CATALOG_TMP}"`));
    plant(scratch, "packages/client/src/live.ts", "export const x = 1;\n");
    const run = runGate(scratch);
    expect(tokens(run)).toEqual([CATALOG_SERIALIZER]);
    expect(messages(run)).toContain("`cite` no longer resolves");
  });

  test("the exemption HONOURED: an absent-by-design subject with a resolving cite is silent", ({ scratch }) => {
    plant(scratch, CONFIG_REL, configWith(`${filler}, "packages/client/src/live.ts", "${TRANSIENT_CATALOG_TMP}"`));
    plant(scratch, "packages/client/src/live.ts", "export const x = 1;\n");
    plant(scratch, CATALOG_SERIALIZER, "export const serializer = 1;\n");
    expect(runGate(scratch).findings).toEqual([]);
  });
});

describe("biome-grant-liveness — the REAL tree", () => {
  test("the real biome.json parses, derives a substantial row count, and carries NO unexempted dead grant", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    const declared = run.declarations[0];
    // The denominator IS the receipt: a ✓ over a count you did not expect is the blind-gate failure mode.
    expect(declared?.unit).toBe("grant row");
    expect(declared?.scanned ?? 0).toBeGreaterThanOrEqual(ANCHOR_INCLUDES);
    expect(run.findings).toEqual([]);
  });

  test("the exemption's cited producer is still on the tree (the §3 path-constant tripwire, live)", ({ repoRoot }) => {
    expect(existsSync(join(repoRoot, CATALOG_SERIALIZER))).toBe(true);
  });
});

// ── #973: the PATTERN half. A pattern grant is LIVE only while some TRACKED file is still inside it, so
// these arms need a real git work tree (the corpus is `git ls-files`, deliberately not an FS walk) — which
// is also why conformance cannot drive them: its mini-projects are under the real-config anchor and have
// no work tree at all.

/** A throwaway git repo at `root` with `files` committed — the corpus these arms judge against. */
/** The gate's own module — its §4.5 real-tree anchor for the pattern half. */
const GATE_SELF_REL = "tooling/src/verify/gates/biome-grant-liveness.ts";

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

const BIOME_LIVE_SRC = "packages/ui/src/live.ts";
const BIOME_LIVE_SOURCE = "export const live = 1;\n";

/** An anchor-sized biome.json: `globs` under test, LIVE glob filler, and ONE live file-exact grant. */
function overrideConfig(globs: readonly string[]): string {
  const filler = Array.from({ length: ANCHOR_INCLUDES }, (_, i) => `packages/ui/src/**/{live,f${String(i)}}.ts`);
  const includes = [...globs, ...filler, BIOME_LIVE_SRC, TRANSIENT_CATALOG_TMP];
  return `${JSON.stringify({ overrides: [{ includes }] }, null, 2)}\n`;
}

function plantBiomeRepo(root: string, globs: readonly string[]): void {
  plantRepo(root, {
    [CONFIG_REL]: overrideConfig(globs),
    [BIOME_LIVE_SRC]: BIOME_LIVE_SOURCE,
    [TRANSIENT_CATALOG_TMP]: "{}\n",
    [CATALOG_SERIALIZER]: "export const serializer = 1;\n",
  });
}

describe("biome-grant-liveness — PATTERN liveness (#973)", () => {
  test("a GLOB grant matching no tracked file is RED, and names the glob", ({ scratch }) => {
    plantBiomeRepo(scratch, ["packages/nonexistent/**"]);
    const run = runGate(scratch);
    expect(tokens(run)).toContain("packages/nonexistent/**");
    expect(messages(run)).toContain("matches NO tracked file");
  });

  test("a LIVE multi-member glob grant is accepted — the control's other direction", ({ scratch }) => {
    plantBiomeRepo(scratch, ["packages/ui/src/**/*.ts"]);
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("an EMPTY corpus refuses loudly rather than calling every glob grant dead", ({ scratch }) => {
    plant(scratch, CONFIG_REL, overrideConfig(["packages/ui/src/**/*.ts"]));
    plant(scratch, BIOME_LIVE_SRC, BIOME_LIVE_SOURCE);
    plant(scratch, TRANSIENT_CATALOG_TMP, "{}\n");
    plant(scratch, CATALOG_SERIALIZER, "export const serializer = 1;\n");
    plant(scratch, GATE_SELF_REL, "export const gate = 1;\n");
    expect(messages(runGate(scratch))).toContain("came back EMPTY");
  });
});
