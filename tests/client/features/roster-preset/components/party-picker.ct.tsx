// The saved-party picker's LIBRARY plane (RP2): rows render from the routed `rosterPreset.list` (name +
// count + member preview, name-sorted as served), the designed EMPTY state shows when the library is
// bare, delete rides the ConfirmDialog and fires the real `rosterPreset.remove` wire call, and the
// no-active-chat mount hides the chat-scoped affordances ("Add to chat" / "Save current party"). The
// in-room semantics (apply/knobs/config/host gate) are the composed-real int tier's —
// tests/server/entry/compose/roster-preset.int.test.ts — a CT fixture cannot honestly reach them.

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import type { CharacterId, RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { PartyPickerStory } from "../_ct-stories.tsx";

const PARTY_A: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_a"),
  name: "Adventuring Party",
  description: "",
  memberCount: 2,
  members: [
    { characterId: castId<CharacterId>("character_ct_1"), position: 0, talkativeness: null, disabled: false, name: "Ash", avatarHash: null },
    { characterId: castId<CharacterId>("character_ct_2"), position: 1, talkativeness: 0.8, disabled: false, name: "Brook", avatarHash: null },
  ],
  anchorPersonaId: null,
  hasGroupConfig: true,
  updatedAt: 1,
};
const PARTY_B: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_b"),
  name: "Book Club",
  description: "",
  memberCount: 1,
  members: [{ characterId: castId<CharacterId>("character_ct_3"), position: 0, talkativeness: null, disabled: false, name: "Cinder", avatarHash: null }],
  anchorPersonaId: null,
  hasGroupConfig: false,
  updatedAt: 1,
};

test("renders the routed library: names, member counts, previews; chat-scoped affordances stay hidden with no room open", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.list": [PARTY_A, PARTY_B] });

  await mount(<PartyPickerStory />);

  await expect(page.getByText("Adventuring Party")).toBeVisible();
  await expect(page.getByText("Book Club")).toBeVisible();
  await expect(page.getByText("Ash, Brook")).toBeVisible();
  // Per-row START is reachable…
  await expect(page.getByRole("button", { name: "Start a chat with Adventuring Party" })).toBeEnabled();
  // …while the chat-scoped affordances are ABSENT (no room open): no add-to-chat, no save-current.
  await expect(page.getByRole("button", { name: /Add .* to this chat/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save current party" })).toHaveCount(0);
});

test("the empty library shows the designed empty state, not a bare list", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.list": [] });

  await mount(<PartyPickerStory />);

  await expect(page.getByText("No saved parties yet")).toBeVisible();
});

test("delete rides the ConfirmDialog and fires the REAL remove wire call with the row's presetId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "rosterPreset.list": [PARTY_A],
    "rosterPreset.remove": {},
  });

  await mount(<PartyPickerStory />);

  await page.getByRole("button", { name: "Delete Adventuring Party" }).click();
  // The confirm ceremony — a destructive action never fires off the row click alone.
  await expect(page.getByText("Delete this party?")).toBeVisible();
  expect(trpc.count("rosterPreset.remove")).toBe(0);
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => trpc.count("rosterPreset.remove")).toBe(1);
  await expect.poll(() => trpc.lastInput("rosterPreset.remove")).toEqual({ presetId: "roster_preset_ct_a" });
});
