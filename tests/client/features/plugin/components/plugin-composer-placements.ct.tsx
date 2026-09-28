// CT: the real host-rendered composer placement homes. The route supplies registration metadata; the host
// chooses the rail/menu chrome and every click crosses the existing typed command runner.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginCommandsYouSheetStory, PluginComposerPlacementsStory } from "../_ct-stories.tsx";

const FIRST_ID = castId<PluginId>("plugin_ct_same_name000001");
const SECOND_ID = castId<PluginId>("plugin_ct_same_name000002");

const ROUTES: TrpcRoutes<"chat.listChats" | "plugin.listCommands"> = {
  "chat.listChats": () => ({ items: [], nextCursor: null }),
  "plugin.listCommands": () => [
    {
      pluginId: FIRST_ID,
      slug: "first",
      pluginName: "Same Name",
      name: "alpha",
      describe: "Typed alpha action",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
      group: "Cards",
      placements: [{ target: "composer-action", label: "Alpha", icon: "star" }],
    },
    {
      pluginId: FIRST_ID,
      slug: "first",
      pluginName: "Same Name",
      name: "beta",
      describe: "Second action",
      args: [],
      group: "Cards",
      placements: [{ target: "composer-action", label: "Beta" }],
    },
    {
      pluginId: SECOND_ID,
      slug: "second",
      pluginName: "Same Name",
      name: "charlie",
      describe: "Overflow action from a distinct install",
      args: [],
      group: "Scenes",
      placements: [{ target: "composer-action", label: "Charlie" }],
    },
    {
      pluginId: SECOND_ID,
      slug: "second",
      pluginName: "Same Name",
      name: "illustrate",
      describe: "Illustrate this scene",
      args: [],
      group: "Scenes",
      placements: [{ target: "composer-media", label: "Illustrate", icon: "images" }],
    },
  ],
};

test("composer placements stay in one attributed action menu at narrow width and remain keyboard reachable", async ({ mount, page }) => {
  const invoked: string[] = [];
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": (input: unknown) => {
      invoked.push((input as { name: string }).name);
      return { toasts: [] };
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const component = await mount(<PluginComposerPlacementsStory width={320} />);

  await expect(component.getByRole("button", { name: "Plugin actions" })).toHaveCount(1);
  await expect(component.getByRole("button", { name: /Same Name ·/ })).toHaveCount(0);

  await component.getByRole("button", { name: "Plugin commands" }).click();
  await expect(page.getByText("Same Name (first)", { exact: true })).toBeVisible();
  await expect(page.getByText("Same Name (second)", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  const actions = component.getByRole("button", { name: "Plugin actions" });
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Same Name (first) · Cards")).toBeVisible();
  await expect(page.getByText("Same Name (second) · Scenes")).toBeVisible();
  const placedItem = page.getByRole("menuitem", { name: "Run Charlie" });
  await expect(placedItem).toBeVisible();
  await placedItem.press("Enter");
  await expect.poll(() => invoked).toContain("charlie");

  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByText("Plugin media")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate" })).toBeVisible();
});

test("a placed typed command collects values before dispatch through the shared runner", async ({ mount, page }) => {
  let captured: unknown = null;
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": (input: unknown) => {
      captured = input;
      return { toasts: [] };
    },
  });
  const component = await mount(<PluginComposerPlacementsStory />);
  await component.getByRole("button", { name: "Plugin actions" }).click();
  await page.getByRole("menuitem", { name: "Run Alpha" }).click();
  const suit = component.getByRole("combobox", { name: "suit" });
  await suit.click();
  await page.getByRole("option", { name: "wands" }).click();
  await component.getByRole("button", { name: "Run alpha" }).click();
  await expect.poll(() => captured).not.toBeNull();
  expect(captured).toMatchObject({ pluginId: FIRST_ID, name: "alpha", values: { suit: "wands" } });
});

test("a running placed command locks the shared action affordance until the invocation settles", async ({ mount, page }) => {
  let finishInvocation = (): void => {
    throw new Error("plugin invocation did not start");
  };
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": () =>
      new Promise((resolve) => {
        finishInvocation = (): void => resolve({ toasts: [] });
      }),
  });
  const component = await mount(<PluginComposerPlacementsStory />);
  const actions = component.getByRole("button", { name: "Plugin actions" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Run Beta" }).click();

  await expect(actions).toBeDisabled();
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate" })).toBeDisabled();
  finishInvocation();
  await expect(actions).toBeEnabled();
});

test("disabled or removed commands leave no plugin placement affordance", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": () => ({ items: [], nextCursor: null }),
    "plugin.listCommands": () => [],
  });
  const component = await mount(<PluginComposerPlacementsStory />);
  await expect(component.getByRole("button", { name: "Plugin actions" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: /Same Name/ })).toHaveCount(0);
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByText("Plugin media")).toHaveCount(0);
});

for (const width of [320, 390] as const) {
  test.describe(`mobile You sheet at ${width}px`, () => {
    test.use({ hasTouch: true, viewport: { width, height: 844 } });

    test("projects the production plugin command contributor with slug attribution and coarse targets", async ({ mount, page }) => {
      await routeTrpc(page, ROUTES);
      const component = await mount(<PluginCommandsYouSheetStory />);

      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const first = component.getByRole("button", { name: "Same Name (first) · Cards · Run alpha" });
      const second = component.getByRole("button", { name: "Same Name (second) · Scenes · Run charlie" });
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();
      const boxes = await Promise.all([first.boundingBox(), second.boundingBox()]);
      for (const box of boxes) {
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? width) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
    });
  });
}
