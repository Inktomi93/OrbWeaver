// @subject tests/support/node/factories/stats.ts

import { createCharacterSchema } from "@orb/contracts/character";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { seedCorpusConnections } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedStats } from "./stats.ts";

test("computed-empty reconciliation does not invent a live canon fence or activity rows", async () => {
  await using root = await createServerHarness();
  const actor = await root.actor();
  expect(await root.services.stats.overview(actor.id)).toBeNull();
  const capture = await seedStats(root, actor.id);
  expect(capture.owner).toMatchObject({ ownerId: actor.id, characters: 0, chats: 0, userTurns: 0 });
  expect(capture.canonVersion).toBeUndefined();
  expect(capture.characters).toEqual([]);
  expect(capture.daily).toEqual([]);
  expect(capture.models).toEqual([]);
  expect(await root.services.stats.overview(actor.id)).not.toBeNull();
});

test("canon reconciliation captures only the actual owner's character and activity grains", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    chatText: "The traveller waits.",
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  const other = await root.actor();
  const otherPrincipal = await root.principalFor(other.id);
  await seedCorpusConnections(root, principal);
  await seedCorpusConnections(root, otherPrincipal);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "stats-owner-subject", name: "The traveller", description: "A traveller beside the orbital loom." }),
  });
  const foreignCharacter = await root.services.character.create({
    principal: otherPrincipal,
    input: createCharacterSchema.parse({ handle: "stats-foreign-subject", name: "The stranger", description: "A stranger beside the orbital loom." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const { chat: foreignChat } = await root.services.chat.startChat({ principal: otherPrincipal, characterIds: [foreignCharacter.id], opening: "none" });
  await root.services.chat.commitMessage({ principal, chatId: chat.id, content: "The traveller waits." });
  await root.services.chat.commitMessage({ principal: otherPrincipal, chatId: foreignChat.id, content: "The stranger waits." });
  await root.services.chat.commitMessage({ principal: otherPrincipal, chatId: foreignChat.id, content: "The stranger leaves." });
  const foreign = await seedStats(root, other.id);
  const capture = await seedStats(root, root.ownerId);
  expect(capture.owner.userTurns).toBe(1);
  expect(capture.characters.map((row) => row.characterId)).toContain(character.id);
  expect(capture.characters.map((row) => row.characterId)).not.toContain(foreignCharacter.id);
  expect(capture.daily.map((row) => row.ownerId)).toEqual([root.ownerId]);
  expect(capture.daily.map((row) => row.userTurns)).toEqual([1]);
  expect(capture.canonVersion).toBeDefined();
  const repeat = await seedStats(root, root.ownerId);
  expect(repeat.owner).toEqual(capture.owner);
  expect(repeat.canonVersion).toEqual(capture.canonVersion);
  const foreignAgain = await seedStats(root, other.id);
  expect(foreignAgain.owner).toEqual(foreign.owner);
  expect(foreignAgain.owner.userTurns).toBe(2);
});
