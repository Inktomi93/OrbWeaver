// SEMANTIC-MEMBER POPULATION (#946) — the planted-control proof that a coverage gate's MEMBER denominator
// is a first-class receipt, and that losing it refuses the run instead of rendering ✓.
//
// WHY EVERY CASE SPAWNS A REAL CLI OVER A PLANTED ROOT (the shape structure.int.test.ts established): the
// defect class is a gate that reports a HEALTHY FILE COUNT while judging a shrunken member set, and the
// verdict for it is produced only at the real-tree entrypoint — `runPass` deliberately does not judge it
// (a scoped run and a conformance mini-project both legitimately resolve zero members, GATE-AUTHORING §4.5).
// A planted root also keeps each case ~1s: the corpus under it is the planted gate, not the real 247.
//
// The controls are the things the receipt has to get right, and each is the direct counterfactual
// of the next: a HEALTHY nonzero population is a verdict; a ZERO population is not; an UNRESOLVED
// declaration beside healthy members is not; and a population deliberately SHRUNK by moving a member behind
// an authoring shape the gate cannot read is not — that last one is the audited defect itself, reproduced.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Every case SPAWNS the real `verify` CLI over a planted root (a real `node` boot + workspace import), so
// the per-test cost is real work, not artificial per-test waste — measured 2.1-8.7s even on a near-quiet
// box (per-core 0.93, no contention scaling in force), well past vitest's 5s DEFAULT (#1248). Declared
// explicitly so this file never depends on inheriting the ambient default.
vi.setConfig({ testTimeout: scaledBudget(20_000), hookTimeout: scaledBudget(20_000) });

const GATE_DIR = "tooling/src/verify/gates";
/** The file the planted gates scan — without it every planted run trips the ZERO-SCAN alarm instead, which
 *  is a different refusal and would make these cases pass for the wrong reason. */
const SCANNED = { "packages/x/src/y.ts": "export const y = 1;\nexport const z = 2;\n" };

/** A planted gate that COUNTS its members by walking the planted PRODUCT files' declarations and declares
 *  the population through the new contract. `members`/`unresolved` are computed, never hardcoded, so each
 *  control below changes the TREE and the receipt follows — the same relationship a real gate has.
 *  (The bodies skip `/tooling/`: the gate module the fixture writes is itself in the walked project and
 *  its own descriptor is an object literal, so an unfenced count would include the counter.) */
function populationGate(name: string, body: string): string {
  return `export const gate = {
  name: ${JSON.stringify(name)},
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "whole-project",
  message: "the planted population control gate — see tooling/src/verify/contract/gate.ts GatePopulationDeclaration",
  scanRoot: () => true,
  visitFile: () => undefined,
  run: (ctx) => {
${body}
  },
  mustFlag: [{ files: "export const a = 1;\\n" }],
  mustPass: [{ files: "export const b = 1;\\n" }],
};
`;
}

interface ReportView {
  readonly ok: boolean;
  readonly populationAlarms: readonly {
    readonly gate: string;
    readonly source: string;
    readonly reason: string;
    readonly members: number;
    readonly unresolved: number;
  }[];
  readonly gates: readonly {
    readonly name: string;
    readonly scan: { readonly populations: readonly { readonly source: string; readonly members: number; readonly unresolved: number }[] };
  }[];
}

function report(root: string): ReportView {
  return JSON.parse(readFileSync(join(root, "reports", "check-structure.json"), "utf8")) as ReportView;
}

// ── control 1: a HEALTHY nonzero population is a verdict, and it reaches console + artifact ─────────────

test("a nonzero member population rides the gate's line and the artifact, and stays clean", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-population.ts`]: populationGate(
      "planted-population",
      `    const members = ctx.project
      .getSourceFiles()
      .filter((sf) => !sf.getFilePath().includes("/tooling/"))
      .flatMap((sf) => sf.getVariableDeclarations()).length;
    ctx.scan({ population: [{ source: "PlantedMember", members }] });`,
    ),
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(0);
  expect(res.stdout).toContain("PlantedMember: 2 member(s)");
  const view = report(root);
  expect(view.ok).toBe(true);
  expect(view.populationAlarms).toEqual([]);
  expect(view.gates.find((g) => g.name === "planted-population")?.scan.populations).toEqual([{ source: "PlantedMember", members: 2, unresolved: 0 }]);
});

// ── control 2: a ZERO population is NOT a verdict, even with a healthy file count ────────────────────────

test("a declared population that resolved ZERO members refuses the run — exit 2, never a ✓", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    // The gate SCANS fine (1/1 files) — only its member derivation came back empty. That combination is
    // exactly the audited escape: a healthy denominator hiding an empty one.
    [`${GATE_DIR}/planted-empty.ts`]: populationGate("planted-empty", `    ctx.scan({ population: [{ source: "PlantedMember", members: 0 }] });`),
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(2);
  expect(res.stdout).toContain("resolved ZERO members");
  expect(res.stdout).toContain("NOT a clean verdict");
  const view = report(root);
  expect(view.ok).toBe(false);
  expect(view.populationAlarms).toEqual([{ gate: "planted-empty", source: "PlantedMember", reason: "empty", members: 0, unresolved: 0 }]);
  // The read-the-artifact surface must show it too — a signal missing from `show` is a signal nobody sees.
  const shown = await runCli("verify", ["show"], { cwd: root });
  expect(shown.code).toBe(2);
  expect(shown.stdout).toContain("REFUSED POPULATION");
});

// ── control 3: an UNRESOLVED source beside healthy members is denominator LOSS ───────────────────────────

test("an unresolved declaration beside resolved members refuses the run — a shrinking denominator is loud", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-unresolved.ts`]: populationGate(
      "planted-unresolved",
      `    ctx.scan({ population: [{ source: "PlantedMember", members: 5, unresolved: 1 }] });`,
    ),
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(2);
  expect(res.stdout).toContain("UNRESOLVED");
  expect(res.stdout).toContain("PlantedMember: 5 member(s), 1 UNRESOLVED");
  expect(report(root).populationAlarms).toEqual([{ gate: "planted-unresolved", source: "PlantedMember", reason: "unresolved", members: 5, unresolved: 1 }]);
});

// ── control 4: a DELIBERATELY SHRUNKEN population — the audited defect, reproduced end to end ────────────

test("moving a member behind an unreadable authoring shape shrinks the population and refuses the run", async ({ plantedTree, runCli }) => {
  // The gate's members are the object-literal `const`s it can READ; a declaration initialised from an
  // imported identifier is counted `unresolved`. Same gate, same file count, one member moved: before this
  // receipt existed, the tree below and a tree with both literals were INDISTINGUISHABLE from the outside.
  const shrinkGate = populationGate(
    "planted-shrink",
    `    let members = 0;
    let unresolved = 0;
    for (const sf of ctx.project.getSourceFiles()) {
      if (sf.getFilePath().includes("/tooling/")) {
        continue;
      }
      for (const decl of sf.getVariableDeclarations()) {
        const init = decl.getInitializer();
        if (init !== undefined && init.getKindName() === "ObjectLiteralExpression") {
          members += 1;
        } else {
          unresolved += 1;
        }
      }
    }
    ctx.scan({ population: [{ source: "PlantedMember", members, unresolved }] });`,
  );
  const healthy = await plantedTree({
    "packages/x/src/y.ts": "export const a = { id: 1 };\nexport const b = { id: 2 };\n",
    [`${GATE_DIR}/planted-shrink.ts`]: shrinkGate,
  });
  const before = await runCli("verify", ["structure"], { cwd: healthy });
  expect(before.code).toBe(0);
  expect(before.stdout).toContain("PlantedMember: 2 member(s)");

  const shrunk = await plantedTree({
    "packages/x/src/imported.ts": "export const bDef = { id: 2 };\n",
    "packages/x/src/y.ts": 'import { bDef } from "./imported.ts";\nexport const a = { id: 1 };\nexport const b = bDef;\n',
    [`${GATE_DIR}/planted-shrink.ts`]: shrinkGate,
  });
  const after = await runCli("verify", ["structure"], { cwd: shrunk });
  // The FILE count went UP (an extra module) while the judged member set went DOWN. That divergence is the
  // whole point: file health is not member health.
  expect(after.code).toBe(2);
  expect(after.stdout).toContain("PlantedMember: 2 member(s), 1 UNRESOLVED");
  expect(report(shrunk).populationAlarms.map((a) => a.reason)).toEqual(["unresolved"]);
});

// ── control 5: the ASYMMETRY — a gate that already REPORTED the unreadable declaration is not double-hit ─

test("an unresolved declaration the gate already REPORTED rides the violation exit, not the instrument one", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    // Same `unresolved: 1` as control 3, but the gate also emits the fail-closed FINDING — the #944 shape.
    // One cause must not produce both a violation and a "the checker is broken" verdict; the count still
    // prints on the gate's line as the receipt, so nothing is hidden.
    [`${GATE_DIR}/planted-reported.ts`]: populationGate(
      "planted-reported",
      `    ctx.report({ file: "packages/x/src/y.ts", line: 1, column: 0, message: "planted fail-closed finding" });
    ctx.scan({ population: [{ source: "PlantedMember", members: 5, unresolved: 1 }] });`,
    ),
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(1); // a VIOLATION, never exit-2
  expect(res.stdout).toContain("PlantedMember: 5 member(s), 1 UNRESOLVED");
  expect(res.stdout).not.toContain("REFUSED POPULATION");
  expect(report(root).populationAlarms).toEqual([]);
});

// ── the NEGATIVE control for the whole mechanism: an ordinary gate is untouched ──────────────────────────

test("a gate that declares NO population is unaffected — no alarm, no population block, still a verdict", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-plain.ts`]: populationGate("planted-plain", "    return;"),
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(0);
  expect(res.stdout).not.toContain("member(s)");
  const view = report(root);
  expect(view.populationAlarms).toEqual([]);
  expect(view.gates.find((g) => g.name === "planted-plain")?.scan.populations).toEqual([]);
});
