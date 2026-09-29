// CT: the real host-rendered composer placement homes. The route supplies registration metadata; the host
// chooses the rail/menu chrome and every click crosses the existing typed command runner.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage } from "../../chat/fixtures.ts";
import { PluginCommandsYouSheetStory, PluginComposerPlacementsStory, PluginComposerRemovalStory, PluginComposerRoomStory } from "../_ct-stories.tsx";

const FIRST_ID = castId<PluginId>("plugin_ct_same_name000001");
const SECOND_ID = castId<PluginId>("plugin_ct_same_name000002");
const ALPHA_ID = castId<PluginId>("plugin_ct_order_alpha00001");
const ZETA_ID = castId<PluginId>("plugin_ct_order_zeta000001");
// Two installs share a display name; the one whose slug sorts first has the higher id.
const MID_A_SLUG_ID = castId<PluginId>("plugin_ct_order_mid_z00001");
const MID_B_SLUG_ID = castId<PluginId>("plugin_ct_order_mid_a00001");

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

for (const transition of ["disable", "uninstall"] as const) {
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

  await component.getByRole("button", { name: "Plugin actions" }).click();
  await page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Open", exact: true }).click();
  await expect.poll(() => invoked).toEqual([expect.objectContaining({ pluginId: SECOND_ID, name: "charlie", chatId: CHAT_ID })]);

  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Same Name (second) · Scenes · Run Illustrate", exact: true }).click();
  await expect.poll(() => invoked).toHaveLength(2);
  expect(invoked[1]).toMatchObject({ pluginId: SECOND_ID, name: "illustrate", chatId: CHAT_ID });
});
