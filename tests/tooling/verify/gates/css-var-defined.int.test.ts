// #2181: the legacy disk readers must see real fixture CSS, vendor Markdown, installed declarations
// and authored TS/TSX. No policy conversion or change to the permission boundary is exercised here.
import { join } from "node:path";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/css-var-defined.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test(
  "all original variable examples and the vendor/runtime/population liveness controls hold on disk",
  () => {
    expect(verifyGateProofs([gate])).toEqual([]);
  },
  scaledBudget(30_000),
);

// An exact finding count alone cannot prove operator guidance. Drive the same committed counterexamples
// through runPass and inspect the matching emitted finding's override (or the descriptor fallback).
for (const [message, remedy] of [
  ["scanned zero custom-property definitions", "Restore the named source/definition/reference/class-root population"],
  ["measured zero Base UI mirror files", "Restore the named Base UI mirror/property/reference population"],
  ["Base UI mirror/package version mismatch", "Refresh the committed Base UI mirror"],
  ["API-table custom properties", "Reconcile the committed API-table property names"],
  ["is a Base UI runtime property this tree now uses", "review its exact EXPECTED_VENDOR_USE entry"],
  ["is an allowed Base UI runtime property no file uses", "Delete the unused EXPECTED_VENDOR_USE entry"],
  ["is set at runtime and read by this tree", "Review the live property and its exact CSSProperties writer"],
  ["is written here and no reviewed producer row names this writer", "Review this exact writer"],
  ["— delete its stale producer row or re-point it", "Delete the stale producer row or review and repoint it"],
] as const) {
  test(
    `the emitted ${message} finding gives its own actionable remedy`,
    async ({ plantedTree }) => {
      const example = gate.mustFlag.find((row) => row.expect?.messageIncludes === message);
      if (example === undefined || typeof example.files === "string") {
        throw new Error(`missing filesystem counterexample for ${message}`);
      }
      const root = await plantedTree(example.files);
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      for (const path of Object.keys(example.files)) {
        if (/\.tsx?$/u.test(path)) {
          project.addSourceFileAtPath(join(root, path));
        }
      }
      const result = runPass([gate], {
        root,
        project,
        files: project.getSourceFiles(),
        scope: { kind: "project" },
        checker: () => project.getTypeChecker(),
      });
      expect(result.toolErrors).toEqual([]);
      const findings = result.gates.find((entry) => entry.name === gate.name)?.findings;
      const finding = findings?.find((entry) => (entry.message ?? gate.message).includes(message));
      expect(finding).toBeDefined();
      expect(finding?.fix ?? gate.fix).toContain(remedy);
    },
    scaledBudget(30_000),
  );
}
