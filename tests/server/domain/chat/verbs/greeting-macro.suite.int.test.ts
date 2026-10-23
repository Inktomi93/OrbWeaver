// @subject packages/server/src/domain/chat/verbs/turn.ts
// Opening rows come from real cards; their identity macro remains viewer-bound after volatile freezing.
import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import { messages, messageVariants } from "@orb/db";
import { jsonValueSchema } from "@orb/kit/json";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

async function room(text: string): Promise<
  AsyncDisposable & {
    readonly content: () => Promise<string | undefined>;
    readonly send: (body: string) => Promise<TurnOutcome>;
    readonly bodies: readonly string[];
  }
> {
  await using construction = new AsyncDisposableStack();
  const bodies: string[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A real greeting reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = construction.use(
    await createServerHarness({
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
          bodies.push(await request.clone().text());
        }
        return await physical.execute(request);
      },
    }),
  );
  const { owner } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const preset = await caller.preset.create({ name: "Greeting identity preset", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const anchor = await caller.persona.create({ input: createPersonaSchema.parse({ name: "Nyx", description: "The pinned card point of view." }) });
  const active = await caller.persona.create({ input: createPersonaSchema.parse({ name: "Vera", description: "The host's current speaking persona." }) });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "aria-greeting", name: "Aria", description: "A bold knight.", greetings: [{ text }] }),
  });
  const started = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], anchorPersonaId: anchor.id, opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the real character card produced no opening greeting");
  }
  const chatId = started.chat.id;
  await caller.persona.setActivePersona({ chatId, personaId: active.id });
  const content = async (): Promise<string | undefined> =>
    (
      await root.db
        .select({ content: messageVariants.content })
        .from(messages)
        .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
        .where(eq(messages.id, greeting.id))
        .get()
    )?.content;
  const send = async (body: string): Promise<TurnOutcome> => await root.services.chat.send({ principal: owner, chatId, content: body });
  const lifetime = construction.move();
  return { content, send, bodies, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("a greeting freezes its {{roll}} at the first user turn while {{user}} stays RAW in canon", async () => {
  await using fixture = await room("You rolled {{roll::1d1}} and I greet {{user}}");
  const outcome = await fixture.send("hello");
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter(({ role }) => role === "assistant")).toHaveLength(1);
  expect(await fixture.content()).toBe("You rolled 1 and I greet {{user}}");
});

test("the greeting freeze is idempotent — a SECOND send leaves the (already-frozen) greeting untouched", async () => {
  await using fixture = await room("rolled {{roll::1d1}}");
  const first = await fixture.send("first");
  expect(first.aborted).toBe(false);
  expect(first.messages.filter(({ role }) => role === "assistant")).toHaveLength(1);
  expect(await fixture.content()).toBe("rolled 1");
  const second = await fixture.send("second");
  expect(second.aborted).toBe(false);
  expect(second.messages.filter(({ role }) => role === "assistant")).toHaveLength(1);
  expect(await fixture.content()).toBe("rolled 1");
});

test("the greeting's {{user}} reaches the MODEL as the ANCHOR (Nyx), never the active persona (Vera)", async () => {
  await using fixture = await room("Aria greets {{user}}");
  const outcome = await fixture.send("hello");
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter(({ role }) => role === "assistant")).toHaveLength(1);
  expect(fixture.bodies).toHaveLength(1);
  const history = fixture.bodies
    .flatMap((raw) => {
      const body = jsonValueSchema.parse(JSON.parse(raw));
      if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
        throw new Error("the physical greeting request has no message list");
      }
      return body["messages"].flatMap((message) => {
        if (message === null || typeof message !== "object" || Array.isArray(message) || message["role"] === "system") {
          return [];
        }
        if (typeof message["content"] !== "string") {
          throw new Error("the physical text-only greeting history has non-text content");
        }
        return [message["content"]];
      });
    })
    .join("\n");
  expect(history).toContain("Aria greets Nyx");
  expect(history).not.toContain("Vera");
  expect(history).not.toContain("{{user}}");
});
