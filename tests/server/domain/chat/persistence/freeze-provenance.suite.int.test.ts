// Send and closed-window selection freeze real variants; the stored body and its freeze provenance
// (content, rawContent, macroFreezes) survive replay unchanged.
// @subject packages/server/src/domain/chat/persistence/canon-write.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { messageVariants } from "@orb/db";
import type { MessageVariantId } from "@orb/kit/ids";
import { CHAT_OP_CODES } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const RAW_A = "The first keeper rolls {{roll::1d1}}.";
const RAW_B = "The second keeper rolls {{roll::1d1}}.";
const ALT = "The authored alternate rolls {{roll::1d1}}.";
const EDITED = "A third body unrelated to either frozen or raw text.";
const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };

async function room(root: ServerTestHarness): Promise<{
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly chatId: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"]["id"];
  readonly greeting: NonNullable<Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["opening"]>["messages"][number];
}> {
  const { owner: principal } = await seedCorpusActors(root);
  const card = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({
      handle: "freeze-keeper",
      name: "Freeze keeper",
      description: "Keeps provenance.",
      greetings: [{ text: RAW_A }, { text: RAW_B }],
    }),
  });
  const started = await root.services.chat.startChat({ principal, characterIds: [card.id], opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the production room has no seeded greeting");
  }
  return { principal, chatId: started.chat.id, greeting };
}

async function body(
  root: ServerTestHarness,
  variantId: MessageVariantId,
): Promise<Pick<typeof messageVariants.$inferSelect, "content" | "rawContent" | "macroFreezes">> {
  const row = await root.db
    .select({ content: messageVariants.content, rawContent: messageVariants.rawContent, macroFreezes: messageVariants.macroFreezes })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId))
    .get();
  if (row === undefined) {
    throw new Error("the actual variant has no stored body");
  }
  return row;
}

test("composed send and closed-window selection freeze real variants and replay them without changing provenance", async () => {
  await using root = await createServerHarness();
  const { principal, chatId, greeting } = await room(root);
  await root.services.chat.editMessage({ principal, chatId, messageId: greeting.id, content: ALT });
  const second = await root.services.chat.setSeededGreeting({ principal, chatId, messageId: greeting.id, greetingIndex: 1 });
  const sent = await root.services.chat.commitMessage({ principal, chatId, content: "User rolls {{roll::1d1}}." });
  const user = sent.messages.find((message) => message.role === "user");
  if (user === undefined) {
    throw new Error("the actual user commit produced no canon row");
  }
  expect(await body(root, user.selectedVariantId)).toEqual({
    content: "User rolls 1.",
    rawContent: "User rolls {{roll::1d1}}.",
    macroFreezes: [{ name: "roll", args: "1d1", value: "1" }],
  });
  const beforeB = await body(root, second.selectedVariantId);
  expect(beforeB).toEqual({ content: "The second keeper rolls 1.", rawContent: RAW_B, macroFreezes: [{ name: "roll", args: "1d1", value: "1" }] });
  expect(await body(root, greeting.selectedVariantId)).toEqual({ content: ALT, rawContent: null, macroFreezes: null });
  const selected = await root.services.chat.selectVariant({ principal, chatId, messageId: greeting.id, variantId: greeting.selectedVariantId });
  const beforeA = await body(root, selected.selectedVariantId);
  expect(beforeA).toEqual({ content: "The authored alternate rolls 1.", rawContent: ALT, macroFreezes: [{ name: "roll", args: "1d1", value: "1" }] });
  await root.services.chat.selectVariant({ principal, chatId, messageId: greeting.id, variantId: second.selectedVariantId });
  await root.services.chat.selectVariant({ principal, chatId, messageId: greeting.id, variantId: selected.selectedVariantId });
  expect(await body(root, selected.selectedVariantId)).toEqual(beforeA);
  expect(await body(root, second.selectedVariantId)).toEqual(beforeB);
  await root.services.chat.editMessage({ principal, chatId, messageId: greeting.id, content: EDITED });
  expect(await body(root, selected.selectedVariantId)).toEqual({ content: EDITED, rawContent: null, macroFreezes: null });
});

test("composed host copies retain provenance while member forks strip both host-plane fields", async () => {
  await using root = await createServerHarness();
  const { principal, chatId, greeting } = await room(root);
  await root.services.chat.commitMessage({ principal, chatId, content: "Close the greeting window." });
  const original = await body(root, greeting.selectedVariantId);
  expect(original.rawContent).toBe(RAW_A);
  const hostCopy = await root.services.chat.forkChat({ principal, chatId });
  const hostRows = await root.services.chat.listMessages({ principal, chatId: hostCopy.chat.id });
  const copied = hostRows.messages.find((message) => message.role === "assistant");
  if (copied === undefined) {
    throw new Error("the host fork produced no copied greeting");
  }
  expect(await body(root, copied.selectedVariantId)).toEqual(original);
  const member = await root.principalFor((await root.actor()).id);
  const invite = await root.services.chat.createInvite({ principal, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await expect(root.services.chat.forkChat({ principal: member, chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notHost });
  await root.services.chat.selfLeave({ principal, chatId });
  const fork = await root.services.chat.forkChat({ principal: member, chatId });
  const views = await root.services.chat.listMessages({ principal: member, chatId: fork.chat.id });
  const variant = views.messages.find((message) => message.role === "assistant");
  if (variant === undefined) {
    throw new Error("the member fork produced no visible copied greeting");
  }
  expect(await body(root, variant.selectedVariantId)).toEqual({ content: original.content, rawContent: null, macroFreezes: null });
  expect(await body(root, greeting.selectedVariantId)).toEqual(original);
});

test("composed continuation and undo/redo never retain the old frozen body's provenance", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: " The continuation is authored by the provider.",
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const { principal, chatId, greeting } = await room(root);
  await root.services.chat.commitMessage({ principal, chatId, content: "Close the greeting window." });
  // Selecting the frozen greeting makes it the continuation target without a hand-seeded snapshot.
  await root.services.chat.selectVariant({ principal, chatId, messageId: greeting.id, variantId: greeting.selectedVariantId });
  const before = await body(root, greeting.selectedVariantId);
  expect(before.rawContent).toBe(RAW_A);
  const continued = await root.services.chat.continueTurn({ principal, chatId, messageId: greeting.id, intent: INTENT });
  expect(continued.aborted).toBe(false);
  const after = await body(root, greeting.selectedVariantId);
  expect(after.content).not.toBe(before.content);
  expect(after.rawContent).toBeNull();
  expect(after.macroFreezes).toBeNull();
  await root.services.chat.undoContinue({ principal, chatId, messageId: greeting.id });
  expect(await body(root, greeting.selectedVariantId)).toEqual({ content: before.content, rawContent: null, macroFreezes: null });
  await root.services.chat.revertContinue({ principal, chatId, messageId: greeting.id });
  expect(await body(root, greeting.selectedVariantId)).toEqual(after);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(1);
});
