// A preset stored with two sections under one key, as a SillyTavern import whose prompt order listed a prompt twice
// once wrote, still reads, intact, as its first section, and the room's turn still assembles from it; the next save
// writes the config back with the repeat gone. The stored bytes are this suite's subject, so it lives in the
// persistence tier.
// @subject packages/contracts/src/preset/index.ts
// @subject packages/server/src/domain/preset/substrate/views.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import { presets } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { z } from "zod";

const KEY = promptSectionIdSchema.parse("scene-note");
const FIRST = "FIRST-SCENE-NOTE";
const SECOND = "SECOND-SCENE-NOTE";
const first = { type: "literal", id: KEY, name: "Scene note", role: "system", enabled: true, content: FIRST } as const;
// The stored column as written, read raw: the read schema keeps only the first of a repeated key, so it cannot count them.
const STORED_SECTIONS = z.object({ sections: z.array(z.object({ id: z.string() })) });
const config = { ...DEFAULT_PROMPT_CONFIG, sections: [first, ...DEFAULT_PROMPT_CONFIG.sections] } satisfies PromptConfig;

test("a stored preset holding a repeated section key reads as its first section, assembles its turn, and heals on save", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using room = await createChatRoot({
    memoryEnabled: false,
    characters: [createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A guide." })],
    promptConfig: config,
    providerFetch: (input, init) => physical.execute(new Request(input, init)),
  });
  const preset = (await room.caller.preset.list()).find((row) => row.name === "Composed turn preset");
  if (preset === undefined) {
    throw new Error("the composed room created no preset");
  }
  // The stored state: the write door refuses it now, so it is planted in the column.
  const repeated = { ...config, sections: [...config.sections, { ...first, name: "Scene note again", content: SECOND }] };
  await room.root.db.update(presets).set({ config: repeated }).where(eq(presets.id, preset.id));
  const storedSections = async (): Promise<readonly { readonly id: string }[]> =>
    STORED_SECTIONS.parse((await room.root.db.select({ config: presets.config }).from(presets).where(eq(presets.id, preset.id)).get())?.config).sections;
  expect((await storedSections()).filter(({ id }) => id === KEY)).toHaveLength(2);

  const read = await room.caller.preset.get({ id: preset.id });
  expect(read.configUnreadable).toBeNull();
  expect(read.config.sections.filter(({ id }) => id === KEY).map(({ name }) => name)).toEqual(["Scene note"]);

  const assembled = JSON.stringify(
    (await room.root.services.chat.previewAssembly({ signal: new AbortController().signal, principal: room.owner, chatId: room.chatId })).prompt,
  );
  expect(assembled).toContain(FIRST);
  expect(assembled).not.toContain(SECOND);

  await room.caller.preset.update({ id: preset.id, config: read.config });
  expect((await storedSections()).filter(({ id }) => id === KEY)).toHaveLength(1);
});
