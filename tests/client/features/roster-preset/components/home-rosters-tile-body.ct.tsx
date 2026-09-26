// The Home "Rosters" tile: the account's rosters render in the real home frame, one press starts a chat
// through the one start door (the room first, then the polish and its report), and an empty library
// leaves no tile at all.

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import type { CharacterId, RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { HomeRostersTileStory } from "../_ct-stories.tsx";

const SPIRE: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_spire"),
  name: "The Ashen Spire",
  description: "A dark lady, the knight she hired, and a sword with opinions.",
  characterCount: 3,
  members: [
    { characterId: castId<CharacterId>("character_ct_morgatha"), position: 0, talkativeness: null, disabled: false, name: "Morgatha", avatarHash: null },
    { characterId: castId<CharacterId>("character_ct_sabine"), position: 1, talkativeness: null, disabled: false, name: "Sabine", avatarHash: null },
    { characterId: castId<CharacterId>("character_ct_calamity"), position: 2, talkativeness: null, disabled: false, name: "Calamity", avatarHash: null },
  ],
  anchorPersonaId: null,
  hasGroupConfig: false,
  rules: [],
  updatedAt: 1,
};
// A roster saved from a room carries no description, so its row falls back to the census and names.
const SAVED: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_saved"),
  name: "Book Club",
  description: "",
  characterCount: 1,
  members: [{ characterId: castId<CharacterId>("character_ct_cinder"), position: 0, talkativeness: null, disabled: false, name: "Cinder", avatarHash: null }],
  anchorPersonaId: null,
  hasGroupConfig: true,
  rules: [],
  updatedAt: 1,
};

function applyResult(over: Partial<TrpcFixtureOutput<"rosterPreset.applyToChat">> = {}): TrpcFixtureOutput<"rosterPreset.applyToChat"> {
  return { added: [], alreadyPresent: [], skipped: [], configApplied: false, rulesMinted: [], rulesAlreadyPresent: [], rulesSkipped: [], ...over };
}

test("lists each roster with its description or its scent, and names what each Start applies", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "rosterPreset.list": [SAVED, SPIRE], "automation.listRulePresets": [] });

  await mount(<HomeRostersTileStory />);

  const tile = page.getByRole("region", { name: "Rosters" });
  await expect(tile.getByRole("listitem")).toHaveCount(2);
  await expect(tile.getByText(SPIRE.description)).toBeVisible();
  await expect(tile.getByText("1 character · Cinder")).toBeVisible();
  await expect(tile.getByRole("button", { name: "Start a chat with The Ashen Spire — 3 characters" })).toBeEnabled();
  await expect(tile.getByRole("button", { name: "Start a chat with Book Club — 1 character, group behavior" })).toBeEnabled();
  expect(trpc.unstubbed()).toEqual([]);
});

test("one press starts the room with the roster's cast in order, then applies the roster and reports the start", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "rosterPreset.list": [SPIRE],
    "automation.listRulePresets": [],
    "chat.startChat": { chat: { id: "chat_started_ct", viewerIsHost: true, participants: [] } },
    "rosterPreset.applyToChat": applyResult({ alreadyPresent: ["character_ct_morgatha", "character_ct_sabine", "character_ct_calamity"] }),
  });

  await mount(<HomeRostersTileStory />);
  await page.getByRole("button", { name: /^Start a chat with The Ashen Spire/ }).click();

  await expect(page.getByTestId("cbcf-notice")).toContainText("The Ashen Spire: started with 3 characters");
  await expect.poll(() => trpc.count("chat.startChat")).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.startChat"))
    .toMatchObject({ characterIds: ["character_ct_morgatha", "character_ct_sabine", "character_ct_calamity"], title: "The Ashen Spire" });
  await expect.poll(() => trpc.lastInput("rosterPreset.applyToChat")).toEqual({ presetId: SPIRE.id, chatId: "chat_started_ct" });
});

test("an empty library renders no tile, not a heading over nothing", async ({ mount, page }) => {
  const list = trpcHold();
  await routeTrpc(page, { "rosterPreset.list": list, "automation.listRulePresets": [] });

  await mount(<HomeRostersTileStory />);
  // While the read is in flight the tile holds its place; the settled empty answer then removes it whole.
  await list.requested;
  await expect(page.getByRole("heading", { name: "Rosters" })).toBeVisible();
  list.release([]);

  await expect(page.getByRole("heading", { name: "Rosters" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Start a chat with/ })).toHaveCount(0);
});
