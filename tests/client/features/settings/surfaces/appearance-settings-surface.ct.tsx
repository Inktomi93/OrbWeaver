// CT: the real Appearance settings pane (D44 §12.1 #31 — appearance-settings-surface.tsx). Drives the
// production autosave path: `getUserSettings` seeds the form, each control change debounces 500ms then
// fires `updateUserSettingsSection("appearance")` with the FULL patch (createAutosaveEntityForm — the
// listener submits the whole form value, not a per-field delta). Assertions anchor to the surface's OWN
// exported MIN/MAX constants (never hardcoded numbers) and to the real `AppearanceSettings` field keys.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_DIM_MAX,
  BACKGROUND_DIM_MIN,
  CHAT_WIDTH_MAX,
  CHAT_WIDTH_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
} from "../../../../../packages/client/src/features/settings/lib/appearance-bounds";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AppearanceSettingsStory } from "../_ct-stories";

const SETTINGS_VIEW = {
  userId: "user_ct_appearance",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const UPDATE_PROC = "settings.updateUserSettingsSection";

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => ({}),
  });
}

/** The most recent patch body sent to the appearance section-patch mutation. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { patch?: Record<string, unknown> } | undefined;
  return input?.patch;
}

test("mounts with the persisted default values rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSettingsStory />);
  await expect(page.getByRole("combobox", { name: "Chat display" })).toContainText("Bubble");
  await expect(page.getByRole("slider", { name: "Chat width (%)" })).toHaveAttribute(
    "aria-valuenow",
    String(DEFAULT_USER_SETTINGS.appearance.chatWidthPct),
  );
  await expect(page.getByRole("slider", { name: "Text size", exact: true })).toHaveAttribute(
    "aria-valuenow",
    String(DEFAULT_USER_SETTINGS.appearance.fontScale),
  );
});

test("chatStyle select fires the mutation with the correct patch key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);
  await page.getByRole("combobox", { name: "Chat display" }).click();
  await page.getByRole("option", { name: "Flat", exact: true }).click();
  await expect.poll(() => lastPatch(trpc)?.["chatStyle"]).toBe("flat");
});

test("chatWidthPct slider clamps at its own MIN/MAX and patches chatWidthPct", async ({
  mount,
  page,
}) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);
  const slider = page.getByRole("slider", { name: "Chat width (%)" });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MIN));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"]).toBe(CHAT_WIDTH_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MAX));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"]).toBe(CHAT_WIDTH_MAX);
});

test("fontScale slider clamps at its own MIN/MAX and patches fontScale", async ({
  mount,
  page,
}) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);
  const slider = page.getByRole("slider", { name: "Text size", exact: true });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MIN));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"]).toBe(FONT_SCALE_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MAX));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"]).toBe(FONT_SCALE_MAX);
});

test("avatar size/shape/aspect/ring selects each patch the correct key", async ({
  mount,
  page,
}) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  await page.getByRole("combobox", { name: "Avatar size" }).click();
  await page.getByRole("option", { name: "Large" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarSize"]).toBe("lg");

  await page.getByRole("combobox", { name: "Avatar shape" }).click();
  await page.getByRole("option", { name: "Square", exact: true }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarShape"]).toBe("square");

  await page.getByRole("combobox", { name: "Avatar aspect" }).click();
  await page.getByRole("option", { name: "Portrait (2:3)" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarAspect"]).toBe("portrait");

  await page.getByRole("combobox", { name: "Avatar ring" }).click();
  await page.getByRole("option", { name: "Accent" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarRing"]).toBe("accent");

  // Every intermediate autosave carries the FULL patch — the final settled call still holds all four.
  await expect
    .poll(() => lastPatch(trpc))
    .toMatchObject({
      avatarSize: "lg",
      avatarShape: "square",
      avatarAspect: "portrait",
      avatarRing: "accent",
    });
});

test("background fit/dim/blur sliders clamp at their own MIN/MAX once an image kind is chosen", async ({
  mount,
  page,
}) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  // Fit/Dim/Blur are gated behind a non-"none" backgroundImageKind (form.Subscribe, reactive on LOCAL
  // form state — no server round-trip needed before the gated fields appear).
  await page.getByRole("combobox", { name: "Image" }).click();
  await page.getByRole("option", { name: "Seeded" }).click();

  await page.getByRole("combobox", { name: "Fit" }).click();
  await page.getByRole("option", { name: "Contain (fit, may letterbox)" }).click();

  const dim = page.getByRole("slider", { name: "Scrim opacity" });
  await dim.press("End");
  await expect(dim).toHaveAttribute("aria-valuenow", String(BACKGROUND_DIM_MAX));
  await dim.press("Home");
  await expect(dim).toHaveAttribute("aria-valuenow", String(BACKGROUND_DIM_MIN));

  const blur = page.getByRole("slider", { name: "Image blur" });
  await blur.press("Home");
  await expect(blur).toHaveAttribute("aria-valuenow", String(BACKGROUND_BLUR_MIN));
  await blur.press("End");
  await expect(blur).toHaveAttribute("aria-valuenow", String(BACKGROUND_BLUR_MAX));

  await expect
    .poll(() => lastPatch(trpc))
    .toMatchObject({
      backgroundImageKind: "seeded",
      backgroundFit: "contain",
      backgroundDim: BACKGROUND_DIM_MIN,
      backgroundBlur: BACKGROUND_BLUR_MAX,
    });
});
