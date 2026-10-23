// @subject packages/server/src/domain/chat/assembly/macros.ts
// A preset section and a guided-action template render {{random}} from the root's seeded PRNG, never kit's ambient Math.random.
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";

// 0.99 selects the LAST option of a two-way pick, so an ambient draw matches only by chance.
const SEEDED_LAST = 0.99;
const DRAWS = 24;
const PICKS = "{{random::a::b}}".repeat(DRAWS);
const EXPECTED = "b".repeat(DRAWS);

async function seededRoot(): ReturnType<typeof createChatRoot> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return await createChatRoot({
    server: { random: () => SEEDED_LAST },
    memoryEnabled: false,
    promptConfig: {
      ...DEFAULT_PROMPT_CONFIG,
      sections: [{ type: "literal", id: "picks", name: "picks", role: "system", enabled: true, content: PICKS }, ...DEFAULT_PROMPT_CONFIG.sections],
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: `${PICKS}{{input}}`, role: "user" } },
    },
    providerFetch: (input, init) => physical.execute(new Request(input, init)),
  });
}

test("a preset section renders its {{random}} picks from the seeded PRNG on every preview", async () => {
  await using h = await seededRoot();
  const first = await h.root.services.chat.previewSection({ principal: h.owner, chatId: h.chatId, sectionId: "picks" });
  const second = await h.root.services.chat.previewSection({ principal: h.owner, chatId: h.chatId, sectionId: "picks" });
  expect(first.rendered).toBe(EXPECTED);
  expect(second.rendered).toBe(EXPECTED);
});

test("a guided-action preview renders its {{random}} picks from the seeded PRNG", async () => {
  await using h = await seededRoot();
  const preset = await h.caller.preset.list();
  const presetId = preset.find((row) => row.name === "Composed turn preset")?.id;
  if (presetId === undefined) {
    throw new Error("the composed room created no preset");
  }
  const preview = await h.caller.chat.previewActionTemplates({ chatId: h.chatId, presetId, timeZone: "UTC" });
  const response = preview.templates.find((template) => template.id === "response");
  expect(response?.resolved).toBe(`${EXPECTED}{{input}}`);
});
