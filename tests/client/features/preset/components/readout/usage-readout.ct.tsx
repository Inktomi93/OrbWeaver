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
import { routeTrpc, trpcError } from "../../../../../support/ct/route-trpc.ts";
import { PresetReadoutUsageStory } from "./_readout-stories.tsx";

const PRESET = "preset_ct_readoutbind";
const GM_ROOM = "chat_ct_gmroom0000000000000";

/** The room is titled by its CAST — no authored title on the wire, which is exactly the case a server-side
 *  name got wrong before the chain moved to the client. */
const GM_ROOM_DOOR = /Ythraen/;
const ACTIVE_LINE = /Your active preset/;
const NOT_ACTIVE_LINE = /Not your active preset/;

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
  };
}

test("the CONTEXT panel states the ACTIVE-PICK binding, on a view the chat binding never reaches (#279)", async ({ mount, page }) => {
  await routeTrpc(page, usageRoutes({ isUserDefault: true, gmRooms: [] }));
  const panel = await mount(<PresetReadoutUsageStory />);

  await expect(panel.getByRole("heading", { name: "Used by" })).toBeVisible();
  await expect(panel.getByText(ACTIVE_LINE)).toBeVisible();
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
