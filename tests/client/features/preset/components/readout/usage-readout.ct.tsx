// CT: the Presets CONTEXT panel's BACKWARD-BINDINGS block (#279 — UI-Arch §4.2 names this section's CONTEXT
// arm "usage/bindings", and until this landed the panel answered only what the preset SETS).
//
// WHAT THE PINS ARE ABOUT, and why each is the thing a typecheck cannot see:
//   · the block renders on a view the chat BINDING deliberately does not reach (`params`) — it is a property
//     of the preset, not of the active hand, so it must not be gated by `BINDING_VIEWS`;
//   · the ACTIVE-PICK arm says which of the two states it is in, in words a reader can act on — a room's
//     preset is its HOST's active pick, so "this is your active preset" IS the binding for ordinary chats
//     (there is no `chats.preset_id` to roster);
//   · a GM-voice room is NAMED by the client's ONE title chain (the fixture room carries no authored title,
//     so a server-side name would read "Untitled chat") and OPENS — asserted at the store action, since this
//     story mounts no chats section to echo it;
//   · the rooms arrive already membership-filtered by the server (`resolveVisibleRooms`), so the block never
//     prints a residue for what was dropped — the count a reader sees is the count they can act on.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../../support/node/route-trpc.ts";
import { PresetReadoutUsageStory } from "./_readout-stories.tsx";

const PRESET = "preset_ct_readoutbind";
const GM_ROOM = "chat_ct_gmroom0000000000000";

/** The room is titled by its CAST — no authored title on the wire, which is exactly the case a server-side
 *  name got wrong before the chain moved to the client. */
const GM_ROOM_DOOR = /Ythraen/;
const ACTIVE_LINE = /Your active preset/;
const NOT_ACTIVE_LINE = /Not your active preset/;
/** The zero-binding arm: it names the state AND both doors out of it. */
const NOTHING_USES_LINE = /Nothing uses this preset yet/;
/** The word that may only be spoken when there is in fact something below it. */
const BELOW_RE = /below/;

const PRESET_DETAIL = {
  id: PRESET,
  name: "Preset R",
  kind: "custom",
  isSystemDefault: false,
  forkedFrom: null,
  createdAt: 0,
  updatedAt: 0,
  config: DEFAULT_PROMPT_CONFIG,
  schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
};

const SETTINGS_VIEW = { userId: "user_ct_readout", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** The OPEN room the readout binds to — the `ChatDetail` fields `use-readout-binding` and its title chain
 *  reach for, at the same shape the sibling readout suites feed (`actions-readout.ct.tsx`'s CHAT_DETAIL). */
const BOUND_CHAT_DETAIL = {
  id: "chat_ct_readoutbound",
  title: "Azarael & the Court",
  starred: false,
  archived: false,
  temporary: false,
  parentChatId: null,
  participants: [],
};

/** The usage wire as the verb shapes it: the active-pick FLAG (a setting, not a room list) + the rooms whose
 *  rpg GM voice redirects here, already filtered to what this caller may open. */
function usageRoutes(usage: unknown): Record<string, unknown> {
  return {
    "preset.get": () => PRESET_DETAIL,
    "preset.list": () => [PRESET_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => trpcError({ message: "no chat connection configured" }),
    "preset.resolveEffective": () => ({ presetId: PRESET, model: "qwen3-32b", knobs: {}, stale: [], qualityMapping: null }),
    "preset.listUsage": () => usage,
    // #649 — the readout's chat BINDING read. `use-readout-binding.ts:51` only fires it when there IS an
    // active chat, and this story has one, so it was a real request riding `routeTrpc`'s null: the binding's
    // whole title-chain + dismiss path ran INERT here. A real (empty-cast, untitled) ChatDetail, so the
    // chain executes; the bindings block under test is a property of the PRESET and does not read it.
    "chat.getChat": () => BOUND_CHAT_DETAIL,
  };
}

test("the CONTEXT panel states the ACTIVE-PICK binding, on a view the chat binding never reaches (#279)", async ({ mount, page }) => {
  await routeTrpc(page, usageRoutes({ isUserDefault: true, gmRooms: [] }));
  const panel = await mount(<PresetReadoutUsageStory />);

  await expect(panel.getByRole("heading", { name: "Used by" })).toBeVisible();
  await expect(panel.getByText(ACTIVE_LINE)).toBeVisible();
});

test("the ZERO-BINDING arm states the answer and points at both doors — never at a list that isn't there", async ({ mount, page }) => {
  // Side-eye 2026-08-19 P2: the not-active copy ended "…through the GM voice of a game below." while the
  // rooms list renders only when there ARE rooms, so the one state the block exists to report — nothing is
  // bound — read as a half-rendered panel. The deictic "below" is now spoken ONLY when something is below.
  await routeTrpc(page, usageRoutes({ isUserDefault: false, gmRooms: [] }));
  const panel = await mount(<PresetReadoutUsageStory />);

  await expect(panel.getByText(NOTHING_USES_LINE)).toBeVisible();
  await expect(panel.getByText(BELOW_RE)).toHaveCount(0);
});

test("USED BY holds ONE position across views — the tail, under whatever the view projects", async ({ mount, page }) => {
  // It was declared BEFORE the `params` block and after every other view's, so the block that is identical
  // on all five views led on one and trailed on four — and the projected readout, which is what the reader
  // came for, was the thing that moved. Asserted on DOM order, which is what both the eye and a screen
  // reader walk.
  await routeTrpc(page, usageRoutes({ isUserDefault: true, gmRooms: [] }));
  const panel = await mount(<PresetReadoutUsageStory />);
  await expect(panel.getByRole("heading", { name: "Used by" })).toBeVisible();

  const isLast = await panel.locator('[data-slot="preset-usage"]').evaluate((el) => el.parentElement?.lastElementChild === el);
  expect(isLast, "the backward-bindings block is the panel's tail on the params view too").toBe(true);
});

test("a GM-VOICE room is named by the ONE title chain and OPENS (#279)", async ({ mount, page }) => {
  await routeTrpc(page, usageRoutes({ isUserDefault: false, gmRooms: [{ id: GM_ROOM, title: null, participantNames: ["Ythraen"], at: 1_700_000_000_000 }] }));
  const panel = await mount(<PresetReadoutUsageStory />);
  const probe = panel.getByRole("status");

  await expect(panel.getByText(NOT_ACTIVE_LINE)).toBeVisible();
  await expect(panel.getByText("GM voice in 1 game")).toBeVisible();

  await panel.getByRole("button", { name: GM_ROOM_DOOR }).click();
  await expect(probe).toContainText("section=chats");
  await expect(probe).toContainText(`chat=${GM_ROOM}`);
});

// A FAILED `preset.listUsage` PRINTED "Checking…" FOR THE REST OF THE SESSION (#1500). `usage.data ===
// undefined` was the block's only branch, so once the client's retries were spent the one panel that answers
// "what breaks if I change this" claimed to still be looking, with no recovery but a page reload. The pin
// drives a fail-then-succeed script so the RETRY is proven to re-read rather than merely re-render.
test("a FAILED usage read says so and its Retry really re-reads — never a permanent 'Checking…' (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    ...usageRoutes({ isUserDefault: true, gmRooms: [] }),
    "preset.listUsage": () => (attempts++ === 0 ? trpcError({ message: "usage read failed" }) : { isUserDefault: true, gmRooms: [] }),
  });
  const panel = await mount(<PresetReadoutUsageStory />);
  const block = panel.locator('[data-slot="preset-usage"]');

  await expect(block.getByText("Couldn't load what uses this preset.")).toBeVisible();
  await expect(block.getByText("Checking…")).toHaveCount(0);

  await block.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("preset.listUsage"), { intervals: [20, 50, 100] }).toBe(2);
  await expect(block.getByText(ACTIVE_LINE)).toBeVisible();
});
