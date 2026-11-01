import { expect, test } from "vitest";
import { auditSurfaceInventory } from "../iso/surface-coverage.ts";
import { surfaceSkipLines } from "./surface-index-reporter.ts";

const leaf = (index: number): { readonly id: string; readonly kind: string } => ({ id: `presets/menu-0/leaf-${String(index)}`, kind: "menu-leaf" });

test("the walk report lists every skipped leaf once and counts each reason", () => {
  const audit = auditSurfaceInventory({
    name: "presets",
    expected: [leaf(0), leaf(1), leaf(2)],
    observations: [
      { ...leaf(0), disposition: "skipped", skip: "not-activated", reason: "Rename read, not run" },
      { ...leaf(1), disposition: "skipped", skip: "not-activated", reason: "Delete read, not run" },
      { ...leaf(2), disposition: "skipped", skip: "disabled", reason: "Export disabled" },
      { ...leaf(0), disposition: "skipped", skip: "not-activated", reason: "Rename read again" },
    ],
  });
  const lines = surfaceSkipLines([audit]);
  expect(lines[0]).toContain("3");
  expect(lines[0]).toContain("not-activated=2");
  expect(lines[0]).toContain("disabled=1");
  for (const index of [0, 1, 2]) {
    expect(lines.filter((line) => line.includes(leaf(index).id))).toHaveLength(1);
  }
});

test("the walk report names a skip without a listed reason", () => {
  const audit = auditSurfaceInventory({
    name: "presets",
    expected: [leaf(0)],
    observations: [{ ...leaf(0), disposition: "skipped", skip: "felt-optional", reason: "Read, not run" }],
  });
  const lines = surfaceSkipLines([audit]);
  expect(lines.filter((line) => line.includes("UNLISTED") && line.includes(leaf(0).id))).toHaveLength(1);
});
