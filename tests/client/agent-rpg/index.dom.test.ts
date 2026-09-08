// Unit: `buildAgentRpg` — the read-only half of `__orb.rpg()`. It must report the active chat's authoritative
// production views and stay inert on the landing surface; mutations deliberately have no bridge here.

import { buildAgentRpg } from "@orb/client/agent-rpg";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_agent_rpg_a");

// biome-ignore lint/suspicious/noExplicitAny: minimal structural fake of the generated tRPC client proxy.
function fakeClient(): any {
  return {
    rpg: {
      getGame: { query: vi.fn().mockResolvedValue({ id: "game_a", extractionMode: "folded" }) },
      getTrackerView: { query: vi.fn().mockResolvedValue({ ambient: { location: "Kitchen" }, actors: [] }) },
      listJournal: { query: vi.fn().mockResolvedValue([{ title: "Tea with Mira" }]) },
      listTurnToolCalls: { query: vi.fn().mockResolvedValue([{ calls: [{ name: "update_scene" }] }]) },
    },
  };
}

test("landing returns an empty RPG lens without touching the server", async () => {
  const client = fakeClient();
  const read = buildAgentRpg(client, () => null);

  await expect(read()).resolves.toEqual({ chatId: null, game: null, tracker: null, journal: [], turnToolCalls: [] });
  expect(client.rpg.getGame.query).not.toHaveBeenCalled();
});

test("active chat reads game, selected-lineage state, journal, and folded tool records", async () => {
  const client = fakeClient();
  const read = buildAgentRpg(client, () => CHAT_ID);

  await expect(read()).resolves.toMatchObject({
    chatId: CHAT_ID,
    game: { extractionMode: "folded" },
    tracker: { ambient: { location: "Kitchen" } },
    journal: [{ title: "Tea with Mira" }],
    turnToolCalls: [{ calls: [{ name: "update_scene" }] }],
  });
  expect(client.rpg.getGame.query).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID });
  expect(client.rpg.getTrackerView.query).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID });
  expect(client.rpg.listJournal.query).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID, limit: 50 });
  expect(client.rpg.listTurnToolCalls.query).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID, turnLimit: 50 });
});
