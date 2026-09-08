// Dev-only RPG read bridge. It composes the active-chat store with the production tRPC reads so an agent can
// inspect the same authoritative game state the UI renders without scraping cards or reaching into the DB.
// Deliberately read-only: story and state mutations still go through human UI controls.

import type { ChatId } from "@orb/kit/ids";
import type { TrpcClient } from "#data";
import type { OrbRpgReader } from "../lib/agent-bridge.ts";

export function buildAgentRpg(client: TrpcClient, readChatId: () => ChatId | null): OrbRpgReader {
  return async () => {
    const chatId = readChatId();
    if (chatId === null) {
      return { chatId: null, game: null, tracker: null, journal: [], turnToolCalls: [] };
    }
    const [game, tracker, journal, turnToolCalls] = await Promise.all([
      client.rpg.getGame.query({ chatId }),
      client.rpg.getTrackerView.query({ chatId }),
      client.rpg.listJournal.query({ chatId, limit: 50 }),
      client.rpg.listTurnToolCalls.query({ chatId, turnLimit: 50 }),
    ]);
    return { chatId, game, tracker, journal, turnToolCalls };
  };
}
