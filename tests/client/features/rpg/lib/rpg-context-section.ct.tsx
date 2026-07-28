// CT: the rpg CP-4 LITE takeover (features/rpg — the `rpgContextTabs` contributions rendered through the REAL
// chats SectionContextHost via the contributor seam, over the stubbed network). Drives the production path:
// `chat.getChat` supplies the roster + the rpg POINTER (the takeover APPLICABILITY gate, §4.1); `rpg.getGame`
// carries the mode/read-only trim; `rpg.getTrackerView` feeds every tab. Asserts the four things the W3b brief
// pins: (1) the 4 game tabs render (in the "Game" strip) when `chat.rpg !== null`, with the meta strip below;
// (2) a tab body renders real tracker data; (3) an editable block fires its mutation (the mutation COUNT, per
// [assert-the-mutation-fired] — not the UI reaction); (4) the read-only pill shows + disables edits when
// `trackersReadOnly`. The roster/view stubs return only what the panel reads (a partial shape, the chats-
// section.ct ROSTER_STUB posture); every value crosses the routeTrpc JSON boundary as a plain object.

import type { RpgExtractionMode } from "@orb/contracts/rpg";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { RpgTakeoverStory } from "../_ct-stories";

const GAME_ID = "rpg_game_ct_keystone";

// A `chat.getChat` stub carrying the rpg POINTER (fires the takeover) + the host gate + the viewer identity.
function gameChat(): unknown {
  return {
    participants: [{ kind: "human", role: "host", userId: "user_ct", characterId: null }],
    viewerUserId: "user_ct",
    viewerIsHost: true,
    pendingHostUserId: null,
    roomOverrides: {},
    background: null,
    rpg: { gameId: GAME_ID },
  };
}

// A `rpg.getGame` stub — the lite mode trim + the read-only flag (the CP pill gate) + the delivery-model
// knob (the freshness-indicator driver). Defaults `reliable` (the create default) unless overridden.
function gameView(trackersReadOnly: boolean, extractionMode: RpgExtractionMode = "reliable"): unknown {
  return {
    id: GAME_ID,
    chatId: "chat_ct_keystone",
    mode: "lite",
    status: "active",
    trackersReadOnly,
    extractionMode,
    publicConfig: {
      statProfile: {
        attributes: [],
        range: { min: 0, max: 20 },
        modifier: { center: 10, step: 2 },
        skillGoverning: {},
        defaultAttribute: "",
        perceptionAttribute: "",
        resolution: { kind: "house-d20" },
      },
    },
  };
}

// A `rpg.getTrackerView` stub — one roster actor with pools + a condition, ambient + orbs, cast, a goal, beats.
function trackerView(trackersReadOnly: boolean): unknown {
  return {
    ambient: { location: "The Rusted Lantern — Common Room", calendarDate: null, clock: { day: 3, hour: 21, minute: 0 }, weather: { type: "rain" } },
    actors: [
      {
        actorRef: { kind: "character", characterId: "character_ct_mara" },
        name: "Mara",
        sheet: { className: "Warden", attributes: {}, poolDefs: [], maxHp: null },
        volatile: {
          actorRef: { kind: "character", characterId: "character_ct_mara" },
          hp: null,
          pools: [
            { name: "Vitality", value: 24, max: 30 },
            { name: "Resolve", value: 7, max: 10 },
          ],
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [],
          wallet: [],
          status: "",
        },
      },
    ],
    // biome-ignore lint/style/useNamingConvention: `customFields` keys are DISPLAY-NAME data (a cast card's field label), not code identifiers — the fixture mirrors the wire shape.
    cast: [{ key: "sera", name: "Sera", characterId: undefined, emoji: "", mood: "guarded", customFields: { Trust: "low" } }],
    widgets: [],
    quests: [{ id: "q1", name: "Keep the bone key", status: "active", description: "", objectives: [{ id: "o1", text: "Hold the door", completed: true }] }],
    recentBeats: ["The rain has not let up since dusk."],
    trackersReadOnly,
    poolOrbs: [
      { label: "Vitality", value: 24, max: 30 },
      { label: "Resolve", value: 7, max: 10 },
    ],
  };
}

function stubTakeover(page: Page, opts: { readonly readOnly?: boolean } = {}): ReturnType<typeof routeTrpc> {
  const readOnly = opts.readOnly ?? false;
  return routeTrpc(page, {
    "chat.getChat": () => gameChat(),
    "rpg.getGame": () => gameView(readOnly),
    "rpg.getTrackerView": () => trackerView(readOnly),
    "rpg.editSnapshot": () => undefined,
    // The chat panel's own reads (the meta strip's tabs suspend on these when opened).
    "chat.listChatInjections": () => [],
  });
}

test("the takeover renders the 4 LITE game tabs (in the Game strip) when chat.rpg !== null, meta strip below", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The four rpg game tabs live in the "Game" strip (the §4.2 bracket's top row).
  const gameStrip = component.getByRole("tablist", { name: "Game" });
  await Promise.all(["Status", "Sheet", "Inventory", "Scene"].map((label) => expect(gameStrip.getByRole("tab", { name: label })).toBeVisible()));
  // Quests/Journal/Map are lite APPLICABILITY-omitted — never contributed.
  await expect(gameStrip.getByRole("tab", { name: "Quests" })).toHaveCount(0);
  // The chat meta set sits in the "Chat" strip below (the bracket's bottom row).
  const metaStrip = component.getByRole("tablist", { name: "Chat" });
  await expect(metaStrip.getByRole("tab", { name: "Settings" })).toBeVisible();
});

test("a tab body renders real tracker data (Status: roster row + pool meters + condition + orbs)", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The header scene banner + a pool orb datum (the visually-hidden `label value/max`) — these ride the
  // `.shell-panel-header` BAND above both strips (the W3c header-contributor seam), not the tab body.
  await expect(component.getByText("The Rusted Lantern — Common Room")).toBeVisible();
  await expect(component.getByText("Vitality 24/30")).toBeVisible();
  // The freshness indicator rides the same band — the getGame stub defaults `reliable` with no live turn,
  // so the accepted one-beat-lag label is surfaced (the honest freshness posture, in real panel geometry).
  await expect(component.getByText("As of last beat")).toBeVisible();
  // The roster row: name + className + the pool MeterRow value text + the condition chip.
  await expect(component.getByText("Mara")).toBeVisible();
  await expect(component.getByText("Warden")).toBeVisible();
  await expect(component.getByText("poisoned")).toBeVisible();
});

test("an editable pool value fires the editSnapshot mutation (host, writable) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The pool value is an inline editable field (host + not read-only ⇒ onEditValue wired). Change it + commit.
  const vitality = component.getByRole("textbox", { name: "Vitality value" });
  await expect(vitality).toBeVisible();
  await vitality.fill("18");
  await vitality.blur();

  // Assert the MUTATION fired (the count), not the UI reaction (the save-catch could hide a throw).
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("read-only trackers: the pill shows AND edits are disabled (no editable field ⇒ no mutation possible)", async ({ mount, page }) => {
  await stubTakeover(page, { readOnly: true });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The honest-arms read-only pill (§4.4).
  await expect(component.getByText("Trackers read-only")).toBeVisible();
  // No editable pool field renders (the value is static datum text, not an input) — the edit is DISABLED,
  // never a silent drop. This STRUCTURALLY proves no mutation can fire (there is no control to fire it); the
  // static value still reads inside the roster row's meter (scoped past the header orb readouts, which also
  // print "24/30"). A retrying `toHaveCount(0)` is the disabled-edit assertion (not a one-shot count read).
  await expect(component.getByRole("textbox", { name: "Vitality value" })).toHaveCount(0);
  await expect(component.locator('[data-slot="meter-row"]').filter({ hasText: "Vitality" }).first().getByText("24/30")).toBeVisible();
});

// FIX 3 runs on a COARSE (touch) pointer: the design system deliberately compresses controls below 44px on a
// fine pointer (theme.css `@media (pointer: fine)` → control-sm = 2rem), so the ≥44px tap-target floor is a TOUCH
// contract. `hasTouch` flips the primary pointer to coarse, where the shared control tokens deliver 44px by
// construction — the honest place to assert the floor (a fine-pointer measure would read 32px for EVERY control).
test.describe("FIX 3 — consolidated, announced error region", () => {
  test.use({ hasTouch: true, viewport: { width: 420, height: 800 } });

  test("a failed takeover read surfaces ONE announced (role=alert) error region with a ≥44px Retry, not two fragmented blocks", async ({ mount, page }) => {
    // The chat is a game (pointer present, band + body both read the rpg views), but the rpg reads FAIL. Before the
    // fix this rendered TWO unannounced blocks (a generic band "Couldn't load this." + a "Couldn't load status.")
    // with bare ~34px retry links. Now the band collapses silently and the body owns the SINGLE `role="alert"`
    // region with scene-named copy + a real Button retry.
    await routeTrpc(page, {
      "chat.getChat": () => gameChat(),
      "rpg.getGame": () => trpcError({ code: "BAD_REQUEST", message: "incoherent routing: api=agent-sdk is not coherent with source=vllm" }),
      "rpg.getTrackerView": () => trpcError({ code: "BAD_REQUEST", message: "incoherent routing" }),
      "chat.listChatInjections": () => [],
    });
    const component = await mount(<RpgTakeoverStory />);

    // Exactly ONE announced error region (the band's boundary renders null on error — no second block).
    const alert = component.getByRole("alert");
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText("Couldn't load the scene");
    // The generic fallback copy is GONE (no fragmented second block).
    await expect(component.getByText("Couldn't load this.")).toHaveCount(0);

    // Retry is a real Button meeting the ≥44px touch floor (the shared control-sm token = 2.75rem on coarse).
    const retry = alert.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
