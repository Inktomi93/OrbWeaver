// @subject packages/server/src/domain/chat/assembly/macros.ts
// Previews render {{random}} from a stable PRNG; a real turn renders it from the root's seeded PRNG. Neither reaches kit's ambient Math.random.
import { createCharacterSchema } from "@orb/contracts/character";
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

const SEEDED_LAST = 0.99;
const DRAWS = 24;
const PICKS = "{{random::a::b}}".repeat(DRAWS);
// A stable preview draws 0, which selects the FIRST option of a two-way pick; a seeded 0.99 selects the last.
const STABLE_PREVIEW = "a".repeat(DRAWS);
const SEEDED_TURN = "b".repeat(DRAWS);

async function root(random: () => number): ReturnType<typeof createChatRoot> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return await createChatRoot({
    server: { random },
    memoryEnabled: false,
    characters: [createCharacterSchema.parse({ handle: "aria", name: "Aria", description: PICKS })],
    promptConfig: {
      ...DEFAULT_PROMPT_CONFIG,
      sections: [{ type: "literal", id: "picks", name: "picks", role: "system", enabled: true, content: PICKS }, ...DEFAULT_PROMPT_CONFIG.sections],
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: `${PICKS}{{input}}`, role: "user" } },
    },
    providerFetch: (input, init) => physical.execute(new Request(input, init)),
  });
}

/** A live PRNG whose draws differ call to call, so any preview that rides it renders differently per poll. */
function drifting(): () => number {
  let n = 0;
  return () => (n++ * 0.37) % 1;
}

test("a preset section preview renders the same on every poll even when the live PRNG drifts", async () => {
  await using h = await root(drifting());
  const first = await h.root.services.chat.previewSection({ principal: h.owner, chatId: h.chatId, sectionId: "picks" });
  const second = await h.root.services.chat.previewSection({ principal: h.owner, chatId: h.chatId, sectionId: "picks" });
  expect(first.rendered).toBe(STABLE_PREVIEW);
  expect(second.rendered).toBe(STABLE_PREVIEW);
});

test("a guided-action preview renders the same on every poll even when the live PRNG drifts", async () => {
  await using h = await root(drifting());
  const presetId = (await h.caller.preset.list()).find((row) => row.name === "Composed turn preset")?.id;
  if (presetId === undefined) {
    throw new Error("the composed room created no preset");
  }
  const poll = async (): Promise<string | undefined> =>
    (await h.caller.chat.previewActionTemplates({ chatId: h.chatId, presetId, timeZone: "UTC" })).templates.find((template) => template.id === "response")
      ?.resolved;
  expect(await poll()).toBe(`${STABLE_PREVIEW}{{input}}`);
  expect(await poll()).toBe(`${STABLE_PREVIEW}{{input}}`);
});

test("a member card display renders the same on every read even when the live PRNG drifts", async () => {
  await using h = await root(drifting());
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the composed room seated no character");
  }
  const read = async (): Promise<string | null> =>
    (await h.caller.chat.getMemberCard({ chatId: h.chatId, characterId: character.id, timeZone: "UTC" })).description;
  expect(await read()).toBe(STABLE_PREVIEW);
  expect(await read()).toBe(STABLE_PREVIEW);
});

test("a real turn renders a preset section's {{random}} picks from the seeded PRNG", async () => {
  await using h = await root(() => SEEDED_LAST);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
  expect(outcome.aborted).toBe(false);
  const generation = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(generation).toHaveLength(1);
  expect(await generation[0]?.text()).toContain(SEEDED_TURN);
});
