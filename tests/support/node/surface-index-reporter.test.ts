import { expect, test } from "vitest";
import { auditSurfaceInventory } from "../iso/surface-coverage.ts";
import { surfaceSkipLines, surfaceUnendedLines } from "./surface-index-reporter.ts";

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

test("the walk report names the case a stop caught in progress apart from the cases that never started", () => {
  const project = "desktop-1440-all-panes-evidence";
  const titlePath = (title: string): readonly string[] => ["", project, "corpus-surface-walk.spec.ts", "production surface walk @surface-walk", title];
  const caught = { titlePath: titlePath("Config independent category chat-behavior"), project, stepFile: "/run/agent-cases/30.steps.jsonl" };
  const lines = surfaceUnendedLines([caught], [{ titlePath: titlePath("Rail independent presets") }]);
  const [inProgress, unstarted] = lines;
  expect(lines).toHaveLength(2);
  expect(inProgress).toContain(caught.titlePath.join(" / "));
  expect(inProgress).toContain(`--project=${project} -g "production surface walk @surface-walk Config independent category chat-behavior$"`);
  expect(inProgress).toContain(caught.stepFile);
  expect(unstarted).toContain("Rail independent presets");
  expect(unstarted).not.toContain("chat-behavior");
});
