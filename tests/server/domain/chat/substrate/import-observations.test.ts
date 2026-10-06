import type { BulkImportChatInput, ImportedChatIdentity } from "@orb/contracts/chat";
import { generationUsageLegSchema } from "@orb/contracts/inference";
import type { ChatId, ChatTurnId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { importedObservationRows } from "../../../../../packages/server/src/domain/chat/substrate/import-observations.ts";
import { makeGenerationUsage } from "../../../../support/factories/generation-usage.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("restored observations remint operation groups and only attribute the importer's mapped source", ({ ids, clock }) => {
  const owner = castId<UserId>(ids.next("user"));
  const identity: ImportedChatIdentity = {
    chatId: castId<ChatId>(ids.next(ID_PREFIX.chat)),
    messageIds: [castId<MessageId>(ids.next(ID_PREFIX.message))],
    variantIds: [[castId<MessageVariantId>(ids.next(ID_PREFIX.messageVariant))]],
  };
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(0),
    model: "restored-model",
    provider: "google",
    wire: "google-generative-ai",
    observedAt: clock.now(),
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    terminalReason: null,
    generationId: null,
  });
  const input: BulkImportChatInput = {
    title: "Restored",
    importedFrom: "native",
    importHash: "fixture",
    anchorPersonaId: null,
    createdAt: clock.now(),
    updatedAt: clock.now(),
    parentRef: null,
    isRealConversation: true,
    messages: [],
    pendingGenerationObservations: [
      { turnIndex: 0, ordinal: 0, sourceMessageIndex: 0, sourceVariantIdx: 0, leg },
      { turnIndex: 0, ordinal: 1, sourceMessageIndex: 0, sourceVariantIdx: 0, leg: { ...leg, ...makeGenerationUsage(null) } },
      { turnIndex: 1, ordinal: 0, sourceMessageIndex: null, sourceVariantIdx: null, leg },
    ],
  };
  let minted = 0;
  const mint = (): ChatTurnId => {
    minted += 1;
    return castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn));
  };
  const rows = importedObservationRows(mint, owner, input, identity);
  expect(minted).toBe(2);
  expect(rows[0]?.turnId).toBe(rows[1]?.turnId);
  expect(rows[2]?.turnId).not.toBe(rows[0]?.turnId);
  expect(rows.map((row) => [row.funderUserId, row.connectionId, row.connectionAttributionProvenance, row.costUsd])).toEqual([
    [owner, null, "unrecorded", 0],
    [owner, null, "unrecorded", null],
    [owner, null, "unrecorded", 0],
  ]);
  expect(rows[0]?.sourceMessageId).toBe(identity.messageIds[0]);
  expect(rows[0]?.sourceVariantId).toBe(identity.variantIds[0]?.[0]);
  expect(rows[2]?.sourceMessageId).toBeNull();
  expect(() => importedObservationRows(mint, owner, input, { ...identity, variantIds: [[]] })).toThrow(/message/u);
});
