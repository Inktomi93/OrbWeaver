// The Utility model's free-form reply reaches the picture prompt as a clean comma list through the real extraction door.
// @subject packages/server/src/domain/imagery/substrate/process-reply.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
} from "@orb/testkit/node/composed";

const PROMPT_ROWS = [
  ["wrapping quotes come off", '"a knight, in armor"', "a knight, in armor"],
  ["line breaks become a list", "red cloak\n\nsilver sword\r\nold keep", "red cloak, silver sword, old keep"],
  ["comma and space runs collapse and leave the edges", "  ,, a ,  b,,, c ,", "a, b, c"],
  ["a bare space run stays one space", "two   words", "two words"],
  ["marks and attention syntax go", "Café (déjà:1.2)", "Cafe deja1.2"],
  ["a long list cuts at its last whole term", "word, ".repeat(400), `${"word, ".repeat(332)}word`],
  ["a long term with no comma loses its dangling blank", `${"x".repeat(1999)} ${"y".repeat(10)}`, "x".repeat(1999)],
] as const;

test("each reply shape reaches the prompt normalized, and a reply with no keywords refuses", async () => {
  let reply = "";
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: () => reply,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const { owner } = await seedCorpusActors(root);
  const subject = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "prompt-subject", name: "Subject", description: "A scene subject." }),
  });
  const { chat } = await root.services.chat.startChat({ principal: owner, characterIds: [subject.id], opening: "none" });
  await root.services.chat.commitMessage({ principal: owner, chatId: chat.id, content: "A scene to read.", timeZone: UTC_TIME_ZONE });
  const extract = (): ReturnType<typeof root.services.imagery.extractPrompt> =>
    root.services.imagery.extractPrompt({ caller: owner, chatId: chat.id, mode: "character", subjectCharacterId: subject.id, timeZone: UTC_TIME_ZONE });

  for (const [name, raw, prompt] of PROMPT_ROWS) {
    reply = raw;
    expect((await extract()).prompt, name).toBe(prompt);
  }
  reply = " ,, , ";
  await expect(extract()).rejects.toMatchObject({ name: "PromptExtractionFailedError" });
});
