import { readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { attachNativeFile } from "@orb/testkit/node/helpers";
import { expect, test } from "@playwright/test";
import type { CommandSelectionCensusStory } from "./_selection-census-stories.tsx";

test("actual Command false-string selections are judged while a genuinely all-selected fault stays withheld", async ({ mount, page }, info) => {
  await mount<typeof CommandSelectionCensusStory>("tests/ui/primitives/command/_selection-census-stories/CommandSelectionCensusStory");
  const options = page.getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
  await expect(page.getByRole("option", { selected: false })).toHaveCount(2);
  await expect(page.getByRole("option", { name: "Beta", exact: true })).toHaveAttribute("data-selected", "false");
  const healthy = await readSurfaceDesignAudit(page);
  await attachNativeFile(info, info, "command-selection-healthy", { body: JSON.stringify(healthy, null, 2), contentType: "application/json" });
  expect(healthy.samples.relationalAccounting?.["selection-idiom"]).toMatchObject({ candidates: 1, judged: 1, withheld: {} });

  // Plant the missing comparison on the actual carriers, not by hiding their unselected twins.
  await options.evaluateAll((nodes) => {
    for (const node of nodes) {
      node.setAttribute("aria-selected", "true");
      node.setAttribute("data-selected", "true");
    }
  });
  await expect(page.getByRole("option", { selected: true })).toHaveCount(3);
  const fault = await readSurfaceDesignAudit(page);
  await attachNativeFile(info, info, "command-selection-all-chosen-fault", { body: JSON.stringify(fault, null, 2), contentType: "application/json" });
  expect(fault.samples.relationalAccounting?.["selection-idiom"]).toMatchObject({ candidates: 1, judged: 0, withheld: { unmatchedSelected: 1 } });
  expect(fault.samples.relationalAccounting?.["selection-idiom"]?.withheldSubjects?.["unmatchedSelected"]?.join(" ")).toContain("(3 of 3 chosen)");
  expect(fault.gaps.some(({ detail }) => detail.includes("selection-idiom"))).toBe(true);
});
