// The SCOPED-RUN proof net (TSMORPH-SINGLE-PASS-AUDIT.md §4, the driven-for-real deliverable). The scoped
// runner (scripts/check/scoped.ts) runs ONLY the incremental-safe gates over a subset of the tree and
// DEFERS every whole-project gate. Three properties, each proven the parity-guard-divergence way — the
// test introduces the exact divergence, confirms the expected RED/silent, then the fixture is restored to
// its clean shape so the assertion has teeth (a green it can be SHOWN going red):
//
//   1. SUBSET-CORRECTNESS — an incremental-safe violation INSIDE the scoped folder is reported by the
//      scoped run AND by the full run, for that exact file. Remove the violation → both go clean.
//   2. SCOPE-ISOLATION — a violation OUTSIDE the scoped folder is INVISIBLE to the scoped run but caught
//      by the full run. It is the fence's whole point: a scoped clean is only a claim about the scope.
//   3. WHOLE-PROJECT-SAFETY — a whole-project ratchet (bus-coverage) that FIRES on the full tree does NOT
//      fire on a scoped run: it is deferred, never run, so it emits zero findings.
//
// The "full run" oracle here is `runPass` over the SAME in-memory project with scope=project — the exact
// path `pnpm check:structure` drives — so the scoped verdict is proven against the real full verdict, not
// a hand-rolled expectation.
import { Project } from "ts-morph";
import type { GateRunCtx, Scope } from "../../scripts/check/contract.ts";
import { gate as busCoverageGate } from "../../scripts/check/gates/bus-coverage.ts";
import { gate as noCallerUserIdGate } from "../../scripts/check/gates/no-caller-user-id.ts";
import { runPass } from "../../scripts/check/pass.ts";
import { runScopedPass } from "../../scripts/check/scoped.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = "/repo";

function project(files: Readonly<Record<string, string>>): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    p.createSourceFile(`${ROOT}/${rel}`, text);
  }
  return p;
}

/** A `projectCtx`-shaped base over an in-memory project (the CLI builds the real disk one). */
function baseFor(files: Readonly<Record<string, string>>): Omit<GateRunCtx, "report"> {
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
function fullSites(base: Omit<GateRunCtx, "report">, gateName: string): string[] {
  const result = runPass(
    [noCallerUserIdGate, busCoverageGate].filter((g) => g.name === gateName),
    base,
  );
  const findings = result.gates.find((g) => g.name === gateName)?.findings ?? [];
  return findings.map((f) => `${f.file}:${f.line}`).sort();
}

/** The scoped-run site set for one gate. */
function scopedSites(base: Omit<GateRunCtx, "report">, selection: { scope: Scope; inScope: (rel: string) => boolean }, gateName: string): string[] {
  const { pass } = runScopedPass([noCallerUserIdGate, busCoverageGate], base, selection);
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
// bus-coverage FIRES when a CHAT_BUS_EVENT_TYPES member has no server emit site. On the full run it bites;
// on a scoped run it is a whole-project gate → DEFERRED, never run → zero findings (even though the firing
// condition is present in the project).
const BUS_FIRING_TREE: Readonly<Record<string, string>> = {
  "packages/contracts/src/chat/bus.ts": 'export const CHAT_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
  "packages/server/src/domain/chat/x.ts": 'export const q = "somethingElse";\n',
};

test("whole-project-safety: a whole-project ratchet fires on the FULL run", () => {
  // Establish the firing condition is real: the full run RED with the missing-emit finding.
  const base = baseFor(BUS_FIRING_TREE);
  expect(fullSites(base, "bus-coverage")).toHaveLength(1);
});

test("whole-project-safety: on a scoped run the whole-project ratchet is DEFERRED — zero findings", () => {
  const base = baseFor(BUS_FIRING_TREE);
  const selection = folderScope("packages/contracts/src/chat");
  const { pass, deferred } = runScopedPass([noCallerUserIdGate, busCoverageGate], base, selection);

  // bus-coverage did NOT run (it is in the deferred list), so it contributed zero findings...
  expect(deferred.map((g) => g.name)).toContain("bus-coverage");
  expect(pass.gates.some((g) => g.name === "bus-coverage")).toBe(false);
  // ...and the scoped run is clean despite the firing condition being present in the project.
  expect(scopedSites(base, selection, "bus-coverage")).toEqual([]);
});
