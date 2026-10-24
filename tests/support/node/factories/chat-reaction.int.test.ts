// @subject tests/support/node/factories/rows/chat.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { messageReactions } from "@orb/db";
import { eq } from "drizzle-orm";
import { seedCorpusConnections } from "../corpus-actors.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedMessageReaction } from "./rows/chat.ts";

test("whole-message and segment reactions retain separate canonical rows and exact removal targets", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    chatText: "The traveller waits.",
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "reaction-subject", name: "The traveller", description: "A traveller beside the orbital loom." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const reactor = chat.participants.find((seat) => seat.userId === principal.userId);
  if (reactor === undefined) {
    throw new Error("production startChat returned no host participant");
  }
  const outcome = await root.services.chat.commitMessage({ principal, chatId: chat.id, content: "The traveller waits beside the loom." });
  const message = outcome.messages.at(0);
  if (message === undefined) {
    throw new Error("production commitMessage returned no committed message");
  }
  const params = { principal, chatId: chat.id, variantId: message.selectedVariantId, emoji: "👍" } as const;
  const whole = await seedMessageReaction(root, params, reactor.id);
  const segment = await seedMessageReaction(root, { ...params, segmentIndex: 0, segmentSpeaker: null }, reactor.id);
  expect(whole.segmentIndex).toBeNull();
  expect(whole.segmentSnippet).toBeNull();
  expect(segment.segmentIndex).toBe(0);
  expect(segment.segmentSpeaker).toBeNull();
  expect(segment.segmentSnippet).toBe(message.content);
  expect(segment.id).not.toBe(whole.id);
  expect(await root.services.chat.toggleReaction(params)).toBe(false);
  expect(await root.db.select().from(messageReactions).where(eq(messageReactions.id, whole.id)).get()).toBeUndefined();
  expect(await root.db.select().from(messageReactions).where(eq(messageReactions.id, segment.id)).get()).toEqual(segment);
  expect(await root.services.chat.listReactions({ principal, chatId: chat.id })).toEqual({
    reactionsEnabled: true,
    groups: [
      {
        variantId: message.selectedVariantId,
        emoji: "👍",
        emojiImageAssetId: null,
        segmentIndex: segment.segmentIndex,
        segmentSpeaker: segment.segmentSpeaker,
        segmentSnippet: segment.segmentSnippet,
        reactorParticipantIds: [reactor.id],
      },
    ],
  });
});
