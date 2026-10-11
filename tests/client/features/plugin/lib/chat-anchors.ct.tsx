// CT: the two CHAT anchors of the plugin UI plane (U2, seam 7) over the REAL tRPC path
// with a stubbed network. Both subjects are the PRODUCTION contributions the door assembles
// (`pluginChatFlankSurface` / `pluginChatSettingsSection`), never a test double, so what is pinned is the path
// a person actually gets: `plugin.listSurfaces` → the anchor fan-out → the first-party labelled shell.
//
// THE OWNER'S U2 TEST, in two halves:
//   1. "disabled ⇒ byte-identical room" — the flank contribution mounts in EVERY room (its applicability is
//      DATA, which the seam's sync `when` cannot see), so the room's geometry must not move for the people
//      who have no plugin surfaces. Pinned as FULL geometry (x/y/width/height of the transcript's scroll
//      window) at BOTH arms of the flank's container query, because the pin that shipped #680 measured one
//      axis at one width. Three silent arms: no contribution at all (the baseline), the contribution with
//      zero surfaces, and the contribution with a DISABLED plugin (`listSurfaces` contributes nothing for a
//      plugin with no resident instance).
//   2. "a plugin renders a labelled flank widget" — a registered `chat-flank` surface renders inside the
//      plugin-named shell, and a surface whose spec BINDS `{ $state }` stays silent until the plugin has
//      published something (§4.9: a state-less surface renders NOTHING — never a blank meter in the room).
//
// The settings-section half pins the same silence property one anchor over — where "silent" has to collapse
// the HOST's grafted `<Section>`, or a person with no plugin panels pays a "Plugin panels" heading over
// nothing — plus the live round-trip: the surface's button invokes `plugin.invokeUiAction`, whose invalidate
// repaints the state the shell renders. (The BUS half of freshness — `pluginSurfaceStateChanged` →
// `getSurfaceState` — is pinned at its own tier in tests/client/data/invalidation.test.ts.)

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { CHAT_AND_INBOX_READS_EMPTY } from "../../../../support/node/chat-and-inbox-reads-empty.ts";
import { HOST_BAND, openContextSections } from "../../../../support/node/open-context-sections.ts";
import { REGEX_READS_EMPTY } from "../../../../support/node/regex-reads-empty.ts";
import type { TrpcInput, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";
import {
  PluginChatFlankRoomStory,
  PluginChatSettingsSectionStory,
  PluginChatVisibilityStory,
  PluginFlankSheetRoomStory,
  PluginPhoneShellStory,
} from "../_ct-stories.tsx";

type PluginListRow = TrpcWireOutput<"plugin.list">[number];
type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];
/** The transcript box a geometry pin compares — Playwright's own `boundingBox()` return. */
type Box = Awaited<ReturnType<Locator["boundingBox"]>>;

const A_PAST_INSTANT = 1_760_000_000_000;
const AFFINITY_ID = mintTypeId(ID_PREFIX.plugin);
const PLUGIN_NAME = "Affinity Tracker";

/** One installed row as `plugin.list` projects it — the join the shell's attribution line reads its name from.
 *  The wire shape is pinned by the router/domain tests, never re-typed here. */
function pluginRow(status: "enabled" | "disabled"): PluginListRow {
  return {
    id: AFFINITY_ID,
    slug: "affinity-tracker",
    name: PLUGIN_NAME,
    version: "1.0.0",
    status,
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    description: "A fixture plugin.",
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** One `listSurfaces` row (the serializable meta + its pluginId; the `onAction` handle stays server-side). */
function surfaceRow(anchor: PluginSurfaceRow["anchor"], id: string, title: string, spec: PluginSurfaceRow["spec"]): PluginSurfaceRow {
  return { pluginId: AFFINITY_ID, id, anchor, title, tier: "static", spec };
}

/** The affinity tracker's ROOM WIDGET, as its seeded `main.js` registers it: a bound meter + a bound caption,
 *  i.e. a surface that has nothing to say until the plugin publishes. */
const FLANK_SPEC: NonNullable<PluginSurfaceRow["spec"]> = {
  kind: "stack",
  gap: "field",
  children: [
    { kind: "meter", label: "Warmth", max: 10, value: { $state: "score" } },
    { kind: "text", voice: "gloss", value: { $state: "caption" } },
  ],
};
const FLANK_STATE = { score: 7, caption: "Your latest warmth reading, 7 of 10." };

/** THE ROOM'S OWN READS, at the recipe chat-room-surface.ct.tsx proves: the canon page in its real wire
 *  shape, the roster/cast floor, and the context-fit preview (whose unlisted-proc `null` default is out of
 *  contract for that query and takes the whole transcript down with it). A room mount that skips any of them
 *  never leaves its loading skeleton — and every geometry pin below would then be measuring nothing. */
const ROOM_ROUTES: TrpcRoutes<"chat.listMessages" | "chat.listReactions" | "chat.getChat" | "chat.previewContextFit"> = {
  "chat.listMessages": () => makeMessagesPage([makeMessageView({ content: "Hi Aria", role: "user", seq: 1 })]),
  // FED, not declared (the unfed-read ratchet): the committed-row footer anchor mounts chat's own reaction pill
  // row (B6, 3118306b64), which reads `chat.listReactions`. It landed AFTER this file and its lane's CT floor did
  // not name this file, so the read ran INERT here — `routeTrpc` answering `null` is not a view, and a
  // regression inside the pill pipeline would have been invisible in every arm below. An EMPTY reaction set is
  // the honest fixture for these arms: they are about the FLANK's geometry, and a room where nobody has reacted
  // is both the common case and the one whose layout the silent-arm pins compare.
  "chat.listReactions": () => ({ reactionsEnabled: true, groups: [] }),
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
};

const FLANK_SLOT = '[data-slot="chat-thread-flank"]';
const SCROLLER = '[data-slot="message-list-scroll"]';

/** The flank's own container query has two arms — beside (row) and stacked (column) — and #680 shipped
 *  because a pin ran only the first. */
const FLANK_ARMS = [
  { label: "desktop (beside)", viewport: { width: 1280, height: 800 } },
  { label: "mobile (stacked)", viewport: { width: 430, height: 932 } },
] as const;

test.describe("the flank anchor", () => {
  for (const { label, viewport } of FLANK_ARMS) {
    test(`${label}: a caller with NO plugin surfaces gets a byte-identical room`, async ({ mount, page }) => {
      await page.setViewportSize(viewport);
      // The plugin is INSTALLED AND ENABLED but registered no surfaces — the common case for everyone who has
      // a plugin at all, and the arm where a mounted-but-silent contributor could cost the room a flank column.
      await routeTrpc(page, {
        ...CHAT_AMBIENT_ROUTES,
        ...ROOM_ROUTES,
        "plugin.list": () => [pluginRow("enabled")],
        "plugin.listSurfaces": () => [],
      });

      // BASELINE: the room with no surface contributors at all — "a build without the plugin seam".
      const bare = await mount(<PluginChatFlankRoomStory registered={false} />);
      await expect(page.locator(SCROLLER)).toBeVisible();
      const baseline = await page.locator(SCROLLER).boundingBox();
      expect(baseline, "the transcript must have a box to compare").not.toBeNull();
      await bare.unmount();

      // …and the same room WITH the production contribution mounted and silent.
      const withPlugin = await mount(<PluginChatFlankRoomStory registered={true} />);
      await expect(page.locator(SCROLLER)).toBeVisible();
      await expect(withPlugin.getByText("Couldn't load this conversation.")).toHaveCount(0);
      // The flank column is out of layout entirely (`empty:hidden`), not merely painted empty.
      await expect(page.locator(FLANK_SLOT)).toBeHidden();
      // FULL geometry, both axes AND both origins — a width-only pin is exactly how #680 went green.
      const readBox = async (): Promise<Box> => await page.locator(SCROLLER).boundingBox();
      await expect.poll(async () => (await readBox())?.width).toBe(baseline?.width);
      await expect.poll(async () => (await readBox())?.height).toBe(baseline?.height);
      await expect.poll(async () => (await readBox())?.x).toBe(baseline?.x);
      await expect.poll(async () => (await readBox())?.y).toBe(baseline?.y);
      // …and non-vacuous: a zero-width transcript would satisfy an equality pin while the room was broken.
      expect(baseline?.width ?? 0).toBeGreaterThan(0);
      expect(baseline?.height ?? 0).toBeGreaterThan(0);
    });
  }

  test("a DISABLED plugin contributes nothing — the room is byte-identical to no contribution at all", async ({ mount, page }) => {
    await page.setViewportSize(FLANK_ARMS[0].viewport);
    // A disabled plugin has no resident instance, so `listSurfaces` returns nothing for it — the server-side
    // half of "disabled ⇒ byte-identical room". The row is still in `plugin.list` (it is installed).
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow("disabled")],
      "plugin.listSurfaces": () => [],
    });

    const bare = await mount(<PluginChatFlankRoomStory registered={false} />);
    await expect(page.locator(SCROLLER)).toBeVisible();
    const baseline = await page.locator(SCROLLER).boundingBox();
    expect(baseline, "the transcript must have a box to compare").not.toBeNull();
    await bare.unmount();

    const withPlugin = await mount(<PluginChatFlankRoomStory registered={true} />);
    await expect(page.locator(SCROLLER)).toBeVisible();
    await expect(page.locator(FLANK_SLOT)).toBeHidden();
    await expect(withPlugin.getByText(PLUGIN_NAME)).toHaveCount(0);
    const readBox = async (): Promise<Box> => await page.locator(SCROLLER).boundingBox();
    await expect.poll(async () => (await readBox())?.width).toBe(baseline?.width);
    await expect.poll(async () => (await readBox())?.height).toBe(baseline?.height);
  });

  test("a registered chat-flank surface renders in the PLUGIN-LABELLED shell, beside the transcript", async ({ mount, page }) => {
    await page.setViewportSize(FLANK_ARMS[0].viewport);
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow("enabled")],
      "plugin.listSurfaces": () => [surfaceRow("chat-flank", "affinity_flank", "Warmth", FLANK_SPEC)],
      "plugin.getSurfaceState": () => FLANK_STATE,
    });

    const component = await mount(<PluginChatFlankRoomStory registered={true} />);

    const flank = page.locator(FLANK_SLOT);
    await expect(flank).toBeVisible();
    // THE IMPERSONATION WALL (§4.8): the surface is inside first-party chrome that names its author, and the
    // body is a labelled group region carrying "«plugin» — «title»".
    await expect(flank.getByText(PLUGIN_NAME, { exact: true })).toBeVisible();
    await expect(flank.getByRole("group", { name: `${PLUGIN_NAME} — Warmth` })).toBeVisible();
    // …and the spec's bound values resolved against the PUBLISHED state, not their fallbacks.
    await expect(component.getByText("Your latest warmth reading, 7 of 10.")).toBeVisible();
    // The room still loaded (a flank widget must never cost the transcript its scroll window — #680).
    await expect(page.locator(SCROLLER)).toBeVisible();
  });

  test("a soft keyboard opened by a field inside the inline flank keeps that field, and the typing lands in it", async ({ mount, page }) => {
    await page.setViewportSize(FLANK_ARMS[0].viewport);
    const fieldSpec: NonNullable<PluginSurfaceRow["spec"]> = { kind: "textField", name: "note", label: "Note" };
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow("enabled")],
      "plugin.listSurfaces": () => [surfaceRow("chat-flank", "notes", "Notes", fieldSpec)],
      "plugin.getSurfaceState": () => null,
    });
    const component = await mount(<PluginChatFlankRoomStory registered={true} />);
    const field = component.getByRole("textbox", { name: "Note", exact: true });
    await field.focus();
    // The soft keyboard this focus raised: the shell marks the root while it is up.
    await page.evaluate(() => document.documentElement.toggleAttribute("data-keyboard-up", true));
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    await page.keyboard.type("north gate");
    await expect(field).toHaveValue("north gate");
    // Control: with focus back in the transcript's column, the same keyboard folds the flank away.
    await field.blur();
    await expect(page.locator('[data-slot="plugin-flank"]')).toBeHidden();
    await page.evaluate(() => document.documentElement.toggleAttribute("data-keyboard-up", false));
  });

  test("desktop: chat-flank surfaces show beside the transcript, with a collapse control and no sheet", async ({ mount, page }) => {
    await page.setViewportSize(FLANK_ARMS[0].viewport);
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow("enabled")],
      "plugin.listSurfaces": () => [surfaceRow("chat-flank", "affinity_flank", "Warmth", FLANK_SPEC)],
      "plugin.getSurfaceState": () => FLANK_STATE,
    });
    const component = await mount(<PluginFlankSheetRoomStory />);
    await expect(component.getByText("Your latest warmth reading, 7 of 10.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide plugin panels", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Plugin panels", exact: true })).toHaveCount(0);
  });

  test("§4.9: a BOUND flank surface with nothing published stays silent — no blank meter in the room", async ({ mount, page }) => {
    await page.setViewportSize(FLANK_ARMS[0].viewport);
    // The registration is live, but the plugin has published no state yet (`getSurfaceState` → null): the
    // spec's `{ $state }` values would render as an empty meter and a blank line — the "broken frame" §4.9
    // refuses. The surface must simply not be there yet.
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow("enabled")],
      "plugin.listSurfaces": () => [surfaceRow("chat-flank", "affinity_flank", "Warmth", FLANK_SPEC)],
      "plugin.getSurfaceState": () => null,
    });

    const bare = await mount(<PluginChatFlankRoomStory registered={false} />);
    await expect(page.locator(SCROLLER)).toBeVisible();
    const baseline = await page.locator(SCROLLER).boundingBox();
    await bare.unmount();

    const component = await mount(<PluginChatFlankRoomStory registered={true} />);
    await expect(page.locator(SCROLLER)).toBeVisible();
    await expect(component.getByText(PLUGIN_NAME)).toHaveCount(0);
    await expect(page.locator(FLANK_SLOT)).toBeHidden();
    const readBox = async (): Promise<Box> => await page.locator(SCROLLER).boundingBox();
    await expect.poll(async () => (await readBox())?.width).toBe(baseline?.width);
    await expect.poll(async () => (await readBox())?.height).toBe(baseline?.height);
  });
});

// ── Hiding a plugin's chat panels, and the phone's header sheet ───────────────────────────────────────────

const OTHER_ID = mintTypeId(ID_PREFIX.plugin);
const OTHER_NAME = "Other Plugin";
const HIDE_NOTICE = `${PLUGIN_NAME} hidden from chat`;

/** `settings.getUserSettings` and its section write over ONE profile, the way the server keeps it. */
function hiddenPluginRoutes(): TrpcRoutes<"settings.getUserSettings" | "settings.updateUserSettingsSection"> {
  let profile: { readonly hiddenChatPluginIds: readonly PluginId[]; readonly flankCollapsed: boolean } = { hiddenChatPluginIds: [], flankCollapsed: false };
  const view = (): ReturnType<typeof userSettingsView> =>
    userSettingsView({ profile: { hiddenChatPluginIds: [...profile.hiddenChatPluginIds], flankCollapsed: profile.flankCollapsed } });
  return {
    "settings.getUserSettings": () => view(),
    "settings.updateUserSettingsSection": (input: TrpcInput<"settings.updateUserSettingsSection">): ReturnType<typeof view> => {
      profile = { ...profile, ...input.patch };
      return view();
    },
  };
}

const HIDE_AFFINITY = { section: "profile", patch: { hiddenChatPluginIds: [AFFINITY_ID] } };
const SHOW_ALL = { section: "profile", patch: { hiddenChatPluginIds: [] } };

test("a plugin's chat panel hides in one tap, Undo brings it back, and its row's switch shows it again — other plugins are untouched", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(FLANK_ARMS[0].viewport);
  const recorder = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...ROOM_ROUTES,
    ...hiddenPluginRoutes(),
    "plugin.list": () => [pluginRow("enabled"), { ...pluginRow("enabled"), id: OTHER_ID, slug: "other-plugin", name: OTHER_NAME }],
    "plugin.listSurfaces": () => [
      surfaceRow("chat-flank", "affinity_flank", "Warmth", FLANK_SPEC),
      { ...surfaceRow("chat-flank", "other_flank", "Moods", { kind: "text", value: "other mood" }), pluginId: OTHER_ID },
    ],
    "plugin.getSurfaceState": () => FLANK_STATE,
  });
  await mount(<PluginChatVisibilityStory />);

  const warmth = page.getByRole("group", { name: `${PLUGIN_NAME} — Warmth` });
  const moods = page.getByRole("group", { name: `${OTHER_NAME} — Moods` });
  const showInChat = page.getByRole("group", { name: `${PLUGIN_NAME} plugin` }).getByRole("switch", { name: `Show ${PLUGIN_NAME}'s panel in chat` });
  await expect(warmth).toBeVisible();
  await expect(showInChat).toBeChecked();

  // HIDE — one tap on the panel itself.
  await page.getByRole("button", { name: `Hide ${PLUGIN_NAME}` }).click();
  await expect(warmth).toHaveCount(0);
  await expect(moods).toBeVisible();
  await expect(showInChat).not.toBeChecked();
  await expect.poll(() => recorder.lastInput("settings.updateUserSettingsSection")).toEqual(HIDE_AFFINITY);

  // UNDO — from the notice the hide left behind.
  const alerts = page.getByLabel("Alerts");
  await expect(alerts.getByText(HIDE_NOTICE, { exact: true })).toBeVisible();
  await alerts.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(warmth).toBeVisible();
  await expect(showInChat).toBeChecked();
  await expect.poll(() => recorder.lastInput("settings.updateUserSettingsSection")).toEqual(SHOW_ALL);

  // RE-SHOW — hidden again, then brought back from the plugin's own row in the Plugins pane.
  await page.getByRole("button", { name: `Hide ${PLUGIN_NAME}` }).click();
  await expect(warmth).toHaveCount(0);
  await showInChat.click();
  await expect(warmth).toBeVisible();
  await expect.poll(() => recorder.lastInput("settings.updateUserSettingsSection")).toEqual(SHOW_ALL);
  await expect(moods).toBeVisible();
});

/** A frame surface beside the static one, so a second mount of the flank would show as a second mint. */
const FRAME_SURFACE_ROW: PluginSurfaceRow = { pluginId: AFFINITY_ID, id: "affinity_board", anchor: "chat-flank", title: "Board", tier: "frame" };
const FRAME_URL = `${PLUGIN_FRAME_ROUTE}/0123456789abcdef0123456789abcdef`;
const SHEET_TRIGGER = { name: "Plugin panels", exact: true } as const;

test.describe("a touch device", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 740 } });

  test("the flank panels leave the transcript for the header's sheet and mount exactly once", async ({ mount, page }) => {
    let mints = 0;
    await page.route(`**${PLUGIN_FRAME_ROUTE}`, (route) => {
      mints += 1;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: FRAME_URL, expiresInMs: 1_800_000 }) });
    });
    await page.route(`**${FRAME_URL}`, (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        headers: { "content-security-policy": "sandbox allow-scripts" },
        body: "<!doctype html><p>BOARD</p>",
      }),
    );
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      // A room MEMBER, not its host: the panels are the viewer's own plugins' and the header icon is not host-gated.
      "chat.getChat": () => ({ participants: [], anchorPersonaId: null, identities: [], group: DEFAULT_GROUP_CONFIG, viewerIsHost: false }),
      ...hiddenPluginRoutes(),
      "plugin.list": () => [pluginRow("enabled")],
      "plugin.listSurfaces": () => [surfaceRow("chat-flank", "affinity_flank", "Warmth", FLANK_SPEC), FRAME_SURFACE_ROW],
      "plugin.getSurfaceState": () => FLANK_STATE,
    });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches), "hasTouch must make this a coarse pointer").toBe(true);

    // BASELINE: the same room with no plugin contribution at all.
    const bare = await mount(<PluginChatFlankRoomStory registered={false} />);
    await expect(page.locator(SCROLLER)).toBeVisible();
    const baseline = await page.locator(SCROLLER).boundingBox();
    await bare.unmount();

    await mount(<PluginFlankSheetRoomStory />);
    await expect(page.locator(SCROLLER)).toBeVisible();
    const trigger = page.getByRole("button", SHEET_TRIGGER);
    await expect(trigger).toBeInViewport();
    // Closed: the transcript keeps the whole column, and nothing of the plugin is mounted anywhere.
    await expect.poll(async () => (await page.locator(SCROLLER).boundingBox())?.height).toBe(baseline?.height);
    await expect(page.getByText(PLUGIN_NAME)).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);

    await trigger.click();
    await expect(page.getByRole("group", { name: `${PLUGIN_NAME} — Warmth` })).toHaveCount(1);
    await expect(page.getByRole("group", { name: `${PLUGIN_NAME} — Board` })).toHaveCount(1);
    await expect(page.locator("iframe")).toHaveCount(1);
    // The frame was minted for ONE mount; the inline flank never mounted a second copy.
    await expect(page.locator(FLANK_SLOT)).toBeHidden();
    expect(mints).toBe(1);
  });

  test("hiding the last panel closes the sheet and takes its icon with it; Undo brings both back", async ({ mount, page }) => {
    const recorder = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      ...hiddenPluginRoutes(),
      "plugin.list": () => [pluginRow("enabled")],
      "plugin.listSurfaces": () => [surfaceRow("chat-flank", "affinity_flank", "Warmth", FLANK_SPEC)],
      "plugin.getSurfaceState": () => FLANK_STATE,
    });
    await mount(<PluginFlankSheetRoomStory />);

    await page.getByRole("button", SHEET_TRIGGER).click();
    await page.getByRole("button", { name: `Hide ${PLUGIN_NAME}` }).click();
    await expect(page.getByRole("button", SHEET_TRIGGER)).toHaveCount(0);
    await expect(page.getByRole("group", { name: `${PLUGIN_NAME} — Warmth` })).toHaveCount(0);
    await expect.poll(() => recorder.lastInput("settings.updateUserSettingsSection")).toEqual(HIDE_AFFINITY);

    await page.getByLabel("Alerts").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("button", SHEET_TRIGGER)).toBeVisible();
    await expect.poll(() => recorder.lastInput("settings.updateUserSettingsSection")).toEqual(SHOW_ALL);
  });
});

/** The phone shell's reads, the room's, and the plugin plane's, with a frame beside a static panel. */
async function routePhoneShell(page: Page): Promise<{ readonly mints: () => number }> {
  let mints = 0;
  await page.route(`**${PLUGIN_FRAME_ROUTE}`, (route) => {
    mints += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: FRAME_URL, expiresInMs: 1_800_000 }) });
  });
  await page.route(`**${FRAME_URL}`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      headers: { "content-security-policy": "sandbox allow-scripts" },
      body: "<!doctype html><p>BOARD</p>",
    }),
  );
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...ROOM_ROUTES,
    ...hiddenPluginRoutes(),
    // The shell's own ambient reads, at their empty-but-real defaults: none of them is this file's subject.
    ...CHAT_AND_INBOX_READS_EMPTY,
    "character.list": () => ({ items: [], nextCursor: null, totalCount: 0 }),
    "databank.list": () => ({ items: [], nextCursor: null, totalCount: 0 }),
    "databank.bankHealth": () => ({
      byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 },
      chunks: 0,
      passages: 0,
      staleExtraction: 0,
      total: 0,
    }),
    "persona.list": () => [],
    "regex.countScripts": () => 0,
    "rosterPreset.count": () => 0,
    "worldInfo.countBooks": () => 0,
    "settings.listThemes": () => [],
    "sessions.me": () => ({ userId: "user_ct_plugin_shell", handle: "ct_plugin_shell", globalRole: "user" }),
    "plugin.list": () => [pluginRow("enabled")],
    "plugin.listSurfaces": () => [FRAME_SURFACE_ROW],
    "plugin.getSurfaceState": () => FLANK_STATE,
  });
  return { mints: (): number => mints };
}

test.describe("the phone shell", () => {
  test.use({ hasTouch: true });

  test("the plugin panels icon rides the topbar beside the roster chip", async ({ mount, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routePhoneShell(page);
    await mount(<PluginPhoneShellStory />);
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches), "hasTouch must make this a coarse pointer").toBe(true);
    await expect(page.locator(SCROLLER)).toBeVisible();
    const topbar = page.locator(".shell-topbar");
    await expect(topbar.getByRole("button", { name: SHEET_TRIGGER.name, exact: true })).toBeVisible();
    await expect(topbar.getByRole("button", { name: SHEET_TRIGGER.name, exact: true })).toBeInViewport();
  });
});

test("a pointer that turns coarse mid-session leaves exactly one host for the frame, even after the header remounts", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const routed = await routePhoneShell(page);
  await mount(<PluginPhoneShellStory />);
  await expect(page.locator(SCROLLER)).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(1);

  // The device flips from a fine pointer to a coarse one (a detached keyboard, a tablet undocked).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  try {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the flip must reach the page").toBe(true);

    // Both hosts follow the flip together: the inline flank stands down and the header icon takes over.
    const trigger = page.locator(".shell-topbar").getByRole("button", { name: SHEET_TRIGGER.name, exact: true });
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(trigger).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Hide|Show) plugin panels$/ })).toHaveCount(0);

    // The header slot is keyed by section, so a round trip remounts it while the room stays alive.
    await page.getByRole("button", { name: "Hop to config" }).click();
    await page.getByRole("button", { name: "Hop to chats" }).click();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("group", { name: `${PLUGIN_NAME} — Board` })).toHaveCount(1);
    await expect(page.locator("iframe")).toHaveCount(1);
    // Every mint belongs to a mount that is, or was, the only one: the live count is the sheet's alone.
    expect(routed.mints()).toBeGreaterThan(0);
  } finally {
    // CDP touch emulation outlives the test that set it.
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
});

/** The one control a column has, found by its house verbs wherever it sits. */
const PANEL_CONTROL = /^(Hide|Show) plugin panels$/;

test("on a mid-width desktop the flank starts collapsed to its edge tab, opens over the transcript without reflow, and never moves a frame", async ({
  mount,
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const routed = await routePhoneShell(page);
  await mount(<PluginPhoneShellStory dockPanels={true} />);
  const scroller = page.locator(SCROLLER);
  await expect(scroller).toBeVisible();

  // No room for the transcript to hold its floor beside the column: the column waits at its edge, one tab, no sheet.
  const control = page.getByRole("button", { name: PANEL_CONTROL });
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName("Show plugin panels");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: SHEET_TRIGGER.name, exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(1);
  const floor = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "calc(var(--dimension-content-reading-floor) - 2 * var(--spacing-block))";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  const closed = await scroller.boundingBox();
  expect(closed?.width ?? 0).toBeGreaterThanOrEqual(floor);
  const tab = await control.boundingBox();

  // Opened, it overlays from the room's edge at its design width; the transcript does not move or resize.
  await control.click();
  await expect(control).toHaveAccessibleName("Hide plugin panels");
  const column = page.locator(FLANK_SLOT);
  await expect.poll(async () => (await column.boundingBox())?.x ?? 0).toBeLessThan(closed === null ? 0 : closed.x + closed.width);
  await expect.poll(async () => (await scroller.boundingBox())?.width).toBe(closed?.width);
  await expect.poll(async () => (await scroller.boundingBox())?.x).toBe(closed?.x);
  const design = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--width-sidebar-sm)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  await expect.poll(async () => (await column.boundingBox())?.width ?? 0).toBeCloseTo(design, 0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await control.boundingBox())?.x).toBe(tab?.x);
  await expect.poll(async () => (await control.boundingBox())?.y).toBe(tab?.y);

  // Past the threshold the same column goes inline: nothing was remounted along the way.
  await page.setViewportSize({ width: 1920, height: 1000 });
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(routed.mints()).toBe(1);
});

test("the plugin column collapses and expands from its own edge: one control that never moves, the transcript takes and gives back the width, one frame throughout, and the choice survives a reload", async ({
  mount,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const routed = await routePhoneShell(page);
  const component = await mount(<PluginPhoneShellStory />);
  const scroller = page.locator(SCROLLER);
  const widthOf = async (): Promise<number> => (await scroller.boundingBox())?.width ?? 0;
  const control = page.getByRole("button", { name: PANEL_CONTROL });
  await expect(scroller).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(1);
  const expanded = await widthOf();
  // The side panels' own control is the only other panel control: the topbar carries none of ours.
  await expect(page.locator(".shell-topbar").getByRole("button", { name: PANEL_CONTROL })).toHaveCount(0);
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName("Hide plugin panels");
  await expect(control).toHaveAttribute("aria-expanded", "true");
  const spot = await control.boundingBox();

  await control.click();
  await expect(control).toHaveAccessibleName("Show plugin panels");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await expect(control).toHaveCount(1);
  await expect.poll(widthOf).toBeGreaterThan(expanded + 100);
  // The control did not move under the pointer.
  await expect.poll(async () => (await control.boundingBox())?.x).toBe(spot?.x);
  await expect.poll(async () => (await control.boundingBox())?.y).toBe(spot?.y);
  // Collapsing slides the column out without unmounting its frame, so expanding cannot mint a second one.
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(routed.mints()).toBe(1);

  await control.click();
  await expect(control).toHaveAccessibleName("Hide plugin panels");
  await expect.poll(widthOf).toBeCloseTo(expanded, 0);
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(routed.mints()).toBe(1);

  // The setting round-trips: collapse, remount the whole shell, and it comes back collapsed.
  await control.click();
  await expect.poll(widthOf).toBeGreaterThan(expanded + 100);
  await component.unmount();
  await mount(<PluginPhoneShellStory />);
  await expect(page.locator(SCROLLER)).toBeVisible();
  await expect(page.getByRole("button", { name: PANEL_CONTROL })).toHaveAccessibleName("Show plugin panels");
  await expect.poll(widthOf).toBeGreaterThan(expanded + 100);
  await expect(page.locator("iframe")).toHaveCount(1);
});

test.describe("the phone topbar", () => {
  test.use({ hasTouch: true });

  for (const width of [390, 430]) {
    test(`@${width}: the plugin panels icon costs the topbar no height`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await routePhoneShell(page);
      await mount(<PluginPhoneShellStory />);
      await expect(page.locator(SCROLLER)).toBeVisible();
      const trigger = page.locator(".shell-topbar").getByRole("button", { name: SHEET_TRIGGER.name, exact: true });
      await expect(trigger).toBeVisible();
      const topbarHeight = async (): Promise<number> => (await page.locator(".shell-topbar").boundingBox())?.height ?? 0;
      const withTrigger = await topbarHeight();
      await trigger.evaluate((element) => {
        element.style.display = "none";
      });
      await expect.poll(topbarHeight).toBe(withTrigger);
    });
  }
});

// ── The `chat-settings-section` anchor, inside the "This chat" tab's host-only band ────────────────────────

/** The tab's own sections all suspend on reads of their own; a section left unfed renders its error arm and
 *  the composition contract silently stops being covered (#629). Same feed as settings-context-tab.ct.tsx. */
const TAB_ROUTES: TrpcRoutes<
  | "chat.getGroupConfig"
  | "chat.setRoomOverrides"
  | "databank.listActiveForChat"
  | "worldInfo.listForChat"
  | "chat.listChatInjections"
  | "chat.getUserMacroPicks"
  | "chat.getVariablePicks"
  | "settings.getUserSettings"
  | "chat.getChat"
> = {
  "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
  "chat.setRoomOverrides": () => ({}),
  "databank.listActiveForChat": () => [],
  "worldInfo.listForChat": () => [],
  "chat.listChatInjections": () => [],
  "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
  "chat.getVariablePicks": () => ({ variables: [], values: {} }),
  "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: null } }),
  "chat.getChat": () => ({ id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] }),
  // The #1742 Regex section's four reads (#1786). Its HEADING chip reads `chat.listEffectiveRegex`
  // eagerly — outside any disclosure — so an unfed tab took the section's error arm and the whole host
  // band failed to render, which is what made the two tests below red. The shared off-and-empty
  // projection, not a populated one: this file is about PLUGIN ANCHORS, and a script row would put an
  // unrelated surface's rows in the band these tests count headings in.
  ...REGEX_READS_EMPTY,
};

/** The panel a plugin registers at `chat-settings-section`: one bound line plus an action. */
const PANEL_SPEC: NonNullable<PluginSurfaceRow["spec"]> = {
  kind: "stack",
  gap: "block",
  children: [
    { kind: "text", value: { $state: "summary" } },
    { kind: "button", actionId: "refresh", label: "Refresh readings", variant: "outline" },
  ],
};

test("the grafted section paints NOTHING — not even its heading — when the caller has no plugin panels", async ({ mount, page }) => {
  await routeTrpc(page, { ...TAB_ROUTES, "plugin.list": () => [pluginRow("enabled")], "plugin.listSurfaces": () => [] });

  const component = await mount(<PluginChatSettingsSectionStory />);

  // The tab itself rendered (so the absence below is a real absence, not a dead mount).
  await expect(component.getByRole("heading", { name: "Host controls", level: 3 })).toBeVisible();
  // Opening the native band must not expose an empty foreign section. Grafts are peers now; their
  // keepMounted bodies let the host collapse empty chrome independently of either disclosure posture.
  await openContextSections(component, HOST_BAND);
  // …and the plugin section is not there: the contribution mounts (its `when` cannot see the data) and
  // renders null, and the host's grafted <Section> collapses with it.
  await expect(component.getByRole("heading", { name: "Plugin controls" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Plugin controls" })).toHaveCount(0);
});

test("a chat-settings-section surface renders in the labelled shell, and its action repaints the published state", async ({ mount, page }) => {
  // STATEFUL state read: the summary the action publishes only exists after the round-trip, so the barrier
  // below settles on the post-invoke invalidate's repaint rather than on an in-flight flash.
  let refreshed = false;
  await routeTrpc(page, {
    ...TAB_ROUTES,
    "plugin.list": () => [pluginRow("enabled")],
    "plugin.listSurfaces": () => [surfaceRow("chat-settings-section", "affinity_room", "Room readings", PANEL_SPEC)],
    "plugin.getSurfaceState": () => (refreshed ? { summary: "Warmth in this room: 7 of 10." } : { summary: "No readings yet." }),
    "plugin.invokeUiAction": () => {
      refreshed = true;
      return { toasts: [] };
    },
  });

  const component = await mount(<PluginChatSettingsSectionStory />);

  // Plugin panels opt into discovery independently of the native band. The shared opener also respects
  // an already-open section, so this existing action contract covers the same panel after its move.
  await openContextSections(component, HOST_BAND, "Plugin controls");

  await expect(component.getByRole("heading", { name: "Plugin controls" })).toBeVisible();
  await expect(component.getByRole("group", { name: `${PLUGIN_NAME} — Room readings` })).toBeVisible();
  await expect(component.getByText("No readings yet.")).toBeVisible();

  await component.getByRole("button", { name: "Refresh readings" }).click();

  // The round-trip landed and its invalidate repainted the surface — a SETTLED rendered state.
  await expect(component.getByText("Warmth in this room: 7 of 10.")).toBeVisible();
});
