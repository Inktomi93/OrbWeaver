// CT: the Avatars appearance SECTION (SET-SEAMS stage 1) — a chat-owned section of the decomposed
// appearance pane. P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the five avatar keys.
// The expected key set is re-spelled here on purpose (importing the section's `OWNS` tuple would make the
// test agree with the code by construction).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AppearanceAvatarsSectionStory } from "../_ct-stories";

const SETTINGS_VIEW = { userId: "user_ct_avatars", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["avatarAspect", "avatarRing", "avatarShape", "avatarSize", "showInChatAvatars"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceAvatarsSectionStory />);
  await expect(page.getByRole("heading", { name: "Avatars" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Avatar size" })).toContainText("Medium");
});

test("avatar size/shape/aspect/ring each patch their key, and the payload stays key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceAvatarsSectionStory />);

  await page.getByRole("combobox", { name: "Avatar size" }).click();
  await page.getByRole("option", { name: "Large" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarSize"], { intervals: [20, 50, 100] }).toBe("lg");

  await page.getByRole("combobox", { name: "Avatar shape" }).click();
  await page.getByRole("option", { name: "Square", exact: true }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarShape"], { intervals: [20, 50, 100] }).toBe("square");

  await page.getByRole("combobox", { name: "Avatar aspect" }).click();
  await page.getByRole("option", { name: "Portrait (2:3)" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarAspect"], { intervals: [20, 50, 100] }).toBe("portrait");

  await page.getByRole("combobox", { name: "Avatar ring" }).click();
  await page.getByRole("option", { name: "Accent" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarRing"], { intervals: [20, 50, 100] }).toBe("accent");

  // The settled patch holds every OWNED field (the autosave listener submits the whole SECTION value) and
  // nothing else — P1: five keys, not the 41-key appearance blob.
  await expect
    .poll(() => lastPatch(trpc), { intervals: [20, 50, 100] })
    .toMatchObject({ avatarSize: "lg", avatarShape: "square", avatarAspect: "portrait", avatarRing: "accent" });
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("the show-avatars switch patches showInChatAvatars, still key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceAvatarsSectionStory />);
  await page.getByRole("switch", { name: "Show avatars in chat" }).click();

  await expect.poll(() => lastPatch(trpc)?.["showInChatAvatars"], { intervals: [20, 50, 100] }).toBe(false);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
