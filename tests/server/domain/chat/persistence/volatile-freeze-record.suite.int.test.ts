// Card openings and canon writers keep the host-only volatile provenance stored on each variant
// (content, rawContent and macroFreezes), which no member view projects.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { createVolatileOnlyRegistry, processMacros } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

async function room(greeting?: string): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly chatId: ChatId;
    readonly greeting: TurnOutcome["messages"][number] | null;
  }
> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await textRoom(["ok", " more"], {
      characters: [
        createCharacterSchema.parse({
          handle: "aria",
          name: "Aria",
          description: "A bold knight.",
          greetings: greeting === undefined ? [] : [{ text: greeting }],
        }),
      ],
    }),
  );
  const started = greeting === undefined ? null : await h.caller.chat.startChat({ characterIds: h.characters.map(({ id }) => id), opening: "first-message" });
  const lifetime = construction.move();
  return { h, chatId: started?.chat.id ?? h.chatId, greeting: started?.opening?.messages[0] ?? null, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function greetingOf(f: Awaited<ReturnType<typeof room>>): NonNullable<Awaited<ReturnType<typeof room>>["greeting"]> {
  if (f.greeting === null) {
    throw new Error("the actual card opening created no greeting");
  }
  return f.greeting;
}

function userOf(outcome: TurnOutcome): TurnOutcome["messages"][number] {
  const user = outcome.messages.find(({ role }) => role === "user");
  if (user === undefined) {
    throw new Error("the actual send created no user slot");
  }
  return user;
}

async function provenance(db: Db, variantId: MessageVariantId): Promise<Pick<typeof messageVariants.$inferSelect, "content" | "rawContent" | "macroFreezes">> {
  const row = await db
    .select({ content: messageVariants.content, rawContent: messageVariants.rawContent, macroFreezes: messageVariants.macroFreezes })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId))
    .get();
  if (row === undefined) {
    throw new Error("the actual selected variant has no provenance row");
  }
  return row;
}

test("a send whose draft froze a volatile macro stores the PRE-freeze draft + the ordered freeze record", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "I roll {{roll::1d1}} then pick {{pick::north}}" }));
  expect(await provenance(f.h.root.db, user.selectedVariantId)).toEqual({
    content: "I roll 1 then pick north",
    rawContent: "I roll {{roll::1d1}} then pick {{pick::north}}",
    macroFreezes: [
      { name: "roll", args: "1d1", value: "1" },
      { name: "pick", args: "north", value: "north" },
    ],
  });
});

test("a send with NO volatile macro writes NULL raw + NULL record — the byte-identical common case costs nothing", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "plain words, no macros here" }));
  expect(await provenance(f.h.root.db, user.selectedVariantId)).toEqual({ content: "plain words, no macros here", rawContent: null, macroFreezes: null });
});

test("an IDENTITY macro is not a freeze — it stays raw in canon and contributes no record", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "hello {{char}}" }));
  expect(await provenance(f.h.root.db, user.selectedVariantId)).toEqual({ content: "hello {{char}}", rawContent: null, macroFreezes: null });
});

test("the rpg data macros are volatile for CACHE purposes but never freeze — no bake, no record", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "scene: {{rpgSceneState}}" }));
  const stored = await provenance(f.h.root.db, user.selectedVariantId);
  expect(stored.content).toBe("scene: {{rpgSceneState}}");
  expect(stored.macroFreezes).toBeNull();
});

test("the greeting first-turn freeze records its pre-freeze text + the occurrence it baked", async () => {
  await using f = await room("You rolled {{roll::1d1}} and I greet {{user}}");
  const greeting = greetingOf(f);
  await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "hello" });
  expect(await provenance(f.h.root.db, greeting.selectedVariantId)).toEqual({
    content: "You rolled 1 and I greet {{user}}",
    rawContent: "You rolled {{roll::1d1}} and I greet {{user}}",
    macroFreezes: [{ name: "roll", args: "1d1", value: "1" }],
  });
});

test("a greeting with no volatiles is not rewritten and gains no provenance", async () => {
  await using f = await room("I greet {{user}}");
  const greeting = greetingOf(f);
  await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "hello" });
  expect(await provenance(f.h.root.db, greeting.selectedVariantId)).toEqual({ content: "I greet {{user}}", rawContent: null, macroFreezes: null });
});

test("EDITING the body back onto its own raw clears the provenance — never a non-null raw equal to content", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "I roll {{roll::1d1}}" }));
  expect((await provenance(f.h.root.db, user.selectedVariantId)).rawContent).toBe("I roll {{roll::1d1}}");
  await f.h.root.services.chat.editMessage({ principal: f.h.owner, chatId: f.chatId, messageId: user.id, content: "I roll {{roll::1d1}}" });
  expect(await provenance(f.h.root.db, user.selectedVariantId)).toEqual({ content: "I roll {{roll::1d1}}", rawContent: null, macroFreezes: null });
});

test("an edit to UNRELATED text also drops the record — a bake that is no longer in the body is not provenance", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "I roll {{roll::1d1}}" }));
  expect((await provenance(f.h.root.db, user.selectedVariantId)).rawContent).toBe("I roll {{roll::1d1}}");
  await f.h.root.services.chat.editMessage({ principal: f.h.owner, chatId: f.chatId, messageId: user.id, content: "actually I hold still" });
  expect(await provenance(f.h.root.db, user.selectedVariantId)).toEqual({ content: "actually I hold still", rawContent: null, macroFreezes: null });
});

test("the RESTORE path (continue undo/revert) clears it too — the snapshot it restores is not what the raw produced", async () => {
  await using f = await room("You rolled {{roll::1d1}}");
  const greeting = greetingOf(f);
  await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "hello" });
  expect((await provenance(f.h.root.db, greeting.selectedVariantId)).rawContent).toBe("You rolled {{roll::1d1}}");
  await f.h.root.services.chat.continueTurn({ principal: f.h.owner, chatId: f.chatId, messageId: greeting.id });
  await f.h.root.services.chat.undoContinue({ principal: f.h.owner, chatId: f.chatId, messageId: greeting.id });
  expect(await provenance(f.h.root.db, greeting.selectedVariantId)).toEqual({ content: "You rolled 1", rawContent: null, macroFreezes: null });
});

test("replaying the stored record over the stored raw reproduces the frozen content BYTE-EXACTLY", async () => {
  await using f = await room();
  const user = userOf(await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "the die says {{random::1::1000000}}" }));
  const stored = await provenance(f.h.root.db, user.selectedVariantId);
  expect(stored.rawContent).toBe("the die says {{random::1::1000000}}");
  const replayed = processMacros(
    stored.rawContent ?? "",
    {
      char: "Aria",
      user: DEFAULT_PERSONA_NAME,
      persona: "",
      scenario: "",
      env: {},
      frozenMacros: stored.macroFreezes ?? undefined,
    },
    createVolatileOnlyRegistry(),
  );
  expect(replayed).toBe(stored.content);
});
