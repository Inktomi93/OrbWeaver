import { generationUsageLegSchema } from "@orb/contracts/inference";
import type { chatGenerationObservations } from "@orb/db";
import type { ChatId, ChatTurnId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { groupObservationRows } from "../../../../../packages/server/src/domain/chat/substrate/generation-observation.ts";
import { makeGenerationUsage } from "../../../../support/factories/generation-usage.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("operation grouping keeps chat identity, private funding and physical leg order distinct", ({ ids, clock }) => {
  const chat = castId<ChatId>(ids.next(ID_PREFIX.chat));
  const otherChat = castId<ChatId>(ids.next(ID_PREFIX.chat));
  const turn = castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn));
  const funder = castId<UserId>(ids.next("user"));
  const otherFunder = castId<UserId>(ids.next("user"));
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(null),
    model: "observed-model",
    provider: "google",
    wire: "google-generative-ai",
    observedAt: clock.now(),
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "stop",
    stopReason: "STOP",
    terminalReason: null,
    generationId: null,
  });
  const row: typeof chatGenerationObservations.$inferSelect = {
    ...leg,
    chatId: chat,
    turnId: turn,
    ordinal: 0,
    sourceMessageId: null,
    sourceVariantId: null,
    funderUserId: funder,
    connectionId: null,
    connectionAttributionProvenance: "unrecorded",
    responseCache: null,
  };
  const grouped = groupObservationRows([
    row,
    { ...row, ordinal: 1, funderUserId: otherFunder, costUsd: 0, costProvenance: "measured", costDetails: { totalUsd: 0 } },
    { ...row, chatId: otherChat },
  ]);
  expect(grouped.map((group) => [group.parent.chatId, group.parent.turnId])).toEqual([
    [chat, turn],
    [otherChat, turn],
  ]);
  expect(grouped[0]?.facts.map((fact) => [fact.ordinal, fact.funderUserId, fact.connectionId, fact.leg.costUsd])).toEqual([
    [0, funder, null, null],
    [1, otherFunder, null, 0],
  ]);
  expect(grouped[0]?.facts[0]?.leg.responseCache).toBeUndefined();
  expect(grouped[1]?.facts).toHaveLength(1);
});
