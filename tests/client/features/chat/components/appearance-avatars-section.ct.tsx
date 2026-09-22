// CT: the Avatars appearance SECTION (SET-SEAMS stage 1) — a chat-owned section of the decomposed
// appearance pane. P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the five avatar keys.
// The expected key set is re-spelled here on purpose (importing the section's `OWNS` tuple would make the
// test agree with the code by construction).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AppearanceAvatarsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_avatars", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["avatarAspect", "avatarRing", "avatarShape", "avatarSize", "showInChatAvatars"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
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

// side-eye 2026-08-16 P2: with `Show avatars in chat` OFF, all four dependent comboboxes reported
// `disabled: false` and were fully interactive — setting Avatar size to Medium changed nothing a reader
// could see. The four knobs only describe an avatar that renders, so the master must gate them. Asserted
// through the RENDERED affordance (Playwright's `toBeDisabled`, then a forced click that must not open a
// listbox), never through the new prop — a CSS dim would pass a class check and still be clickable.
const DEPENDENTS = ["Avatar size", "Avatar shape", "Avatar aspect", "Avatar ring"] as const;

test("with the master OFF the four dependent avatar controls are disabled and cannot be opened", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceAvatarsSectionStory />);
  // Default settings ship avatars ON, so the dependents start live — that is the comparand.
  await expect(page.getByRole("combobox", { name: "Avatar size" })).toBeEnabled();

  await page.getByRole("switch", { name: "Show avatars in chat" }).click();
  await expect(page.getByRole("switch", { name: "Show avatars in chat" })).toHaveAttribute("aria-checked", "false");

  await Promise.all(DEPENDENTS.map((name) => expect(page.getByRole("combobox", { name })).toBeDisabled()));
  // Real disabled semantics, not a CSS dim: the trigger is a disabled button, so no popup can exist.
  await expect(page.getByRole("listbox")).toHaveCount(0);

  // …and turning the master back on restores them (a one-way disable would be its own defect).
  await page.getByRole("switch", { name: "Show avatars in chat" }).click();
  await Promise.all(DEPENDENTS.map((name) => expect(page.getByRole("combobox", { name })).toBeEnabled()));
});

test("the show-avatars switch patches showInChatAvatars, still key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceAvatarsSectionStory />);
  await page.getByRole("switch", { name: "Show avatars in chat" }).click();

  await expect.poll(() => lastPatch(trpc)?.["showInChatAvatars"], { intervals: [20, 50, 100] }).toBe(false);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
