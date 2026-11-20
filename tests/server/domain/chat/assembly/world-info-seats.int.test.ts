// @subject packages/server/src/domain/chat/assembly/context.ts
// @subject packages/server/src/domain/chat/assembly/assemble.ts
// A world-info entry sits at the top or bottom of the chat's Author's Note (its Injections list) and of the preset's
// example-messages section. The entries come in through the SillyTavern world file door, so each seat is the one an
// imported slot lands in. A turn that lacks the seat leaves the entry at its default placement and never drops it.

import { createCharacterSchema } from "@orb/contracts/character";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import type { AuthorsNotePosition, EntryPosition } from "@orb/kit/world-info";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const NOTE = "NOTE-BODY";
const EXAMPLES = "EXAMPLE-DIALOGUE";
const KEYWORD = "harbor";

type ExampleMessagesPosition = Extract<EntryPosition, `example_messages_${string}`>;
type SeatedPosition = AuthorsNotePosition | ExampleMessagesPosition;

// SillyTavern's own slot numbers, stated: a seat added to the position tuple fails tsc here until it names its slot.
const ST_SLOT: Record<SeatedPosition, number> = {
  ["authors_note_top"]: 2,
  ["authors_note_bottom"]: 3,
  ["example_messages_top"]: 5,
  ["example_messages_bottom"]: 6,
};

interface SeatEntry {
  readonly content: string;
  readonly slot: number;
  /** Absent ⇒ an always-scope entry (SillyTavern's constant); present ⇒ fires when the key is said. */
  readonly keyword?: boolean;
}

const worldFile = (entries: readonly SeatEntry[]): string =>
  JSON.stringify({
    entries: Object.fromEntries(
      entries.map((entry, uid) => [
        String(uid),
        {
          uid,
          key: [KEYWORD],
          keysecondary: [],
          comment: entry.content,
          content: entry.content,
          order: 100,
          position: entry.slot,
          disable: false,
          constant: entry.keyword !== true,
        },
      ]),
    ),
  });

const marker = (id: string, kind: "main_prompt" | "dialogue_examples" | "chat_history"): PromptSection => ({
  type: "marker",
  id: promptSectionIdSchema.parse(id),
  name: id,
  marker: kind,
  role: "system",
  enabled: true,
});
const literal = (id: string, content: string): PromptSection => ({
  type: "literal",
  id: promptSectionIdSchema.parse(id),
  name: id,
  role: "system",
  enabled: true,
  content,
});

const withSections = (sections: readonly PromptSection[]): PromptConfig => ({ ...DEFAULT_PROMPT_CONFIG, sections: [...sections] });
const BEFORE_EXAMPLES = "[BEFORE-EXAMPLES]";
const AFTER_EXAMPLES = "[AFTER-EXAMPLES]";
const SEAT_PRESET = withSections([
  marker("main", "main_prompt"),
  literal("before", BEFORE_EXAMPLES),
  marker("examples", "dialogue_examples"),
  literal("after", AFTER_EXAMPLES),
  marker("history", "chat_history"),
]);
const NO_EXAMPLES_PRESET = withSections([
  marker("main", "main_prompt"),
  literal("before", BEFORE_EXAMPLES),
  literal("after", AFTER_EXAMPLES),
  marker("history", "chat_history"),
]);
const AFTER_HISTORY_PRESET = withSections([marker("main", "main_prompt"), marker("history", "chat_history"), marker("examples", "dialogue_examples")]);

interface RoomOptions {
  readonly entries: readonly SeatEntry[];
  readonly promptConfig?: PromptConfig;
  /** The card's example messages; absent ⇒ the card has none. */
  readonly examples?: string;
  /** Chat injections, in the order they are added; each is an in_chat system row at one shared depth, ordered as listed. */
  readonly injections?: readonly string[];
}

async function room(options: RoomOptions): Promise<Awaited<ReturnType<typeof createChatRoot>>> {
  await using construction = new AsyncDisposableStack();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      characters: [
        createCharacterSchema.parse({
          handle: "aria",
          name: "Aria",
          description: "A bold knight.",
          ...(options.examples === undefined ? {} : { exampleMessages: options.examples }),
        }),
      ],
      ...(options.promptConfig === undefined ? {} : { promptConfig: options.promptConfig }),
      providerFetch: (input, init) => physical.execute(new Request(input, init)),
    }),
  );
  const imported = await h.root.services.worldInfo.importFile({ principal: h.owner, filename: "Seats.json", fileText: worldFile(options.entries) });
  expect(imported.ok).toBe(true);
  const [book] = await h.root.services.worldInfo.listBooks({ principal: h.owner });
  if (book === undefined) {
    throw new Error("the imported world did not persist");
  }
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  for (const [order, content] of (options.injections ?? []).entries()) {
    await h.caller.chat.setChatInjection({ chatId: h.chatId, position: "in_chat", role: "system", depth: 2, order, content });
  }
  construction.move();
  return h;
}

type Room = Awaited<ReturnType<typeof room>>;

const completionSchema = z.object({ messages: z.array(z.object({ content: z.union([z.string(), z.array(z.looseObject({ text: z.string().optional() }))]) })) });

/** Say something in the room and read every message of the prompt the provider received, as one text. */
async function sendAndReadWire(h: Room, content: string): Promise<string> {
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
  expect(outcome.aborted).toBe(false);
  const generation = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(generation).toHaveLength(1);
  const body = completionSchema.parse(JSON.parse(await present(generation[0]).text()));
  return body.messages
    .map((message) => (typeof message.content === "string" ? message.content : message.content.map((part) => part.text ?? "").join("")))
    .join("\n");
}

const preview = async (h: Room): Promise<{ readonly static: string; readonly dynamic: string }> =>
  (await h.root.services.chat.previewAssembly({ signal: new AbortController().signal, principal: h.owner, chatId: h.chatId })).prompt;

/** The text from the first mention of `from` through the first mention of `to`, whitespace collapsed. */
function spanOf(text: string, from: string, to: string): string {
  return text.slice(text.indexOf(from), text.indexOf(to) + to.length).replaceAll(/\s+/gu, " ");
}

const count = (text: string, part: string): number => text.split(part).length - 1;

test.for([
  { position: "authors_note_top", expected: `TOP ${NOTE}` },
  { position: "authors_note_bottom", expected: `${NOTE} BOTTOM` },
] as const satisfies readonly { position: AuthorsNotePosition; expected: string }[])(
  "an entry at $position is delivered beside the chat's Author's Note, at its register",
  async ({ position, expected }) => {
    const lore = expected.includes("TOP") ? "TOP" : "BOTTOM";
    await using h = await room({ entries: [{ content: lore, slot: ST_SLOT[position] }], injections: [NOTE] });
    const wire = await sendAndReadWire(h, "we sail on");
    expect(spanOf(wire, expected.startsWith("TOP") ? "TOP" : NOTE, expected.endsWith("BOTTOM") ? "BOTTOM" : NOTE)).toBe(expected);
    expect(count(wire, lore)).toBe(1);
    // The entry left the system prompt: the note's seat took it.
    expect((await preview(h)).static).not.toContain(lore);
  },
);

test("both Author's Note seats wrap every chat injection, in the order the prompt places them", async () => {
  await using h = await room({
    entries: [
      { content: "TOP", slot: ST_SLOT["authors_note_top"] },
      { content: "BOTTOM", slot: ST_SLOT["authors_note_bottom"] },
    ],
    injections: ["NOTE-ONE", "NOTE-TWO"],
  });
  expect(spanOf(await sendAndReadWire(h, "we sail on"), "TOP", "BOTTOM")).toBe("TOP NOTE-ONE NOTE-TWO BOTTOM");
});

test.for([
  { position: "example_messages_top", expected: `LORE\n\n${EXAMPLES}` },
  { position: "example_messages_bottom", expected: `${EXAMPLES}\n\nLORE` },
] as const satisfies readonly { position: ExampleMessagesPosition; expected: string }[])(
  "an entry at $position is joined to the example-messages section's text",
  async ({ position, expected }) => {
    await using h = await room({ entries: [{ content: "LORE", slot: ST_SLOT[position] }], promptConfig: SEAT_PRESET, examples: EXAMPLES });
    const { static: system } = await preview(h);
    expect(system).toContain(`${BEFORE_EXAMPLES}\n\n${expected}\n\n${AFTER_EXAMPLES}`);
    expect(count(system, "LORE")).toBe(1);
  },
);

test("a preset that renders the example-messages section seats the lore even for a card with no examples", async () => {
  await using h = await room({
    entries: [
      { content: "TOP", slot: ST_SLOT["example_messages_top"] },
      { content: "BOTTOM", slot: ST_SLOT["example_messages_bottom"] },
    ],
    promptConfig: SEAT_PRESET,
  });
  expect((await preview(h)).static).toContain(`${BEFORE_EXAMPLES}\n\nTOP\n\nBOTTOM\n\n${AFTER_EXAMPLES}`);
});

test("keyword-fired lore at the example-messages seats rides the per-turn half beside the section, never the cached prefix", async () => {
  await using h = await room({
    entries: [
      { content: "TOP-KW", slot: ST_SLOT["example_messages_top"], keyword: true },
      { content: "BOTTOM-KW", slot: ST_SLOT["example_messages_bottom"], keyword: true },
    ],
    promptConfig: SEAT_PRESET,
    examples: EXAMPLES,
  });
  const before = await preview(h);
  // Positive control: nothing fires until the key is said.
  expect(before.dynamic).not.toContain("TOP-KW");
  await sendAndReadWire(h, `we reach the ${KEYWORD}`);
  const after = await preview(h);
  expect(after.dynamic).toContain("TOP-KW\n\nBOTTOM-KW");
  expect(after.static).not.toContain("-KW");
  expect(after.static).toContain(`${BEFORE_EXAMPLES}\n\n${EXAMPLES}\n\n${AFTER_EXAMPLES}`);
});

test("an example-messages section after the history is one message that carries both halves of its lore", async () => {
  await using h = await room({
    entries: [
      { content: "TOP-FIXED", slot: ST_SLOT["example_messages_top"] },
      { content: "BOTTOM-KW", slot: ST_SLOT["example_messages_bottom"], keyword: true },
    ],
    promptConfig: AFTER_HISTORY_PRESET,
    examples: EXAMPLES,
  });
  expect(spanOf(await sendAndReadWire(h, `we reach the ${KEYWORD}`), "TOP-FIXED", "BOTTOM-KW")).toBe(`TOP-FIXED ${EXAMPLES} BOTTOM-KW`);
});

test("an entry that injects at a depth keeps that depth, whatever seat its metadata also names", async () => {
  await using h = await room({ entries: [{ content: "DEPTH-LORE", slot: ST_SLOT["authors_note_top"] }], injections: [NOTE] });
  const [book] = await h.root.services.worldInfo.listBooks({ principal: h.owner });
  const [entry] = await h.root.services.worldInfo.listEntries({ principal: h.owner, bookId: present(book).id });
  await h.caller.worldInfo.updateEntry({
    entryId: present(entry).id,
    input: { metadata: { scopeMode: "always", position: "authors_note_top", inject: { depth: 0, role: "system" } } },
  });
  // The note sits two back from the tail and the entry at the tail, so the user's line is between them.
  expect(spanOf(await sendAndReadWire(h, "we sail on"), NOTE, "DEPTH-LORE")).toBe(`${NOTE} we sail on DEPTH-LORE`);
});

test("an Author's Note entry in a chat with no injection stays in the system prompt, and an injection takes it back", async () => {
  const entries = [{ content: "NOTE-LORE", slot: ST_SLOT["authors_note_top"] }];
  await using bare = await room({ entries });
  expect((await preview(bare)).static).toContain("NOTE-LORE");
  expect(count(await sendAndReadWire(bare, "we sail on"), "NOTE-LORE")).toBe(1);
  await using noted = await room({ entries, injections: [NOTE] });
  expect((await preview(noted)).static).not.toContain("NOTE-LORE");
});

test("an example-messages entry under a preset with no example-messages section stays where any unseated entry goes", async () => {
  const entries = [{ content: "EXAMPLE-LORE", slot: ST_SLOT["example_messages_top"] }];
  await using bare = await room({ entries, promptConfig: NO_EXAMPLES_PRESET, examples: EXAMPLES });
  const { static: system } = await preview(bare);
  expect(system).toContain(`${BEFORE_EXAMPLES}\n\n${AFTER_EXAMPLES}\n\nEXAMPLE-LORE`);
  expect(system).not.toContain(EXAMPLES);
  await using seated = await room({ entries, promptConfig: SEAT_PRESET, examples: EXAMPLES });
  expect((await preview(seated)).static).toContain(`${BEFORE_EXAMPLES}\n\nEXAMPLE-LORE\n\n${EXAMPLES}`);
});
