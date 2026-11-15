// Work that runs on a room host's account takes that host's consent, so a disabled host's compaction runs no model
// call and their greeting selection lands without the bake; re-enabling the host restores both.
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { TURN_HOST_UNAVAILABLE_OP_CODE } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  readRoomCanon,
  seedCorpusActors,
} from "@orb/testkit/node/composed";

const ALTERNATE_LEAD = "Alt greeting, you rolled ";
// `1d1` always rolls 1, so the bake's output is fixed.
const ALTERNATE = `${ALTERNATE_LEAD}{{roll::1d1}}`;
const BAKED_ALTERNATE = `${ALTERNATE_LEAD}1`;
const HOST_LINES = ["The host lights the first lamp.", "The host lights the second lamp.", "The host trims the wicks.", "The host waits."];

interface HostRoom extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly host: Principal;
  readonly chatId: ChatId;
  readonly greetingId: MessageId;
  readonly primaryId: MessageVariantId;
  readonly alternateId: MessageVariantId;
  /** Chat completions the provider has answered. */
  readonly completions: () => number;
  readonly setHostEnabled: (enabled: boolean) => Promise<unknown>;
}

// The box owner is the admin and cannot be disabled, so the second account hosts. The greeting holds an unfrozen card
// alternate beside the selected variant, and the room has user lines, so the freeze window is closed and selecting
// the alternate bakes it.
async function hostRoom(): Promise<HostRoom> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A compaction summary.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const completions: Request[] = [];
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).pathname.endsWith("/chat/completions")) {
          completions.push(request);
        }
        return await physical.execute(request);
      },
    }),
  );
  const { owner: admin, secondUserId } = await seedCorpusActors(root);
  const host = await root.principalFor(secondUserId);
  const hostCaller = await root.internalCallerFor(host.userId);
  const card = await hostCaller.character.create({
    input: createCharacterSchema.parse({
      handle: "lamplighter",
      name: "Lamplighter",
      description: "Keeps the lamps.",
      greetings: [{ text: "Primary greeting." }, { text: ALTERNATE }],
    }),
  });
  const started = await hostCaller.chat.startChat({ characterIds: [card.id], opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the character card produced no opening");
  }
  const chatId = started.chat.id;
  const slot = { principal: host, chatId, messageId: greeting.id };
  // An authored body makes the card step append the alternate as a sibling instead of stepping the text in place.
  await root.services.chat.editMessage({ ...slot, content: "An authored greeting distinct from both card texts." });
  const alternate = await root.services.chat.setSeededGreeting({ ...slot, greetingIndex: 1 });
  await root.services.chat.selectVariant({ ...slot, variantId: greeting.selectedVariantId });
  for (const content of HOST_LINES) {
    await root.services.chat.commitMessage({ principal: host, chatId, content, timeZone: UTC_TIME_ZONE });
  }
  await root.settleBackground();
  const lifetime = construction.move();
  return {
    root,
    host,
    chatId,
    greetingId: greeting.id,
    primaryId: greeting.selectedVariantId,
    alternateId: alternate.selectedVariantId,
    completions: () => completions.length,
    setHostEnabled: (enabled) => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled }),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

async function greetingContent(room: HostRoom): Promise<string | undefined> {
  return (await readRoomCanon(room.root, room.host, room.chatId)).find((message) => message.id === room.greetingId)?.content;
}

test("a disabled host's compaction refuses before any model call, and compacts once re-enabled", async () => {
  await using room = await hostRoom();
  const compact = (): ReturnType<ServerTestHarness["services"]["chat"]["compact"]> =>
    room.root.services.chat.compact({ principal: room.host, chatId: room.chatId, signal: new AbortController().signal });

  await room.setHostEnabled(false);
  const beforeRefusal = room.completions();
  await expect(compact()).rejects.toMatchObject({ code: TURN_HOST_UNAVAILABLE_OP_CODE });
  expect(room.completions()).toBe(beforeRefusal);

  await room.setHostEnabled(true);
  const beforeControl = room.completions();
  expect(await compact()).toMatchObject({ updated: true });
  expect(room.completions()).toBe(beforeControl + 1);
});

test("a disabled host's greeting selection lands unbaked, and bakes once re-enabled", async () => {
  await using room = await hostRoom();
  const select = (variantId: MessageVariantId): Promise<unknown> =>
    room.root.services.chat.selectVariant({ principal: room.host, chatId: room.chatId, messageId: room.greetingId, variantId });

  await room.setHostEnabled(false);
  await select(room.alternateId);
  expect(await greetingContent(room)).toBe(ALTERNATE);

  await room.setHostEnabled(true);
  await select(room.primaryId);
  await select(room.alternateId);
  expect(await greetingContent(room)).toBe(BAKED_ALTERNATE);
});
