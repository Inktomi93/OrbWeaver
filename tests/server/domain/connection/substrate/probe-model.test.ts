// cheapestChatModelId — the testClaudeAuth verify-turn model pick. Pins the load-bearing claim: it always
// resolves to the haiku tier (the cheapest curated Claude), never the first-in-list opus flagship.

import { describe } from "vitest";
import { CHAT_MODELS } from "../../../../../packages/server/src/domain/connection/catalog/chat-models.ts";
import { cheapestChatModelId } from "../../../../../packages/server/src/domain/connection/substrate/probe-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("cheapestChatModelId", () => {
  test("resolves to the curated haiku entry's id, not the list-first (opus) entry", () => {
    const haiku = CHAT_MODELS.find((m) => m.tier === "haiku");
    expect(haiku).toBeDefined();
    expect(cheapestChatModelId()).toBe(haiku?.id);
    expect(cheapestChatModelId()).not.toBe(CHAT_MODELS[0]?.id);
  });
});
