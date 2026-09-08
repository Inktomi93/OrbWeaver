// The standing conformance net (TSMORPH-SINGLE-PASS-AUDIT.md §1.6): every contract-form gate's
// mustFlag/mustPass examples are run through the SAME dispatcher over in-memory example projects. A
// gate whose predicate rots (a refactor that makes it match nothing) goes RED here the same day — the
// break-RED-restore ritual made permanent and always-run. A conformance failure means the CHECKER is
// wrong, so `verifyGateProofs` returning any failure fails this test loudly.
//
// During the migration this covers only the ported gates (currently `no-off-token-radius-shadow`); each
// future port adds its proofs to its descriptor and this net verifies them with no per-gate test file.
import { join } from "node:path";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../tooling/src/verify/contract/gate.ts";
import { gate as evaluateGate } from "../../tooling/src/verify/gates/evaluate-no-scope-capture.ts";
import { gate as wireVocabGate } from "../../tooling/src/verify/gates/wire-schema-vocab-one-home.ts";
import { loadGates, verifyGateProofs } from "../../tooling/src/verify/index.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const VROOT = "/repo";

function withMustFlag(gate: GateDescriptor, example: GateExample): GateDescriptor {
  return { ...gate, mustFlag: [example], mustPass: [] };
}

function passFor(gate: GateDescriptor, source: string): ReturnType<typeof runPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(`${VROOT}/tooling/src/snap/ops/probe.ts`, source);
  return runPass([gate], {
    root: VROOT,
    project,
    scope: { kind: "project" },
    files: [file],
    checker: () => project.getTypeChecker(),
  });
}

// LOAD-HONEST BUDGET (#606). `verifyGateProofs` runs the WHOLE gate corpus's mustFlag/mustPass examples
// in-process (~21s solo) — pure CPU, no child process to hang a legible timeout on, so the honest lever here
// is a budget that SCALES with contention rather than a fixed 30s that false-times-out under multi-lane load
// (it timed out twice this way). Solo (factor 1) → 45s, above the ~21s measured runtime, so solo is
// unchanged; a saturated box scales it up so the run finishes instead of dying as an opaque timeout that
// reads like a real conformance red.
const CONFORMANCE_BUDGET = scaledBudget(45_000, 4);

test("the loader discovers at least the ported worked-example gate", async () => {
  const gates = await loadGates(ROOT);
  const names = gates.map((g) => g.name);
  expect(names).toContain("no-off-token-radius-shadow");
});

test(
  "every contract-form gate's mustFlag/mustPass proofs hold (standing bite-proof)",
  async () => {
    const gates = await loadGates(ROOT);
    const failures = verifyGateProofs(gates);
    // A non-empty failure list is the checker telling you a gate stopped biting (or started over-biting).
    expect(failures).toEqual([]);
  },
  CONFORMANCE_BUDGET,
);

test("a crashing mustPass proof is a conformance failure, never a clean proof", () => {
  const crashingGate: GateDescriptor = {
    name: "crashing-proof",
    docRow: "test fixture",
    status: "active",
    scopeSafety: "whole-project",
    message: "test fixture",
    run: () => {
      throw new Error("planted checker crash");
    },
    mustFlag: [],
    mustPass: [{ files: "export const legal = true;", why: "a crash cannot prove this legal example" }],
  };

  expect(verifyGateProofs([crashingGate])).toEqual([
    expect.objectContaining({
      gate: "crashing-proof",
      arm: "mustPass",
      detail: expect.stringContaining("planted checker crash"),
    }),
  ]);
});

test("wire vocabulary evidence missing its engine fails closed", () => {
  const failures = verifyGateProofs([
    withMustFlag(wireVocabGate, {
      files: { "packages/server/src/infra/providers/backends/x/schema.ts": 'export const DROP = ["title", "default"];\n' },
      why: "the vocabulary engine is missing, so a clean comparison is impossible",
    }),
  ]);
  expect(failures).toEqual([]);
});

test("an unresolved runtime identifier in a browser callback is a tool error", () => {
  const result = passFor(
    evaluateGate,
    "async function run(page: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> { await page.evaluate(() => missingRuntime()); }\n",
  );
  expect(result.toolErrors).toEqual([
    expect.objectContaining({ gate: "evaluate-no-scope-capture", phase: "finalize", message: expect.stringContaining("missingRuntime") }),
  ]);
});

test("the built-in undefined value is resolved without weakening arbitrary-identifier fail-loud", () => {
  const builtIn = passFor(
    evaluateGate,
    "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> { return await page.evaluate(() => document.title !== undefined); }\n",
  );
  const unresolved = passFor(
    evaluateGate,
    "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> { return await page.evaluate(() => document.title !== userSentinel); }\n",
  );

  expect(builtIn.toolErrors).toEqual([]);
  expect(unresolved.toolErrors).toEqual([
    expect.objectContaining({ gate: "evaluate-no-scope-capture", phase: "finalize", message: expect.stringContaining("userSentinel") }),
  ]);
});

test("a self-contained browser callback remains a clean, resolved control", () => {
  const result = passFor(
    evaluateGate,
    "async function run(page: { evaluate: (fn: unknown) => Promise<number> }): Promise<number> { return await page.evaluate(() => document.title.length); }\n",
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.gates[0]?.findings).toEqual([]);
});
