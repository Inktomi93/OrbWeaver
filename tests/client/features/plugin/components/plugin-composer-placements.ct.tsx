// CT: the real host-rendered composer placement homes. The route supplies registration metadata; the host
// chooses the rail/menu chrome and every click crosses the existing typed command runner.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, CHAT_ROOM_ROUTES, makeMessagesPage } from "../../chat/fixtures.ts";
import {
  PluginCommandsYouSheetStory,
  PluginComposerDraftRoomStory,
  PluginComposerPlacementsStory,
  PluginComposerRemovalStory,
  PluginComposerRoomStory,
} from "../_ct-stories.tsx";

const FIRST_ID = castId<PluginId>("plugin_ct_same_name000001");
const SECOND_ID = castId<PluginId>("plugin_ct_same_name000002");
const ALPHA_ID = castId<PluginId>("plugin_ct_order_alpha00001");
const ZETA_ID = castId<PluginId>("plugin_ct_order_zeta000001");
// Two installs share a display name; the one whose slug sorts first has the higher id.
const MID_A_SLUG_ID = castId<PluginId>("plugin_ct_order_mid_z00001");
const MID_B_SLUG_ID = castId<PluginId>("plugin_ct_order_mid_a00001");
const LONG_PLACEMENT_LABEL = "Create a detailed illustrated character scene";

const POLISH_COMMAND: TrpcWireOutput<"plugin.listCommands">[number] = {
  pluginId: FIRST_ID,
  slug: "draft-polish",
  pluginName: "Draft Polish",
  name: "polish",
  describe: "Polish this draft before sending",
  args: [],
  group: null,
  composerDraft: true,
  placements: [{ target: "composer-action", label: "Polish", icon: "sparkles" }],
};
const DRAFT_ROUTES = {
  ...CHAT_AMBIENT_ROUTES,
  ...CHAT_ROOM_ROUTES,
  "chat.listChats": { items: [], nextCursor: null },
  "plugin.listCommands": [POLISH_COMMAND],
  "chat.previewContextFit": {
    boundaryMessageId: null,
    usedTokens: 120,
    ceilingTokens: 32_768,
    ceilingEstimated: false,
    limit: null,
    reserveOutputTokens: 2048,
    droppedCount: 0,
    compactSummary: null,
  },
} satisfies TrpcRoutes;

test("explicit Polish replaces the visible draft, Undo restores exact bytes, and Send submits precisely the replacement", async ({ mount, page }) => {
  const original = "  Hello...  ran ` x  --  ... `\nDone!!!  ";
  const replacement = "Hello… ran ` x  --  ... `\nDone!";
  const recorder = await routeTrpc(page, {
    ...DRAFT_ROUTES,
    "plugin.invokeUiCommand": { toasts: [], composerDraft: replacement },
    "chat.send": { messages: [], aborted: false },
  });
  await mount(<PluginComposerDraftRoomStory />);
  const draft = page.getByRole("textbox", { name: "Message", exact: true });
  const polish = page.getByRole("button", { name: "Draft Polish (draft-polish) · Commands · Run Polish", exact: true });
  await draft.fill(original);
  await expect(polish).toBeVisible();
  await expect.poll(() => recorder.count("plugin.invokeUiCommand")).toBe(0);
  await polish.click();
  await expect(draft).toHaveValue(replacement);
  await expect
    .poll(() => recorder.lastInput("plugin.invokeUiCommand"))
    .toEqual({
      pluginId: FIRST_ID,
      name: "polish",
      args: "",
      values: {},
      chatId: CHAT_ID,
      composerDraft: original,
    });
  await page.getByRole("button", { name: "Undo Polish", exact: true }).click();
  await expect(draft).toHaveValue(original);
  await expect(page.getByRole("button", { name: "Undo Polish", exact: true })).toHaveCount(0);
  await polish.click();
  await expect(draft).toHaveValue(replacement);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => recorder.lastInput("chat.send")).toMatchObject({ chatId: CHAT_ID, content: replacement });
  await expect.poll(() => recorder.count("plugin.invokeUiCommand")).toBe(2);
});

test("a pending Polish cannot overwrite an edit-and-restore or another room, and Undo cannot overwrite a later edit", async ({ mount, page }) => {
  const pending = [trpcHold(), trpcHold()] as const;
  let runs = 0;
  await routeTrpc(page, {
    ...DRAFT_ROUTES,
    "plugin.invokeUiCommand": () => pending.at(runs++) ?? { toasts: [], composerDraft: "Replacement" },
  });
  await mount(<PluginComposerDraftRoomStory />);
  const draft = page.getByRole("textbox", { name: "Message", exact: true });
  const polish = page.getByRole("button", { name: "Draft Polish (draft-polish) · Commands · Run Polish", exact: true });
  await draft.fill("Original");
  await polish.click();
  await expect.poll(() => runs).toBe(1);
  await draft.fill("Later edit");
  await draft.fill("Original");
  pending[0].release({ toasts: [], composerDraft: "Stale replacement" });
  await expect(page.getByText("The draft or room changed. Nothing was replaced.", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("Original");
  await expect(page.getByRole("button", { name: "Undo Polish", exact: true })).toHaveCount(0);
  await polish.click();
  await expect.poll(() => runs).toBe(2);
  await page.getByRole("button", { name: "Other room", exact: true }).click();
  await expect(draft).toHaveValue("");
  await draft.fill("Other room draft");
  pending[1].release({ toasts: [], composerDraft: "Wrong room replacement" });
  await expect(polish).toBeEnabled();
  await expect(draft).toHaveValue("Other room draft");
  await page.getByRole("button", { name: "Original room", exact: true }).click();
  await expect(draft).toHaveValue("Original");
  await polish.click();
  await expect(draft).toHaveValue("Replacement");
  await expect(page.getByRole("button", { name: "Undo Polish", exact: true })).toBeVisible();
  await draft.fill("Edit after Polish");
  await expect(page.getByRole("button", { name: "Undo Polish", exact: true })).toHaveCount(0);
  await expect(draft).toHaveValue("Edit after Polish");
});

test("a failed explicit Polish leaves the draft intact and gives a visible error, not a replacement or send", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    ...DRAFT_ROUTES,
    "plugin.invokeUiCommand": trpcError({ code: "INTERNAL_SERVER_ERROR", message: "Polish failed" }),
  });
  await mount(<PluginComposerDraftRoomStory />);
  const draft = page.getByRole("textbox", { name: "Message", exact: true });
  await draft.fill("Keep my draft");
  await page.getByRole("button", { name: "Draft Polish (draft-polish) · Commands · Run Polish", exact: true }).click();
  await expect(page.getByLabel("Alerts").getByText("Polish failed", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("Keep my draft");
  await expect(page.getByRole("button", { name: "Undo Polish", exact: true })).toHaveCount(0);
  await expect.poll(() => recorder.count("chat.send")).toBe(0);
});

const COMMANDS: TrpcWireOutput<"plugin.listCommands"> = [
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
    placements: [{ target: "composer-action", label: "Open" }],
  },
  {
    pluginId: SECOND_ID,
    slug: "second",
    pluginName: "Same Name",
    name: "charlie",
    describe: "Overflow action from a distinct install",
    args: [],
    group: "Scenes",
    placements: [{ target: "composer-action", label: "Open" }],
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
];

const ROUTES: TrpcRoutes<"chat.listChats" | "plugin.listCommands"> = {
  "chat.listChats": () => ({ items: [], nextCursor: null }),
  "plugin.listCommands": () => COMMANDS,
};

test("fitting attributed actions render directly, cap at three, and move into ordered overflow on resize", async ({ mount, page }) => {
  const invoked: unknown[] = [];
  await routeTrpc(page, {
    "chat.listChats": () => ({ items: [], nextCursor: null }),
    "plugin.listCommands": () => ORDER_COMMANDS,
    "plugin.invokeUiCommand": (input: unknown) => {
      invoked.push(input);
      return { toasts: [] };
    },
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<PluginComposerPlacementsStory width={1400} />);
  const direct = component.getByRole("group", { name: "Plugin composer actions", exact: true }).getByRole("button", { name: / · Run / });
  await expect(direct).toHaveCount(3);
  const names = ORDERED_MENUS[0].names;
  for (const [index, name] of names.slice(0, 3).entries()) {
    await expect(direct.nth(index)).toHaveAccessibleName(name);
    await expect(direct.nth(index)).toContainText(name.split(" · ")[0] ?? "");
  }
  await direct.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => invoked).toEqual([expect.objectContaining({ pluginId: MID_A_SLUG_ID, name: "peek", chatId: CHAT_ID })]);
  await component.getByRole("button", { name: "Plugin actions", exact: true }).click();
  const overflow = page.getByRole("menu").getByRole("menuitem");
  await expect(overflow).toHaveCount(2);
  for (const [index, name] of names.slice(3).entries()) {
    await expect(overflow.nth(index)).toHaveAccessibleName(name);
  }
  await page.keyboard.press("Escape");
  await component.evaluate((element) => {
    const group = element.querySelector('[role="group"][aria-label="Plugin composer actions"]');
    if (!(group instanceof HTMLElement)) {
      throw new Error("Missing plugin action group");
    }
    const buttons = Array.from(group.querySelectorAll(":scope > button"));
    const gap = Number.parseFloat(getComputedStyle(group).columnGap);
    const required =
      (buttons[0]?.getBoundingClientRect().width ?? 0) +
      (buttons[1]?.getBoundingClientRect().width ?? 0) +
      (buttons.at(-1)?.getBoundingClientRect().width ?? 0) +
      gap * 2;
    element.style.width = `${element.clientWidth - group.clientWidth + Math.ceil(required)}px`;
  });
  await expect(direct).toHaveCount(2);
  await component.getByRole("button", { name: "Plugin actions", exact: true }).click();
  await expect(overflow).toHaveCount(3);
  await expect(overflow.first()).toHaveAccessibleName(names[2]);
  await page.keyboard.press("Escape");
  await component.evaluate((element) => {
    element.style.width = "320px";
  });
  await expect(direct).toHaveCount(0);
  await component.getByRole("button", { name: "Plugin actions", exact: true }).click();
  await expect(overflow).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(overflow.nth(index)).toHaveAccessibleName(name);
  }
});

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
  await expect(page.getByRole("menuitem", { name: "Same Name (first) · Cards · Run beta · Second action", exact: true })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run charlie · Overflow action from a distinct install", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const actions = component.getByRole("button", { name: "Plugin actions" });
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Same Name (first) · Cards")).toBeVisible();
  await expect(page.getByText("Same Name (second) · Scenes")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Same Name (first) · Cards · Run Open", exact: true })).toBeVisible();
  const placedItem = page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Open", exact: true });
  await expect(placedItem).toBeVisible();
  await placedItem.press("Enter");
  await expect.poll(() => invoked).toContain("charlie");

  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByText("Same Name (second) · Scenes", { exact: true })).toBeVisible();
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
  await page.getByRole("menuitem", { name: "Same Name (first) · Cards · Run Alpha", exact: true }).click();
  const suit = component.getByRole("combobox", { name: "suit" });
  await suit.click();
  await page.getByRole("option", { name: "wands" }).click();
  await component.getByRole("button", { name: "Run alpha" }).click();
  await expect.poll(() => captured).not.toBeNull();
  expect(captured).toMatchObject({ pluginId: FIRST_ID, name: "alpha", values: { suit: "wands" } });
});

test("a running placed command locks the shared action affordance until the invocation settles", async ({ mount, page }) => {
  const invocation = trpcHold();
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": () => invocation,
  });
  const component = await mount(<PluginComposerPlacementsStory />);
  const actions = component.getByRole("button", { name: "Plugin actions" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Same Name (first) · Cards · Run Open", exact: true }).click();
  await invocation.requested;

  await expect(actions).toBeDisabled();
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate" })).toBeDisabled();
  invocation.release({ toasts: [] });
  await expect(actions).toBeEnabled();
});

test("a direct invocation marks all fitted actions busy and locks overflow and media until it settles", async ({ mount, page }) => {
  const invocation = trpcHold();
  await routeTrpc(page, {
    "chat.listChats": () => ({ items: [], nextCursor: null }),
    "plugin.listCommands": () => ORDER_COMMANDS,
    "plugin.invokeUiCommand": () => invocation,
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<PluginComposerPlacementsStory width={1400} />);
  const direct = component.getByRole("group", { name: "Plugin composer actions", exact: true }).getByRole("button", { name: / · Run / });
  await expect(direct).toHaveCount(3);
  await direct.first().click();
  await invocation.requested;
  for (const button of await direct.all()) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  }
  const overflow = component.getByRole("button", { name: "Plugin actions", exact: true });
  await expect(overflow).toBeDisabled();
  await component.getByRole("button", { name: "Message tools", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Zeta Deck (zeta) · Scenes · Run Frame", exact: true })).toBeDisabled();
  invocation.release({ toasts: [] });
  await expect(direct.first()).toBeEnabled();
  await expect(overflow).toBeEnabled();
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
  await expect(page.getByText(/Same Name/)).toHaveCount(0);
});

test.describe("coarse direct composer actions", () => {
  test.use({ hasTouch: true, viewport: { width: 1600, height: 900 } });
  test("fitted buttons keep their full attribution and the touch floor inside the allocated row", async ({ mount, page }) => {
    await routeTrpc(page, ROUTES);
    const component = await mount(<PluginComposerPlacementsStory width={1400} />);
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const group = component.getByRole("group", { name: "Plugin composer actions", exact: true });
    const direct = group.getByRole("button", { name: / · Run / });
    await expect(direct).toHaveCount(3);
    await expect
      .poll(async () => {
        const groupBox = await group.boundingBox();
        const boxes = await Promise.all((await direct.all()).map((button) => button.boundingBox()));
        return boxes.map(
          (box) => box !== null && groupBox !== null && box.height >= 44 && box.x >= groupBox.x && box.x + box.width <= groupBox.x + groupBox.width,
        );
      })
      .toEqual([true, true, true]);
  });
});

for (const width of [320, 390] as const) {
  test.describe(`mobile You sheet at ${width}px`, () => {
    test.use({ hasTouch: true, viewport: { width, height: 844 } });

    test("projects the production plugin command contributor with slug attribution and coarse targets", async ({ mount, page }) => {
      await routeTrpc(page, ROUTES);
      const component = await mount(<PluginCommandsYouSheetStory />);

      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const first = component.getByRole("button", { name: "Same Name (first) · Cards · Run alpha" });
      const second = component.getByRole("button", { name: "Same Name (second) · Scenes · Run charlie" });
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();
      await expect
        .poll(async () => {
          const boxes = await Promise.all([first.boundingBox(), second.boundingBox()]);
          return boxes.map((box) => (box === null ? false : box.height >= 44 && box.x >= 0 && box.x + box.width <= width));
        })
        .toEqual([true, true]);
    });

    test("the compact composer keeps attributed actions in reachable coarse overflow and media menus", async ({ mount, page }) => {
      await routeTrpc(page, {
        ...ROUTES,
        "plugin.listCommands": () =>
          COMMANDS.map((command): TrpcWireOutput<"plugin.listCommands">[number] =>
            command.name === "charlie" ? { ...command, placements: [{ target: "composer-action", label: LONG_PLACEMENT_LABEL }] } : command,
          ),
      });
      const component = await mount(<PluginComposerPlacementsStory width={width} />);
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const actions = component.getByRole("button", { name: "Plugin actions", exact: true });
      await expect(actions).toBeVisible();
      await expect(component.getByRole("button", { name: / · Run / })).toHaveCount(0);
      await expect.poll(async () => (await actions.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await actions.click();
      const item = page.getByRole("menuitem", { name: `Same Name (second) · Scenes · Run ${LONG_PLACEMENT_LABEL}`, exact: true });
      await expect(item).toBeVisible();
      await expect(item).toContainText(LONG_PLACEMENT_LABEL);
      await expect.poll(async () => (await item.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      const popup = page.getByRole("menu");
      await expect
        .poll(() =>
          popup.evaluate((element) => {
            const style = getComputedStyle(element);
            return style.opacity === "1" && style.transform === "none";
          }),
        )
        .toBe(true);
      await expect.poll(async () => (await popup.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
      await expect
        .poll(async () => {
          const bounds = await popup.boundingBox();
          return bounds === null ? Number.POSITIVE_INFINITY : bounds.x + bounds.width;
        })
        .toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await component.getByRole("button", { name: "Message tools", exact: true }).click();
      const media = page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate", exact: true });
      await expect(media).toBeVisible();
      await expect.poll(async () => (await media.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  });
}

test("a placed command with no args shows the refusal and releases the shared affordance", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": () => trpcError({ code: "BAD_REQUEST", message: "The deck is empty." }),
  });
  const component = await mount(<PluginComposerPlacementsStory />);
  const actions = component.getByRole("button", { name: "Plugin actions" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Same Name (first) · Cards · Run Open", exact: true }).click();

  await expect(page.getByLabel("Alerts").getByText("The deck is empty.", { exact: true })).toBeVisible();
  await expect(actions).toBeEnabled();
});

for (const transition of ["disable", "uninstall", "auto-disable"] as const) {
  test(`${transition} removes fitted direct actions and their media entries`, async ({ mount, page }) => {
    let resident = true;
    const remove = (): null => {
      resident = false;
      return null;
    };
    await routeTrpc(page, {
      "chat.listChats": () => ({ items: [], nextCursor: null }),
      "plugin.list": () => [],
      "plugin.getLog": () => [],
      "plugin.listSurfaces": () => [],
      "plugin.listCommands": () => (resident ? COMMANDS : COMMANDS.filter((command) => command.pluginId !== SECOND_ID)),
      "plugin.setEnabled": remove,
      "plugin.uninstall": remove,
      "plugin.reportUiCrash": remove,
    });
    await page.setViewportSize({ width: 1600, height: 900 });
    const component = await mount(<PluginComposerRemovalStory pluginId={SECOND_ID} transition={transition} width={1400} />);
    const secondAction = component.getByRole("button", { name: "Same Name (second) · Scenes · Run Open", exact: true });
    await expect(secondAction).toBeVisible();
    await expect(component.getByRole("button", { name: "Plugin actions", exact: true })).toHaveCount(0);
    await component.getByRole("button", { name: "Message tools", exact: true }).click();
    const media = page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate", exact: true });
    await expect(media).toBeVisible();
    await page.keyboard.press("Escape");
    await component.getByRole("button", { name: `Run ${transition}`, exact: true }).click();
    await expect(secondAction).toHaveCount(0);
    await expect(component.getByRole("button", { name: "Same Name (first) · Cards · Run Open", exact: true })).toBeVisible();
    await component.getByRole("button", { name: "Message tools", exact: true }).click();
    await expect(media).toHaveCount(0);
  });
  test(`${transition} removes the plugin's entries from both mounted placement menus`, async ({ mount, page }) => {
    let resident = true;
    await routeTrpc(page, {
      "chat.listChats": () => ({ items: [], nextCursor: null }),
      "plugin.list": () => [],
      "plugin.getLog": () => [],
      "plugin.listSurfaces": () => [],
      "plugin.listCommands": () => (resident ? COMMANDS : COMMANDS.filter((command) => command.pluginId !== SECOND_ID)),
      "plugin.setEnabled": () => {
        resident = false;
        return null;
      },
      "plugin.uninstall": () => {
        resident = false;
        return null;
      },
      "plugin.reportUiCrash": () => {
        resident = false;
        return null;
      },
    });
    const component = await mount(<PluginComposerRemovalStory pluginId={SECOND_ID} transition={transition} />);
    const actions = component.getByRole("button", { name: "Plugin actions" });
    const media = component.getByRole("button", { name: "Message tools" });
    const secondAction = page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Open", exact: true });
    const secondMedia = page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate", exact: true });

    await actions.click();
    await expect(secondAction).toBeVisible();
    await page.keyboard.press("Escape");
    await media.click();
    await expect(secondMedia).toBeVisible();
    await page.keyboard.press("Escape");

    await component.getByRole("button", { name: `Run ${transition}`, exact: true }).click();

    await actions.click();
    await expect(page.getByRole("menuitem", { name: "Same Name (first) · Cards · Run Open", exact: true })).toBeVisible();
    await expect(secondAction).toHaveCount(0);
    await page.keyboard.press("Escape");
    await media.click();
    await expect(secondMedia).toHaveCount(0);
    await expect(page.getByText("Same Name (second) · Scenes", { exact: true })).toHaveCount(0);
  });
}

// Input order is deliberately not the host order: plugins arrive Zeta first, the same-name pair arrives in
// reverse slug order, and each Alpha command's first placement label disagrees with its media label.
const ORDER_COMMANDS: TrpcWireOutput<"plugin.listCommands"> = [
  {
    pluginId: MID_B_SLUG_ID,
    slug: "b-mid",
    pluginName: "Mid Deck",
    name: "peek",
    describe: "Peek at the top card",
    args: [],
    group: "Cards",
    placements: [
      { target: "composer-action", label: "Peek" },
      { target: "composer-media", label: "Peek" },
    ],
  },
  {
    pluginId: MID_A_SLUG_ID,
    slug: "a-mid",
    pluginName: "Mid Deck",
    name: "peek",
    describe: "Peek at the top card",
    args: [],
    group: "Cards",
    placements: [
      { target: "composer-action", label: "Peek" },
      { target: "composer-media", label: "Peek" },
    ],
  },
  {
    pluginId: ZETA_ID,
    slug: "zeta",
    pluginName: "Zeta Deck",
    name: "open",
    describe: "Open a scene",
    args: [],
    group: "Scenes",
    placements: [
      { target: "composer-action", label: "Open" },
      { target: "composer-media", label: "Frame" },
    ],
  },
  {
    pluginId: ALPHA_ID,
    slug: "alpha",
    pluginName: "Alpha Deck",
    name: "shuffle",
    describe: "Shuffle the deck",
    args: [],
    group: "Cards",
    placements: [
      { target: "composer-action", label: "Shuffle" },
      { target: "composer-media", label: "Burn" },
    ],
  },
  {
    pluginId: ALPHA_ID,
    slug: "alpha",
    pluginName: "Alpha Deck",
    name: "draw",
    describe: "Draw a card",
    args: [],
    group: "Cards",
    placements: [
      { target: "composer-action", label: "Draw" },
      { target: "composer-media", label: "Cut" },
    ],
  },
];

const ORDERED_MENUS = [
  {
    trigger: "Plugin actions",
    names: [
      "Alpha Deck (alpha) · Cards · Run Draw",
      "Alpha Deck (alpha) · Cards · Run Shuffle",
      "Mid Deck (a-mid) · Cards · Run Peek",
      "Mid Deck (b-mid) · Cards · Run Peek",
      "Zeta Deck (zeta) · Scenes · Run Open",
    ],
  },
  {
    trigger: "Message tools",
    names: [
      "Alpha Deck (alpha) · Cards · Run Burn",
      "Alpha Deck (alpha) · Cards · Run Cut",
      "Mid Deck (a-mid) · Cards · Run Peek",
      "Mid Deck (b-mid) · Cards · Run Peek",
      "Zeta Deck (zeta) · Scenes · Run Frame",
    ],
  },
] as const;

test("the host orders placements by plugin, group and the target's own label, whatever the input order", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": () => ({ items: [], nextCursor: null }), "plugin.listCommands": () => ORDER_COMMANDS });
  const component = await mount(<PluginComposerPlacementsStory />);

  for (const menu of ORDERED_MENUS) {
    await component.getByRole("button", { name: menu.trigger }).click();
    const items = page.getByRole("menu").getByRole("menuitem");
    await expect(items).toHaveCount(menu.names.length);
    for (const [index, name] of menu.names.entries()) {
      await expect(items.nth(index)).toHaveAccessibleName(name);
    }
    await page.keyboard.press("Escape");
  }
});

// Input order, plugin id order and composer placement labels all disagree with what the Plugins menu shows.
const SORT_LOW_ID = castId<PluginId>("plugin_ct_sort_b000000001");
const SORT_HIGH_ID = castId<PluginId>("plugin_ct_sort_z000000001");
const UNSORTED_COMMANDS: TrpcWireOutput<"plugin.listCommands"> = [
  { pluginId: SORT_LOW_ID, slug: "zeta-deck", pluginName: "Sort Deck", name: "cut", describe: "Cut the deck", args: [], group: "Cards", placements: [] },
  {
    pluginId: SORT_HIGH_ID,
    slug: "alpha-deck",
    pluginName: "Sort Deck",
    name: "shuffle",
    describe: "Shuffle the deck",
    args: [],
    group: "Cards",
    placements: [{ target: "composer-action", label: "Alpha" }],
  },
  {
    pluginId: SORT_HIGH_ID,
    slug: "alpha-deck",
    pluginName: "Sort Deck",
    name: "draw",
    describe: "Draw a card",
    args: [],
    group: "Cards",
    placements: [{ target: "composer-action", label: "Zeta" }],
  },
];

test("the Plugins menu follows the shown plugin attribution and command name, not the wire order", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": () => ({ items: [], nextCursor: null }), "plugin.listCommands": () => UNSORTED_COMMANDS });
  const component = await mount(<PluginComposerPlacementsStory />);

  await component.getByRole("button", { name: "Plugin commands" }).click();
  const items = page.getByRole("menu").getByRole("menuitem");
  const shown = [
    "Sort Deck (alpha-deck) · Cards · Run draw · Draw a card",
    "Sort Deck (alpha-deck) · Cards · Run shuffle · Shuffle the deck",
    "Sort Deck (zeta-deck) · Cards · Run cut · Cut the deck",
  ];
  await expect(items).toHaveCount(shown.length);
  for (const [index, name] of shown.entries()) {
    await expect(items.nth(index)).toHaveAccessibleName(name);
  }
});

test("the room composer mounts the production placement contributions and runs placed commands in this room", async ({ mount, page }) => {
  const invoked: unknown[] = [];
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...ROUTES,
    "chat.listMessages": () => makeMessagesPage([]),
    "chat.getChat": () => ({ participants: [], anchorPersonaId: null, identities: [], group: DEFAULT_GROUP_CONFIG }),
    "chat.previewContextFit": () => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      limit: null,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    "plugin.invokeUiCommand": (input: unknown) => {
      invoked.push(input);
      return { toasts: [] };
    },
  });
  const component = await mount(<PluginComposerRoomStory />);

  const action = component.getByRole("button", { name: "Same Name (second) · Scenes · Run Open", exact: true });
  await expect(action).toBeVisible();
  const send = component.getByRole("button", { name: "Send message", exact: true });
  await expect
    .poll(async () => {
      const boxes = await Promise.all([action.boundingBox(), send.boundingBox()]);
      const placed = boxes[0];
      const terminal = boxes[1];
      return (
        placed !== null &&
        placed !== undefined &&
        terminal !== null &&
        terminal !== undefined &&
        Math.abs(placed.y - terminal.y) <= 1 &&
        placed.x + placed.width <= terminal.x
      );
    })
    .toBe(true);
  await action.click();
  await expect.poll(() => invoked).toEqual([expect.objectContaining({ pluginId: SECOND_ID, name: "charlie", chatId: CHAT_ID })]);

  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate", exact: true }).click();
  await expect.poll(() => invoked).toHaveLength(2);
  expect(invoked[1]).toMatchObject({ pluginId: SECOND_ID, name: "illustrate", chatId: CHAT_ID });
});
