// CT: the two CHAT anchors of the plugin UI plane (plugin-ui-plane #679 U2, seam 7) over the REAL tRPC path
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
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { HOST_BAND, openContextSections } from "../../../../support/node/open-context-sections.ts";
import { REGEX_READS_EMPTY } from "../../../../support/node/regex-reads-empty.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";
import { PluginChatFlankRoomStory, PluginChatSettingsSectionStory } from "../_ct-stories.tsx";

/** The transcript box a geometry pin compares — Playwright's own `boundingBox()` return. */
type Box = Awaited<ReturnType<Locator["boundingBox"]>>;

const A_PAST_INSTANT = 1_760_000_000_000;
const AFFINITY_ID = castId<PluginId>("plugin_ct_affinity000001");
const PLUGIN_NAME = "Affinity Tracker";

/** One installed row as `plugin.list` projects it — the join the shell's attribution line reads its name from.
 *  The wire shape is pinned by the router/domain tests, never re-typed here. */
function pluginRow(status: "enabled" | "disabled"): Record<string, unknown> {
  return {
    id: AFFINITY_ID,
    slug: "affinity-tracker",
    name: PLUGIN_NAME,
    version: "1.0.0",
    status,
    origin: "upload",
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** One `listSurfaces` row (the serializable meta + its pluginId; the `onAction` handle stays server-side). */
function surfaceRow(anchor: string, id: string, title: string, spec: unknown): Record<string, unknown> {
  return { pluginId: AFFINITY_ID, id, anchor, title, tier: "static", spec };
}

/** The affinity tracker's ROOM WIDGET, as its seeded `main.js` registers it: a bound meter + a bound caption,
 *  i.e. a surface that has nothing to say until the plugin publishes. */
const FLANK_SPEC = {
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
const ROOM_ROUTES: Readonly<Record<string, unknown>> = {
  "chat.listMessages": () => makeMessagesPage([makeMessageView({ content: "Hi Aria", role: "user", seq: 1 })]),
  // FED, not declared (the unfed-read ratchet): the committed-row footer anchor mounts chat's own reaction pill
  // row (B6, 99b6ba2c6), which reads `chat.listReactions`. It landed AFTER this file and its lane's CT floor did
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
    await expect(flank.getByText(PLUGIN_NAME)).toBeVisible();
    await expect(flank.getByRole("group", { name: `${PLUGIN_NAME} — Warmth` })).toBeVisible();
    // …and the spec's bound values resolved against the PUBLISHED state, not their fallbacks.
    await expect(component.getByText("Your latest warmth reading, 7 of 10.")).toBeVisible();
    // The room still loaded (a flank widget must never cost the transcript its scroll window — #680).
    await expect(page.locator(SCROLLER)).toBeVisible();
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

// ── The `chat-settings-section` anchor, inside the "This chat" tab's host-only band ────────────────────────

/** The tab's own sections all suspend on reads of their own; a section left unfed renders its error arm and
 *  the composition contract silently stops being covered (#629). Same feed as settings-context-tab.ct.tsx. */
const TAB_ROUTES: Readonly<Record<string, unknown>> = {
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
const PANEL_SPEC = {
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
  // #830 — the band is a DISCLOSURE now, so the absence has to be read with it OPEN: a closed band would
  // satisfy this assertion by never mounting the graft at all, which is the vacuous arm. Opening it is
  // also what puts the mechanism under test: the graft's panel is `keepMounted`, so its `display:contents`
  // wrapper is on the page to be asked by `has-[…:empty]:hidden` even while the section itself is closed.
  await openContextSections(component, HOST_BAND);
  // …and the plugin section is not there: the contribution mounts (its `when` cannot see the data) and
  // renders null, and the host's grafted <Section> collapses with it.
  await expect(component.getByRole("heading", { name: "Plugin panels" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Plugin panels" })).toHaveCount(0);
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
      return null;
    },
  });

  const component = await mount(<PluginChatSettingsSectionStory />);

  // #830 — the host band and the grafted section are both disclosures, and a graft starts CLOSED (its body
  // is data-driven). Two presses is the host's real path to a plugin panel.
  await openContextSections(component, HOST_BAND, "Plugin panels");

  await expect(component.getByRole("heading", { name: "Plugin panels" })).toBeVisible();
  await expect(component.getByRole("group", { name: `${PLUGIN_NAME} — Room readings` })).toBeVisible();
  await expect(component.getByText("No readings yet.")).toBeVisible();

  await component.getByRole("button", { name: "Refresh readings" }).click();

  // The round-trip landed and its invalidate repainted the surface — a SETTLED rendered state.
  await expect(component.getByText("Warmth in this room: 7 of 10.")).toBeVisible();
});
