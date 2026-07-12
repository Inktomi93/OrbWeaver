// CT: the first-run import onboarding card (features/settings/surfaces/import-onboarding-surface). Drives
// the freshness gate + dismiss: a fresh account (empty `chat.listChats`) sees the card; a returning account
// (any chats) never does; Dismiss and Upload both hide it (Upload additionally deep-links to Settings →
// Backup & Restore via the shell store, exercised end-to-end by the backup + shell CTs). The dismiss is
// device-local (localStorage) — cleared before each test so the persisted latch can't leak across cases.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ImportOnboardingCardNarrowStory, ImportOnboardingCardStory } from "../_ct-stories";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      globalThis.localStorage?.removeItem("orb:import-onboarding");
    } catch {
      // no storage in this context — nothing to clear
    }
  });
});

test("a FRESH account (no chats) sees the card with its Upload + Dismiss affordances", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.listChats": () => [] });
  await mount(<ImportOnboardingCardStory />);

  await expect(page.getByTestId("import-onboarding-card")).toBeVisible();
  await expect(page.getByText("Bring your SillyTavern stuff over")).toBeVisible();
  await expect(page.getByTestId("import-onboarding-upload")).toBeVisible();
  await expect(page.getByTestId("import-onboarding-dismiss")).toBeVisible();
});

test("at 375px the buttons STACK below the text (no mid-paragraph float, no horizontal overflow)", async ({
  mount,
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await routeTrpc(page, { "chat.listChats": () => [] });
  await mount(<ImportOnboardingCardNarrowStory />);

  const card = page.getByTestId("import-onboarding-card");
  await expect(card).toBeVisible();

  const description = page.getByText("Upload your ST export zip", { exact: false });
  const upload = page.getByTestId("import-onboarding-upload");
  const descBox = await description.boundingBox();
  const uploadBox = await upload.boundingBox();
  if (descBox === null || uploadBox === null) {
    throw new Error("expected the description and upload button to be laid out");
  }
  // Collapsed to a column: the Upload button's top edge sits BELOW the description's bottom edge (it is not
  // floating beside/mid-paragraph). A row layout would put them vertically overlapping.
  expect(uploadBox.y).toBeGreaterThanOrEqual(descBox.y + descBox.height - 1);

  // No horizontal overflow: the card fits within the 375px viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflow).toBe(true);
});

test("a RETURNING account (has chats) never sees the card", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": () => [
      { id: "chat_ct_1", title: "A thread", participantNames: [], updatedAt: 0, lastMessageAt: 0 },
    ],
  });
  await mount(<ImportOnboardingCardStory />);

  await expect(page.getByTestId("import-onboarding-card")).toHaveCount(0);
});

test("Dismiss hides the card", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": () => [] });
  await mount(<ImportOnboardingCardStory />);

  await expect(page.getByTestId("import-onboarding-card")).toBeVisible();
  await page.getByTestId("import-onboarding-dismiss").click();
  await expect(page.getByTestId("import-onboarding-card")).toHaveCount(0);
});
