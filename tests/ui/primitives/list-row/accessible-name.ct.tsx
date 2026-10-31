// A clickable row is named by its visible title (WCAG 2.5.3) and described by the lines under it. axe's
// label-content-name-mismatch counts the described lines as label text; this case holds the split itself and attaches the raw scan.
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { attachNativeFile } from "@orb/testkit/node/helpers";
import { expect, test } from "@playwright/test";
import type { AccessibleNameRowStory } from "./_accessible-name-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_accessible-name-stories/AccessibleNameRowStory";
const ROW = { title: "Ledger of ashes", titleQualifier: "Tuesday", subtitle: "Opened by the archivist", meta: "3 pages" } as const;

test("the row's name carries every word of its title line and its description carries the lines under it", async ({ mount, page }, testInfo) => {
  await mount<typeof AccessibleNameRowStory>(STORY, ROW);
  const row = page.getByRole("button");
  const title = row.getByText(ROW.title, { exact: true });
  await expect(title).toBeVisible();
  await expect(row).toHaveAccessibleName(new RegExp(`${ROW.title}.*${ROW.titleQualifier}`, "u"));
  await expect(row).toHaveAccessibleDescription(new RegExp(`${ROW.subtitle}.*${ROW.meta}|${ROW.meta}.*${ROW.subtitle}`, "u"));
  await expect(row).not.toHaveAccessibleName(new RegExp(ROW.subtitle, "u"));
  const result = await accessibilityScan(page);
  await attachNativeFile(testInfo, testInfo, "vendor-axe-list-row.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
});
