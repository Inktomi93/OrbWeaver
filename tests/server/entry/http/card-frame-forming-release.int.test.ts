// @subject packages/server/src/entry/http/frame-handle-store.ts
// A forming card frame (one panel of a reply still streaming) holds store room only while its stream lasts: when a turn
// ends in its room, the store drops it, and an ordinary frame in that room and a forming frame in another room stay.
// Until then it counts toward the store's ceilings like any other document. Everything runs over the real HTTP entry.
import { createCharacterSchema } from "@orb/contracts/character";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { finiteReplies, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, ownerSubject, signIn } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { CARD_FRAME_CEILINGS } from "#server/entry/http/frame-handle-store.ts";

const OK = 200;
const MISS = 404;
const PANEL = '<div style="color:red">The ford ledger.</div>';
const TINY = "<p>.</p>";

interface Mint {
  readonly chatId: ChatId;
  readonly characterId: CharacterId | null;
  readonly html: string;
  readonly forming?: true;
}

async function mint(root: ServerTestHarness, headers: SignedIn["headers"], body: Mint): Promise<string> {
  const response = await root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(OK);
  return cardFrameMintResponseSchema.parse(await response.json()).url;
}

async function served(root: ServerTestHarness, headers: SignedIn["headers"], url: string): Promise<number> {
  const response = await root.http.request(url, { headers });
  await response.arrayBuffer();
  return response.status;
}

test("a turn ending in a room drops that room's forming frames and keeps its ordinary frame and another room's forming frame", async () => {
  using plan = finiteReplies("forming release", ["The ford is quiet."]);
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: plan.take(), toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  await using h = await createChatRoot({
    providerFetch: provider.execute,
    memoryEnabled: false,
    server: { env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" },
    characters: [createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "Aria is a warden of the ford." })],
  });
  const characterId = present(h.characters[0]).id;
  const elsewhere = h.root.idSource.typeId(ID_PREFIX.chat);
  const forming = await mint(h.root, {}, { chatId: h.chatId, characterId, html: PANEL, forming: true });
  const secondForming = await mint(h.root, {}, { chatId: h.chatId, characterId: null, html: TINY, forming: true });
  const ordinary = await mint(h.root, {}, { chatId: h.chatId, characterId, html: PANEL });
  const otherRoom = await mint(h.root, {}, { chatId: elsewhere, characterId: null, html: PANEL, forming: true });
  // Positive control: every handle serves before the turn, so a miss after it is the release.
  expect([await served(h.root, {}, forming), await served(h.root, {}, secondForming)]).toEqual([OK, OK]);

  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." })).aborted).toBe(false);

  await expect.poll(async () => [await served(h.root, {}, forming), await served(h.root, {}, secondForming)]).toEqual([MISS, MISS]);
  expect([await served(h.root, {}, ordinary), await served(h.root, {}, otherRoom)]).toEqual([OK, OK]);
});

test("a forming frame counts toward its account's ceiling: a flood to the ceiling evicts it first", { tags: ["slow"] }, async () => {
  await using root = await createAuthModeRoot("local");
  const owner = await signIn(root, await ownerSubject(root));
  const chatId = root.idSource.typeId(ID_PREFIX.chat);
  const forming = await mint(root, owner.headers, { chatId, characterId: null, html: PANEL, forming: true });
  const urls: string[] = [];
  // The forming frame and these fill the count ceiling exactly, so nothing has gone yet.
  for (let index = 0; index < CARD_FRAME_CEILINGS.userEntries - 1; index += 1) {
    urls.push(await mint(root, owner.headers, { chatId, characterId: null, html: TINY }));
  }
  expect(await served(root, owner.headers, forming)).toBe(OK);
  urls.push(await mint(root, owner.headers, { chatId, characterId: null, html: TINY }));
  expect(await served(root, owner.headers, forming)).toBe(MISS);
  expect([await served(root, owner.headers, present(urls[0])), await served(root, owner.headers, present(urls.at(-1)))]).toEqual([OK, OK]);
});
