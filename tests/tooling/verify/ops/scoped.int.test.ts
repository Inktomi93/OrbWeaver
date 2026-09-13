// The SCOPED-RUN proof net (TSMORPH-SINGLE-PASS-AUDIT.md §4, the driven-for-real deliverable). The scoped
// runner (tooling/src/verify/ops/scoped.ts) runs ONLY the incremental-safe gates over a subset of the tree and
// DEFERS every whole-project gate. Four properties, each proven the parity-guard-divergence way — the
// test introduces the exact divergence, confirms the expected RED/silent, then the fixture is restored to
// its clean shape so the assertion has teeth (a green it can be SHOWN going red):
//
//   1. SUBSET-CORRECTNESS — an incremental-safe violation INSIDE the scoped folder is reported by the
//      scoped run AND by the full run, for that exact file. Remove the violation → both go clean.
//   2. SCOPE-ISOLATION — a violation OUTSIDE the scoped folder is INVISIBLE to the scoped run but caught
//      by the full run. It is the fence's whole point: a scoped clean is only a claim about the scope.
//   3. WHOLE-PROJECT-SAFETY — a whole-project ratchet (bus-producer-coverage) that FIRES on the full tree does NOT
//      fire on a scoped run: it is deferred, never run, so it emits zero findings.
//   4. STALE-ARM ISOLATION — an INCREMENTAL-safe gate does run on a scoped pass, `finalize` included, so
//      its exemption-table stale sweep must stay silent about rows whose files the run never visited.
//
// The "full run" oracle here is `runPass` over the SAME in-memory project with scope=project — the exact
// path `pnpm check:structure` drives — so the scoped verdict is proven against the real full verdict, not
// a hand-rolled expectation.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx, Scope } from "../../../../tooling/src/verify/index.ts";
import { runPass, runScopedPass } from "../../../../tooling/src/verify/index.ts";
import { fileLoaded } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/repo";
const PROOF = { files: "export const fixture = true;\n", why: "test-owned legacy adapter fixture" } as const;

const noCallerUserIdGate: GateDescriptor = {
  name: "no-caller-user-id",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "callerUserId is forbidden",
  scanRoot: () => true,
  kinds: [SyntaxKind.Identifier],
  visit: (node, _sourceFile, ctx): void => {
    if (Node.isIdentifier(node) && node.getText() === "callerUserId") {
      ctx.report(node, { token: "callerUserId", offset: 0 });
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

const busProducerCoverageGate: GateDescriptor = {
  name: "bus-producer-coverage",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "whole-project",
  message: "declared bus member has no producer",
  run: (ctx): void => {
    const path = "packages/contracts/src/chat/bus.ts";
    const source = ctx.project.getSourceFile(`${ROOT}/${path}`);
    if (source?.getFullText().includes("neverEmitted") === true) {
      ctx.report({ file: path, line: 1, column: 1, token: "neverEmitted" });
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

function project(files: Readonly<Record<string, string>>): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    p.createSourceFile(`${ROOT}/${rel}`, text);
  }
  return p;
}

/** A `projectCtx`-shaped base over an in-memory project (the CLI builds the real disk one). */
function baseFor(files: Readonly<Record<string, string>>): Omit<GateRunCtx, "report" | "scan"> {
  const p = project(files);
  return {
    root: ROOT,
    project: p,
    scope: { kind: "project" },
    files: p.getSourceFiles(),
    checker: () => p.getTypeChecker(),
  };
}

/** A `--scope <folder>/**`-style selection. */
function folderScope(folder: string): { scope: Scope; inScope: (rel: string) => boolean } {
  const prefix = `${folder}/`;
  return {
    scope: { kind: "folder", glob: `${folder}/**` },
    inScope: (rel) => rel.startsWith(prefix),
  };
}

/** The full-run oracle for one gate: `runPass` over the whole project at scope=project — the site set. */
function fullSites(base: Omit<GateRunCtx, "report" | "scan">, gateName: string): string[] {
  const result = runPass(
    [noCallerUserIdGate, busProducerCoverageGate].filter((g) => g.name === gateName),
    base,
  );
  const findings = result.gates.find((g) => g.name === gateName)?.findings ?? [];
  return findings.map((f) => `${f.file}:${f.line}`).sort();
}

/** The scoped-run site set for one gate. */
function scopedSites(base: Omit<GateRunCtx, "report" | "scan">, selection: { scope: Scope; inScope: (rel: string) => boolean }, gateName: string): string[] {
  const { pass } = runScopedPass([noCallerUserIdGate, busProducerCoverageGate], base, selection);
  const findings = pass.gates.find((g) => g.name === gateName)?.findings ?? [];
  return findings.map((f) => `${f.file}:${f.line}`).sort();
}

// ── 1. SUBSET-CORRECTNESS ─────────────────────────────────────────────────────────────────────────
const IN_SCOPE_VIOLATION = "packages/server/src/domain/chat/engine/turn.ts";

test("subset-correctness: an in-scope incremental-safe violation is caught by BOTH scoped and full", () => {
  const dirty = baseFor({
    [IN_SCOPE_VIOLATION]: "export function f(callerUserId: string) {}\n",
  });
  const selection = folderScope("packages/server/src/domain/chat");

  const scoped = scopedSites(dirty, selection, "no-caller-user-id");
  const full = fullSites(dirty, "no-caller-user-id");

  // The scoped run reports EXACTLY the in-scope violation, and it matches the full run's verdict for it.
  expect(scoped).toEqual([`${IN_SCOPE_VIOLATION}:1`]);
  expect(full).toEqual(scoped);
});

test("subset-correctness PROVE-IT-BITES: remove the violation → scoped run goes clean", () => {
  // The exact same fixture with the banned identifier removed (the divergence restored to clean).
  const clean = baseFor({
    [IN_SCOPE_VIOLATION]: "export function f(triggeredBy: string) {}\n",
  });
  const selection = folderScope("packages/server/src/domain/chat");
  expect(scopedSites(clean, selection, "no-caller-user-id")).toEqual([]);
});

// ── 2. SCOPE-ISOLATION ──────────────────────────────────────────────────────────────────────────────
const OUT_OF_SCOPE_VIOLATION = "packages/server/src/domain/settings/verbs/save.ts";

test("scope-isolation: an OUT-of-scope violation is invisible to the scoped run but caught by the full", () => {
  // The violation lives in domain/settings; the scope is domain/chat — disjoint.
  const dirty = baseFor({
    "packages/server/src/domain/chat/engine/ok.ts": "export function ok(triggeredBy: string) {}\n",
    [OUT_OF_SCOPE_VIOLATION]: "export function bad(callerUserId: string) {}\n",
  });
  const selection = folderScope("packages/server/src/domain/chat");

  // Scoped run: SILENT (the offender is outside the fence).
  expect(scopedSites(dirty, selection, "no-caller-user-id")).toEqual([]);
  // Full run: CATCHES it — proving the fixture genuinely violates, the scoped silence is isolation not luck.
  expect(fullSites(dirty, "no-caller-user-id")).toEqual([`${OUT_OF_SCOPE_VIOLATION}:1`]);
});

// ── 3. WHOLE-PROJECT-SAFETY ───────────────────────────────────────────────────────────────────────
// bus-producer-coverage FIRES when a CHAT_BUS_EVENT_TYPES member has no server emit site. On the full run it bites;
// on a scoped run it is a whole-project gate → DEFERRED, never run → zero findings (even though the firing
// condition is present in the project).
const BUS_FIRING_TREE: Readonly<Record<string, string>> = {
  "packages/contracts/src/chat/bus.ts": 'export const CHAT_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
  "packages/server/src/domain/chat/x.ts": 'export const q = "somethingElse";\n',
};

test("whole-project-safety: a whole-project ratchet fires on the FULL run", () => {
  // Establish the firing condition is real: the full run RED with the missing-emit finding.
  const base = baseFor(BUS_FIRING_TREE);
  expect(fullSites(base, "bus-producer-coverage")).toHaveLength(1);
});

test("whole-project-safety: on a scoped run the whole-project ratchet is DEFERRED — zero findings", () => {
  const base = baseFor(BUS_FIRING_TREE);
  const selection = folderScope("packages/contracts/src/chat");
  const { pass, deferred } = runScopedPass([noCallerUserIdGate, busProducerCoverageGate], base, selection);

  // bus-producer-coverage did NOT run (it is in the deferred list), so it contributed zero findings...
  expect(deferred.map((g) => g.name)).toContain("bus-producer-coverage");
  expect(pass.gates.some((g) => g.name === "bus-producer-coverage")).toBe(false);
  // ...and the scoped run is clean despite the firing condition being present in the project.
  expect(scopedSites(base, selection, "bus-producer-coverage")).toEqual([]);
});

// ── 4. STALE-ARM ISOLATION (#505) ──────────────────────────────────────────────────────────────────
// The permanent pin for a LYING INSTRUMENT. An incremental-safe gate DOES run on a scoped pass, including
// its `finalize` — where every path-keyed exemption table sweeps for stale rows, guarded on a REAL-TREE
// ANCHOR (GATE-AUTHORING.md §4.5). `fileLoaded` used to answer that guard from `ctx.project`, and a scoped
// run builds the FULL workspace Project and narrows only the FILESET — so the anchor read as present, the
// sweep ran over rows whose files the run never visited, and every live exemption reported itself stale.
// Measured on the real tree before the fix (`--scope packages/ui/src/primitives/button`, 3 files): six
// false stale findings, which issue #505 was filed to "prune" — all six covering live violations.
//
// The three cases below are the whole contract: the arm must BITE at project scope (else the pin proves
// nothing), stay SILENT at project scope when the rows are live, and stay silent on a scoped run whose
// fileset excludes the rows' files.
const MEMO = 'import { useMemo } from "react";\nexport const v = useMemo(() => 1, []);\n';
const MEMO_ANCHOR = "packages/db/src/schema/index.ts";
const MEMO_EXEMPTED: Readonly<Record<string, string>> = {
  "packages/ui/src/fuzzy-search/fuzzy-search.ts": MEMO,
  "packages/ui/src/primitives/media-grid/media-grid.tsx": MEMO,
  "packages/ui/src/primitives/message-list/message-list.tsx": MEMO,
};
/** The scoped folder: in the gate's scanRoot, and NOT any exemption row's path. */
const MEMO_SCOPE_FOLDER = "packages/ui/src/primitives/button";

// The real memo policy has converted; this fixture keeps the legacy runner's #505
// fileLoaded contract independently testable until that runner itself retires.
const seenMemoRows = new Set<string>();
const staleScopeGate: GateDescriptor = {
  name: "test-stale-scope",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "stale row",
  scanRoot: (path) => path.includes("packages/ui/src/"),
  begin: () => {
    seenMemoRows.clear();
  },
  visitFile: (source) => {
    if (source.getFullText().includes("useMemo")) {
      seenMemoRows.add(source.getFilePath().slice(ROOT.length + 1));
    }
  },
  finalize: (ctx) => {
    if (!fileLoaded(ctx, MEMO_ANCHOR)) {
      return;
    }
    for (const path of Object.keys(MEMO_EXEMPTED)) {
      if (!seenMemoRows.has(path)) {
        ctx.report({ file: path, line: 1, column: 1, message: `stale row: ${path}` });
      }
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

function memoStaleFindings(base: Omit<GateRunCtx, "report" | "scan">, selection?: { scope: Scope; inScope: (rel: string) => boolean }): string[] {
  const { pass } = selection === undefined ? { pass: runPass([staleScopeGate], base) } : runScopedPass([staleScopeGate], base, selection);
  const findings = pass.gates.find((g) => g.name === "test-stale-scope")?.findings ?? [];
  return findings
    .filter((f) => f.message?.includes("stale row") === true)
    .map((f) => f.message ?? "")
    .sort();
}

test("stale-arm PROVE-IT-BITES: at project scope, exemption rows whose files are absent all red", () => {
  // The anchor is loaded and NOT ONE exemption path exists — staleness mode (B). Without this control the
  // two silences below would be indistinguishable from a gate whose stale arm cannot fire at all.
  const base = baseFor({ [MEMO_ANCHOR]: "export const anchor = 1;\n" });
  expect(memoStaleFindings(base)).toHaveLength(Object.keys(MEMO_EXEMPTED).length);
});

test("stale-arm: at project scope, LIVE exemption rows are silent", () => {
  const base = baseFor({ [MEMO_ANCHOR]: "export const anchor = 1;\n", ...MEMO_EXEMPTED });
  expect(memoStaleFindings(base)).toEqual([]);
});

test("stale-arm ISOLATION: a scoped run whose fileset excludes the rows' files must NOT call them stale", () => {
  // Everything is present in the PROJECT (the scoped runner always builds the full workspace); only the
  // FILESET is narrowed. Pre-fix this returned all three rows — a scoped lane was told to delete live
  // exemptions, which is a loaded gun pointed at the next real violation.
  const base = baseFor({
    [MEMO_ANCHOR]: "export const anchor = 1;\n",
    ...MEMO_EXEMPTED,
    [`${MEMO_SCOPE_FOLDER}/button.tsx`]: "export const Button = 1;\n",
  });
  expect(memoStaleFindings(base, folderScope(MEMO_SCOPE_FOLDER))).toEqual([]);
});

// ── 5. THE SELECTOR'S HONESTY (#1185) ────────────────────────────────────────────────────────────────
// The lane gate door is `cli.ts scoped --scope <dir>`, and lanes type the COMMA form for a multi-folder
// slice. Red-first on the unmodified source, measured on this tree:
//   `--scope packages/ui/src/primitives/switch,packages/ui/src/tokens` → "0 file(s) in scope", every gate
//   "✓ scanned 0/0", EXIT 0. The whole string was handed to the single-glob matcher, which matches no path
//   on any tree — so the door answered "your slice is clean" about a slice it never opened.
//
// Two properties, both proven at the CLI (the exit code IS the contract, and these assertions compile
// against the pre-fix source — they read stdout/stderr and the exit code, never the new parse):
//   A. the comma form is ACCEPTED as a UNION — adding a folder can only ADD files, never zero them out;
//   B. a selector that resolves to NO files is EXIT 2 ("nothing was checked"), never a green wall —
//      .claude/rules/gates-and-tooling.md: a bare zero is "I couldn't measure", never "it isn't there".
// The misuse arm (an empty comma segment) is the third: a typo'd scope is refused at exit 3 before any
// project is built. Every arm is a PLANTED CONTROL for the others — a fix that refused everything would
// fail A, and a fix that accepted everything would fail B and C.
const SCOPED_CLI_TIMEOUT_MS = scaledBudget(240_000);
const SCOPE_A = "packages/ui/src/primitives/switch";
const SCOPE_B = "packages/ui/src/tokens";
const IN_SCOPE_COUNT = /·\s+(\d+) file\(s\) in scope/u;

/** The `N file(s) in scope` the run printed — the tool's own count, never a re-derivation. */
function inScopeCount(stdout: string): number {
  const m = IN_SCOPE_COUNT.exec(stdout);
  if (m?.[1] === undefined) {
    throw new Error(`scoped run printed no file count — stdout was:\n${stdout}`);
  }
  return Number(m[1]);
}

test("the COMMA form is a UNION of folder globs, never a silent zero (#1185)", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli, scratch }) => {
  const files = {
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext" }, include: ["packages/**/*.ts"] }),
    [`${SCOPE_A}/switch.ts`]: "export const value = 1;\n",
    [`${SCOPE_B}/tokens.ts`]: "export const token = 1;\n",
    "tooling/src/verify/gates/fixture.ts":
      'export const gate = { name: "fixture", docRow: "test-owned", status: "active", scopeSafety: "incremental-safe", message: "fixture", visitFile() {}, mustFlag: [{ files: "export const bad = 1;", why: "fixture" }], mustPass: [{ files: "export const good = 1;", why: "fixture" }] };\n',
  };
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(scratch, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  const single = await runCli("verify", ["scoped", "--scope", SCOPE_A], { cwd: scratch, timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  const union = await runCli("verify", ["scoped", "--scope", `${SCOPE_A},${SCOPE_B}`], { cwd: scratch, timeoutMs: SCOPED_CLI_TIMEOUT_MS });

  // The single-dir control: a real, non-zero slice. Without it the union claim below proves nothing.
  expect(inScopeCount(single.stdout), "the single-dir control must scope a non-zero fileset").toBeGreaterThan(0);
  // The lie: pre-fix this was 0 with exit 0. A union can only be LARGER than one of its members.
  expect(inScopeCount(union.stdout)).toBeGreaterThan(inScopeCount(single.stdout));
  expect(union.stdout, "the header names both folders so the operator can see what was judged").toContain(SCOPE_B);
  // A verdict (0 clean / 1 violations), never the tool-error class — the run really ran.
  expect([0, 1]).toContain(union.code);
});

/** A folder that exists in no checkout — the selector resolves to zero files. */
const ABSENT_SCOPE = "packages/ui/src/primitives/no-such-primitive";

test("a selector that resolves to ZERO files exits 2 (#1185)", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped", "--scope", ABSENT_SCOPE], { timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain("scoped 0 files — nothing was checked");
  // And it must not have printed the green wall it used to: no gate report at all.
  expect(res.stdout).not.toContain("file(s) in scope");
});

test("an empty comma segment is MISUSE (exit 3), refused before any work", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped", "--scope", `${SCOPE_A},`], { timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("empty comma segment");
});

test("a DERIVED --changed set with no source file says so and stays CLEAN (#1185 stated fork)", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli }) => {
  // The other half of the empty-scope rule, and the reason it is not one rule: `--scope`/`--package`
  // ASSERT a fileset (zero means the operator was wrong → exit 2), while `--changed` DERIVES one from
  // git, where a docs-only diff legitimately holds no source file. Failing that would mint exactly the
  // false alarm this issue is about — so it prints "nothing was checked" and exits clean.
  const res = await runCli("verify", ["scoped", "--changed", "docs/Mission.md"], { timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  await expect(res).toExitWith(0);
  expect(res.stderr).toContain("scoped 0 files — nothing was checked");
  expect(res.stdout, "and no gate wall may be printed over an empty set").not.toContain("file(s) in scope");
});
