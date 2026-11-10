// @subject packages/ui/src/primitives/log-viewer/log-viewer.tsx
// Two logs on one surface are two named regions, each with its own copy control.
import { copyActionName } from "@orb/ui/lib";
import { expect, test } from "@playwright/test";
import type { NamedLogsStory } from "./_named-logs-stories.tsx";

const STORY = "tests/ui/primitives/log-viewer/_named-logs-stories/NamedLogsStory";
const SUBJECTS = ["Static prefix", "Dynamic suffix"] as const;

test("each log that states its subject is a region of that name with its own copy control", async ({ mount, page }) => {
  await mount<typeof NamedLogsStory>(STORY, { subjects: SUBJECTS });
  await expect(page.getByRole("log"), "the subjectless log is the third region").toHaveCount(3);
  for (const subject of SUBJECTS) {
    await expect(page.getByRole("log", { name: subject, exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: copyActionName(subject), exact: true })).toHaveCount(1);
  }
});
