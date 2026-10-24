// memory.enabled gates the build: mode off stores no chat_digests rows for a completed group turn, mixC stores
// them under the room's synthetic character.
// @subject packages/server/src/domain/chat/memory/generate/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { characters, chatDigests } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";

async function group(memoryEnabled: boolean): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly first: ChatRoot["characters"][number];
    readonly summaries: readonly string[];
  }
> {
  await using construction = new AsyncDisposableStack();
  const summaries: string[] = [];
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) => {
      if (body.includes("Transcript block:")) {
        summaries.push(body);
        return "Group turn\nThe witnesses remember their conversation.\nKeywords: witnesses";
      }
      return "Hi there";
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      providerFetch: provider.execute,
      memoryEnabled,
      memoryDefaults: { mode: "mixC", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
      group: { output: "per-speaker", cardScope: "scoped", policy: "list" },
      characters: [
        createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
        createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
      ],
      transcript: [1, 2, 3].map((turn) => ({
        role: "assistant" as const,
        speakerHandle: turn % 2 === 0 ? "bryn" : "aria",
        content: `group turn ${turn}`,
      })),
    }),
  );
  const [first, second] = h.characters;
  if (first === undefined || second === undefined) {
    throw new Error("the real group root did not create both witnesses");
  }
  const lifetime = construction.move();
  return { h, first, summaries, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("memory.enabled=false (mode:off) → a completed group turn does ZERO build work (no summarizer, no digest rows)", async () => {
  await using fixture = await group(false);
  const { h } = fixture;
  const outcome = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: fixture.first.id });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();

  expect(fixture.summaries).toHaveLength(0);
  expect(await h.root.db.select().from(chatDigests)).toHaveLength(0);
});

test("memory enabled (mode:mixC) → the SAME completed group turn builds digests (summarizer runs, rows land)", async () => {
  await using fixture = await group(true);
  const { h } = fixture;
  const outcome = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: fixture.first.id });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();

  const rows = await h.root.db.select().from(chatDigests);
  expect(rows.length).toBeGreaterThan(0);
  expect(fixture.summaries.length).toBeGreaterThan(0);
  const synthetic = await h.root.db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, h.owner.userId), eq(characters.synthetic, true)))
    .get();
  if (synthetic === undefined) {
    throw new Error("the production group build did not mint its shared bucket");
  }
  expect(rows.some((row) => row.scopedCharacterId === synthetic.id)).toBe(true);
});
