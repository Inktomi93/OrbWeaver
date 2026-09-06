// The PERMANENT PIN for the `biome-grant-liveness` gate (tooling/src/verify/gates/biome-grant-liveness.ts):
// a file-exact grant in a `biome.json` override `includes` whose file is GONE must be RED. It used to be
// invisible — no gate read the lint config, so a deleted or moved grant subject left its suppression
// standing forever and the next file created at that path silently inherited a rule exemption nobody
// re-approved. Conformance proves the matcher against synthetic mini-projects; THIS proves the promise
// against the REAL biome.json and against planted controls in BOTH directions, so the lie cannot be
// reintroduced. Every arm here is a planted control: a dead row REDs, a live row is silent, a
// zero-row/unparseable/absent config REFUSES LOUDLY rather than printing a clean zero, and the real tree
// derives a substantial row count (a green over a count you did not expect is the blind-gate failure mode).
// Since #1158 it also pins the RULE half: a grant that turns a rule OFF is a promise the named files WOULD
// violate it, and a PLANTED dead grant (`useFilenamingConvention: "off"` on a kebab-case barrel) was
// invisible to every arm above. Those controls drive the REAL biome binary — the only substrate where the
// question exists — and the refusal arms prove a report this arm cannot trust never reads as "dead".
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/biome-grant-liveness.ts";
import { judgeReport, judgeRuleLiveness } from "../../../../tooling/src/verify/lib/biome-rule-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFIG_REL = "biome.json";
/** Mirrors the gate's own anchor (`REAL_CONFIG_MIN_INCLUDES`) — the size at which its exemption + blindness
 *  arms come alive. Restated rather than exported: the test is the SECOND opinion, not a re-import of it. */
const ANCHOR_INCLUDES = 30;
/** Every arm that drives the gate over the REAL tree spawns one biome check (#1158). MEASURED 2026-09-02:
 *  4.8s for the gate alone, 8.5s for the planted-control run under a 4-worker co-run — a SPAWN budget,
 *  which degrades with load, so the headroom is generous on purpose rather than tuned to one machine. */
const GATE_RUN_TIMEOUT_MS = scaledBudget(120_000);
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
  test(
    "the real biome.json parses, derives a substantial row count, and carries NO unexempted dead grant",
    ({ repoRoot }) => {
      const run = runGate(repoRoot);
      const declared = run.declarations[0];
      // The denominator IS the receipt: a ✓ over a count you did not expect is the blind-gate failure mode.
      expect(declared?.unit).toBe("grant row");
      expect(declared?.scanned ?? 0).toBeGreaterThanOrEqual(ANCHOR_INCLUDES);
      // The RULE half's receipt (#1158): a live population, not a zero it could have printed while blind.
      expect(declared?.skipped?.["rule-live"] ?? 0).toBeGreaterThanOrEqual(10);
      expect(run.findings).toEqual([]);
      // 5s is the WRONG UNIT here since #1158: the run spawns one real biome check (4.3s of project scan
      // alone, measured 2026-09-02), so vitest's default killed this arm at 5,276ms on the first co-run.
    },
    GATE_RUN_TIMEOUT_MS,
  );

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

// ── #1158: the RULE half. A rule-off grant is a promise that the named files WOULD violate the rule;
// path liveness cannot see it lapse. These arms drive the REAL biome binary against the REAL repo (the
// only substrate where the question exists) with three grants PLANTED into a copy of biome.json's text:
// one dead, one dead-but-on-a-mixed-row (the declared limit), and the repo's own 14 live grants as the
// other direction. The refusal arms are pure — a truncated or broken report must never read as "dead".

/** biome.json's text with extra overrides spliced into `overrides` — the planted-control substrate. */
function configWithOverrides(repoRoot: string, extra: readonly Record<string, unknown>[]): string {
  const parsed = JSON.parse(readFileSync(join(repoRoot, CONFIG_REL), "utf8")) as { overrides: unknown[] };
  return JSON.stringify({ ...parsed, overrides: [...parsed.overrides, ...extra] });
}

const KIT_BARREL = "packages/kit/src/index.ts";
const DEAD_RULE = "useFilenamingConvention";

function ruleOffOverride(includes: readonly string[]): Record<string, unknown> {
  return { includes, linter: { rules: { style: { [DEAD_RULE]: "off" } } } };
}

describe("biome-grant-liveness — RULE liveness, planted controls in BOTH directions (#1158)", () => {
  test(
    "a DEAD rule-off grant reds naming path+rule, a MIXED row is the declared limit, and the real grants stay live",
    ({ repoRoot }) => {
      const configText = configWithOverrides(repoRoot, [ruleOffOverride([KIT_BARREL]), ruleOffOverride(["packages/kit/src/**", KIT_BARREL])]);
      const outcome = judgeRuleLiveness({ root: repoRoot, configText, isExactPath: (path) => !/[*?[\]{}]/u.test(path) });
      // The planted grant is the ONLY dead one: kit's barrel is kebab-case, so useFilenamingConvention
      // suppresses nothing there — the exact control the audit planted when it proved this gate blind.
      expect(outcome.dead.map((grant) => `${grant.rule} ${grant.anchor}`)).toEqual([`${DEAD_RULE} ${KIT_BARREL}`]);
      // …and the SAME grant on a row that also carries a glob is silent: its subject is the expansion.
      expect(outcome.skippedMixed).toBeGreaterThanOrEqual(1);
      // The other direction, over the repo's own rule-off grants: a substantial live population, not zero.
      expect(outcome.live).toBeGreaterThanOrEqual(10);
      expect(outcome.filesProbed).toBeGreaterThanOrEqual(10);
    },
    GATE_RUN_TIMEOUT_MS,
  );

  test("the probe config never survives the run — a leftover would be linted by the next `pnpm check`", ({ repoRoot }) => {
    expect(readdirSync(repoRoot).filter((name) => name.startsWith("__g_biome-rule-liveness."))).toEqual([]);
  });

  test("no biome binary under the root REFUSES loudly — it never calls every grant live", ({ scratch }) => {
    plant(scratch, "packages/kit/src/index.ts", "export const x = 1;\n");
    const configText = JSON.stringify({ overrides: [ruleOffOverride([KIT_BARREL])] });
    expect(() => judgeRuleLiveness({ root: scratch, configText, isExactPath: () => true })).toThrow(/biome binary/u);
  });
});

describe("biome-grant-liveness — a rule verdict this arm cannot trust is a REFUSAL, never a DEAD grant", () => {
  const grants = [{ group: "style", rule: DEAD_RULE, files: [KIT_BARREL], anchor: KIT_BARREL }];

  test("a TRUNCATED report refuses — every grant past the cut would read as dead", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 3 }, diagnostics: [] });
    expect(() => judgeReport(grants, stdout)).toThrow(/TRUNCATED/u);
  });

  test("a non-lint diagnostic (a broken probe config) refuses", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 0 }, diagnostics: [{ category: "internalError/fs" }] });
    expect(() => judgeReport(grants, stdout)).toThrow(/probe config is broken/u);
  });

  test("output that is not the reporter's shape refuses", () => {
    expect(() => judgeReport(grants, "not json")).toThrow(/did not parse/u);
    expect(() => judgeReport(grants, JSON.stringify({ hello: 1 }))).toThrow(/reporter shape changed/u);
  });

  test("a report over ZERO processed files refuses — a config biome could not parse reads as ALL-DEAD (#1245)", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 0, changed: 0, unchanged: 0 }, diagnostics: [] });
    expect(() => judgeReport(grants, stdout)).toThrow(/processed 0 of 1 probe files/u);
  });

  test("the same empty diagnostic list over files biome DID process is a live judgement, not a refusal", () => {
    const stdout = JSON.stringify({ summary: { diagnosticsNotPrinted: 0, changed: 0, unchanged: 1 }, diagnostics: [] });
    expect(judgeReport(grants, stdout).dead).toEqual(grants);
  });

  test("a report where the rule DID fire leaves the grant live — the control's other direction", () => {
    const stdout = JSON.stringify({
      summary: { diagnosticsNotPrinted: 0 },
      diagnostics: [{ category: `lint/style/${DEAD_RULE}`, location: { path: KIT_BARREL } }],
    });
    expect(judgeReport(grants, stdout).dead).toEqual([]);
  });
});

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
