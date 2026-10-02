import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AttachmentQualityStory } from "../_attachment-quality-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_quality",
  schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
  config: DEFAULT_USER_SETTINGS,
  configUnreadable: null,
  updatedAt: 0,
};
const UPDATE_PROC = "settings.updateUserSettingsSection";

test("defaults and cost/fidelity hint are visible at narrow width", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
  await mount(<AttachmentQualityStory />);
  await expect(page.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Image detail", exact: true })).toContainText("Auto");
  await expect(page.getByRole("combobox", { name: "Video maximum resolution", exact: true })).toContainText("720p");
  await expect(
    page.getByText("Lower image detail or video resolution can reduce vision-token cost and context use, but loses fine detail.", { exact: true }),
  ).toBeVisible();
});

test("each image/video option autosaves only attachment quality and renders the selected value", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
  await mount(<AttachmentQualityStory />);
  for (const [label, value] of [
    ["Low", "low"],
    ["High", "high"],
    ["Auto", "auto"],
  ] as const) {
    await page.getByRole("combobox", { name: "Image detail", exact: true }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Image detail", exact: true })).toContainText(label);
    await expect
      .poll(() => recorder.lastInput(UPDATE_PROC))
      .toEqual({ section: "chat", patch: { attachmentQuality: { imageDetail: value, videoMaxResolution: "720" } } });
  }
  for (const [label, value] of [
    ["Original", "original"],
    ["1080p", "1080"],
    ["480p", "480"],
    ["720p", "720"],
  ] as const) {
    await page.getByRole("combobox", { name: "Video maximum resolution", exact: true }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Video maximum resolution", exact: true })).toContainText(label);
    await expect
      .poll(() => recorder.lastInput(UPDATE_PROC))
      .toEqual({ section: "chat", patch: { attachmentQuality: { imageDetail: "auto", videoMaxResolution: value } } });
  }
});

for (const width of [280, 320, 480, 760, 1000]) {
  test(`attachment fields remain paired and contained in a ${width}px host`, async ({ mount, page }) => {
    await routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
    await mount(<AttachmentQualityStory width={width} />);
    const image = page.getByRole("combobox", { name: "Image detail", exact: true });
    const video = page.getByRole("combobox", { name: "Video maximum resolution", exact: true });
    await expect(image).toBeVisible();
    const boxes = await page.locator('[data-slot="field-root"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = node.querySelector('[data-slot="field-label"]');
        const control = node.querySelector('[role="combobox"]');
        if (!(label && control)) {
          throw new Error("Missing actual field anatomy");
        }
        const l = label.getBoundingClientRect();
        const c = control.getBoundingClientRect();
        const host = node.closest("section")?.getBoundingClientRect();
        if (!host) {
          throw new Error("Missing section");
        }
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.width = "var(--width-control-col)";
        node.append(probe);
        const track = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          labelRight: l.right,
          labelBottom: l.bottom,
          controlLeft: c.left,
          controlTop: c.top,
          controlRight: c.right,
          hostRight: host.right,
          track,
          gap: Number.parseFloat(getComputedStyle(node).columnGap),
        };
      }),
    );
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.controlRight).toBeLessThanOrEqual(box.hostRight + 1);
      const paired = width < 512 ? box.controlTop >= box.labelBottom : box.controlLeft - box.labelRight <= box.track + box.gap + 1;
      expect(paired, JSON.stringify(box)).toBe(true);
    }
    expect(boxes[0]?.controlLeft).toBeCloseTo(boxes[1]?.controlLeft ?? -1, 0);
    await image.click();
    await expect(page.getByRole("listbox")).toHaveAccessibleName("Image detail");
    await page.getByRole("option", { name: "Low", exact: true }).click();
    await expect(page.getByRole("listbox", { name: "Image detail", exact: true })).toBeHidden();
    await video.click();
    await expect(page.getByRole("listbox")).toHaveAccessibleName("Video maximum resolution");
  });
}

test.describe("coarse attachment choices", () => {
  test.use({ hasTouch: true });
  test("280px host keeps full touch targets and names both opened lists", async ({ mount, page }) => {
    await routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
    await mount(<AttachmentQualityStory width={280} />);
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    for (const name of ["Image detail", "Video maximum resolution"]) {
      const trigger = page.getByRole("combobox", { name, exact: true });
      const geometry = (): Promise<{ readonly height: number; readonly target: number }> =>
        trigger.evaluate((node) => {
          const probe = document.createElement("div");
          probe.style.position = "absolute";
          probe.style.height = "var(--spacing-touch-target)";
          node.append(probe);
          const target = probe.getBoundingClientRect().height;
          probe.remove();
          return { height: node.getBoundingClientRect().height, target };
        });
      await expect.poll(async () => (await geometry()).target).toBeGreaterThan(0);
      await expect
        .poll(async () => {
          const box = await geometry();
          return box.height - box.target;
        })
        .toBeGreaterThanOrEqual(0);
      await trigger.tap();
      await expect(page.getByRole("listbox")).toHaveAccessibleName(name);
      await page.getByRole("option", { name: name === "Image detail" ? "High" : "480p", exact: true }).tap();
      await expect(trigger).toContainText(name === "Image detail" ? "High" : "480p");
      await expect(page.getByRole("listbox", { name, exact: true })).toBeHidden();
    }
  });
});
