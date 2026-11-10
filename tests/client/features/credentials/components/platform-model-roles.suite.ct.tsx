// Model roles reads as one short row per role: the explanation sits behind an info control a keyboard reaches, the picker sizes to its
// value, and the Utility preset belongs to the Utility role's group. The rows hold at 200% text.

import { ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { enlargedTextFindings as findings, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

const STORY = "tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory";
const HINT = '[data-slot="hint-trigger"]';
const HINT_POPUP = '[data-slot="hint-popup"]';
const TEXT_200 = 2;
// A picker narrower than this share of its role's group is sized to its value, not stretched across the row.
const HUG_SHARE = 0.75;

function roleOf(task: "chat" | "summarize"): (typeof ROLE_ROWS_ORDERED)[number] {
  const row = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === task);
  if (row === undefined) {
    throw new Error(`Model roles carries no ${task} row`);
  }
  return row;
}

async function serveRoles(page: Page, corpus: CorpusPlayback, root: ServerTestHarness): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "search.spaceStatus",
      "workloads.list",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "preset.list",
    ]),
  });
}

for (const device of [
  { label: "desktop", width: 1440, height: 900, coarse: false },
  { label: "phone", width: 390, height: 844, coarse: true },
] as const) {
  test.describe(device.label, () => {
    test.use({ hasTouch: device.coarse, isMobile: device.coarse, viewport: { width: device.width, height: device.height } });

    test("each role keeps its explanation behind an info control that a keyboard opens", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      for (const row of ROLE_ROWS_ORDERED) {
        const group = page.getByRole("group", { name: row.heading, exact: true });
        await expect(group.locator(HINT).first()).toHaveAccessibleDescription(row.description);
      }
      await expect(page.locator(HINT_POPUP)).toHaveCount(0);
      const first = ROLE_ROWS_ORDERED[0];
      if (first === undefined) {
        throw new Error("Model roles carries no rows");
      }
      await page.keyboard.press("Tab");
      await expect(page.getByRole("group", { name: first.heading, exact: true }).locator(HINT).first()).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator(HINT_POPUP)).toContainText(first.description);
    });

    test("the Utility preset sits inside the Utility group", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      const utility = page.getByRole("group", { name: roleOf("summarize").heading, exact: true });
      const chat = page.getByRole("group", { name: roleOf("chat").heading, exact: true });
      await expect(utility.getByRole("combobox")).toHaveCount(2);
      await expect(chat.getByRole("combobox")).toHaveCount(1);
    });

    test("the rows hold at 200% text", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      await setRootFontScale(page, channelName("fontScale"), TEXT_200);
      await expect(page.getByRole("group", { name: roleOf("summarize").heading, exact: true })).toBeVisible();
      await expect.poll(() => findings(page.locator("body"))).toEqual([]);
    });
  });
}

test.describe("desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a role's picker sizes to its value and shares the row of its heading", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveRoles(page, corpus, root);
    await mount<typeof ModelRolesStory>(STORY, {});
    const chat = page.getByRole("group", { name: roleOf("chat").heading, exact: true });
    const picker = await chat.getByRole("combobox").boundingBox();
    const hint = await chat.locator(HINT).first().boundingBox();
    if (picker === null || hint === null) {
      throw new Error("The Chat role painted no picker or hint");
    }
    const group = await chat.boundingBox();
    if (group === null) {
      throw new Error("The Chat role painted no box");
    }
    expect(picker.y).toBeLessThan(hint.y + hint.height);
    expect(picker.width).toBeLessThan(group.width * HUG_SHARE);
  });
});
