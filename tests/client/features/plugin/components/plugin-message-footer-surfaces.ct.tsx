// CT: the plugin `message-footer` anchor (plugin-ui-plane #679 U6, §5.4) over the REAL tRPC path with a
// stubbed network. The subject is the PRODUCTION contribution the door assembles (`pluginMessageFooterSurface`),
// never a test double — so what is pinned is `plugin.listSurfaces` → the per-row fan-out → the inline shell.
//
// THE OWNER'S U6 TEST is the second assertion here ("a badge renders under a message"). The FIRST is the one
// this anchor exists to protect: it mounts once per COMMITTED ROW, so a person with no plugin surfaces must
// get a byte-identical transcript. That is pinned as FULL geometry of the message row at both a wide and a
// NARROW mount (the narrowest-real-mount law — a per-row strip that only fits at 1280px is a defect at 430px),
// against a baseline room with no surface contributors at all.
//
// The third pin is the SILENCE arm the design's state gate names: a `$state`-BOUND footer spec renders NOTHING.
// A per-row mount does not run the room fan-out's per-candidate state pre-pass, so a bound footer would paint
// its FALLBACKS — an empty badge, a blank caption — under every single message until the plugin published.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";
import { PluginMessageFooterRoomStory } from "../_ct-stories.tsx";

type PluginListRow = TrpcWireOutput<"plugin.list">[number];
type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];
type Box = Awaited<ReturnType<Locator["boundingBox"]>>;

const A_PAST_INSTANT = 1_760_000_000_000;
const ORACLE_ID = castId<PluginId>("plugin_ct_oracle000000001");
const PLUGIN_NAME = "Oracle Deck";

const MESSAGE_ROW = '[data-slot="message-row"]';
const FOOTER_SLOT = '[data-slot="message-footer"]';
const SCROLLER = '[data-slot="message-list-scroll"]';

/** One installed row as `plugin.list` projects it — the join the shell's attribution line reads its name from. */
function pluginRow(): PluginListRow {
  return {
    id: ORACLE_ID,
    slug: "oracle-deck",
    name: PLUGIN_NAME,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    updateSource: null,
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

function surfaceRow(spec: PluginSurfaceRow["spec"]): PluginSurfaceRow {
  return { pluginId: ORACLE_ID, id: "draw_badge", anchor: "message-footer", title: "Draw", tier: "static", spec };
}

/** The decoration strip a footer surface is allowed to be: a `row` of badges (the registration schema refuses
 *  anything interactive, bulk or prose at this anchor — pinned in tests/contracts/plugin/ui.contract.test.ts). */
const BADGE_SPEC: NonNullable<PluginSurfaceRow["spec"]> = { kind: "row", gap: "tight", children: [{ kind: "badge", intent: "info", text: "Ace of Cups" }] };
/** A spec that BINDS state — the silence arm: the gate is on the SPEC, so it cannot pass by a timing race. */
const BOUND_SPEC: NonNullable<PluginSurfaceRow["spec"]> = { kind: "badge", text: { $state: "card" } };

const ROOM_ROUTES: TrpcRoutes<"chat.listMessages" | "chat.getChat" | "chat.previewContextFit" | "plugin.getSurfaceState"> = {
  "chat.listMessages": () => makeMessagesPage([makeMessageView({ content: "Hi Aria", role: "user", seq: 1 })]),
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
  // The renderer's own state read (`PluginSurfaceRenderer` reads `getSurfaceState` for every surface it draws).
  // It is keyed by (pluginId, surfaceId), NOT by row — which is why a 200-row transcript still issues one — and
  // it is fed here so the pipeline runs for real rather than on routeTrpc's `null` default.
  "plugin.getSurfaceState": () => null,
};

/** Both ends of the range a transcript row actually renders at — the narrowest real mount is where an
 *  unbudgeted per-row strip shows up as a defect, and a single-width pin is how that gets missed. */
const WIDTH_ARMS = [
  { label: "desktop", viewport: { width: 1280, height: 800 } },
  { label: "phone", viewport: { width: 430, height: 932 } },
] as const;

test.describe("the message-footer anchor", () => {
  for (const { label, viewport } of WIDTH_ARMS) {
    test(`${label}: a caller with NO plugin footer surfaces gets a byte-identical row`, async ({ mount, page }) => {
      await page.setViewportSize(viewport);
      // Installed, enabled, and registering NO surfaces — the common case for anyone who has a plugin at all,
      // and the arm where a mounted-but-silent per-row contributor would cost EVERY row a footer gap.
      await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROOM_ROUTES, "plugin.list": () => [pluginRow()], "plugin.listSurfaces": () => [] });

      const bare = await mount(<PluginMessageFooterRoomStory registered={false} />);
      await expect(page.locator(SCROLLER)).toBeVisible();
      const baseline = await page.locator(MESSAGE_ROW).first().boundingBox();
      expect(baseline, "the row must have a box to compare").not.toBeNull();
      await bare.unmount();

      const withPlugin = await mount(<PluginMessageFooterRoomStory registered={true} />);
      await expect(page.locator(SCROLLER)).toBeVisible();
      await expect(withPlugin.getByText("Couldn't load this conversation.")).toHaveCount(0);
      // The footer slot collapses out of layout entirely (`empty:hidden`), not merely paints empty.
      await expect(page.locator(FOOTER_SLOT)).toBeHidden();
      // FULL geometry, both axes and both origins — the #680 lesson applied to the per-row slot.
      const readBox = async (): Promise<Box> => await page.locator(MESSAGE_ROW).first().boundingBox();
      await expect.poll(async () => (await readBox())?.height).toBe(baseline?.height);
      await expect.poll(async () => (await readBox())?.width).toBe(baseline?.width);
      await expect.poll(async () => (await readBox())?.y).toBe(baseline?.y);
      // …and non-vacuous: a zero-height row would satisfy an equality pin while the transcript was broken.
      expect(baseline?.height ?? 0).toBeGreaterThan(0);
    });
  }

  test("a registered message-footer surface renders its BADGE under the row, in the plugin-labelled inline shell", async ({ mount, page }) => {
    await page.setViewportSize(WIDTH_ARMS[0].viewport);
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow()],
      "plugin.listSurfaces": () => [surfaceRow(BADGE_SPEC)],
    });

    await mount(<PluginMessageFooterRoomStory registered={true} />);

    const footer = page.locator(FOOTER_SLOT).first();
    await expect(footer).toBeVisible();
    // THE BADGE — the owner's U6 test, at the affordance a person actually sees.
    await expect(footer.getByText("Ace of Cups")).toBeVisible();
    // THE IMPERSONATION WALL (§4.8) at the transcript's density: the box is gone, the ATTRIBUTION is not — the
    // plugin's name is visible and the strip is a labelled group region carrying "«plugin» — «title»".
    await expect(footer.getByText(PLUGIN_NAME)).toBeVisible();
    await expect(footer.getByRole("group", { name: `${PLUGIN_NAME} — Draw` })).toBeVisible();
  });

  test("a $state-BOUND footer spec stays SILENT — a per-row surface never renders its fallbacks", async ({ mount, page }) => {
    await page.setViewportSize(WIDTH_ARMS[0].viewport);
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...ROOM_ROUTES,
      "plugin.list": () => [pluginRow()],
      "plugin.listSurfaces": () => [surfaceRow(BOUND_SPEC)],
      // Even WITH state published the strip stays absent: the gate is on the SPEC (it binds `$state`), not on
      // whether the state happens to have arrived — so this arm cannot pass by a race.
      "plugin.getSurfaceState": () => ({ card: "Ace of Cups" }),
    });

    const component = await mount(<PluginMessageFooterRoomStory registered={true} />);

    await expect(page.locator(SCROLLER)).toBeVisible();
    await expect(page.locator(FOOTER_SLOT)).toBeHidden();
    await expect(component.getByText(PLUGIN_NAME)).toHaveCount(0);
  });
});
