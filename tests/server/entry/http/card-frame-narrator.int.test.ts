// @subject packages/server/src/entry/http/card-frame.ts
// A narrator row's card frame mints under the room's narrator policy through the real HTTP entry: the selector is the
// row's own author, the host's synthetic group character, which holds no seat. A serve re-reads that policy, so a host
// lowering any present character narrows a handle minted before the change, and a fresh mint takes the floor.
import { createCharacterSchema } from "@orb/contracts/character";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema, DEFAULT_GROUP_CONFIG, renderPolicyOverrideForStep } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { buildCardFrameCsp, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";
import type { CharacterId } from "@orb/kit/ids";
import { finiteReplies, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";
import type { z } from "zod";

type CardFrameMintResponse = z.infer<typeof cardFrameMintResponseSchema>;

const HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
const POLICY = "content-security-policy";
const CARD_HTML = '<div style="color:red">The ford ledger.</div>';
const CARD = `:::card title="Ledger"\n${CARD_HTML}\n:::`;

async function mint(h: ChatRoot, characterId: CharacterId): Promise<CardFrameMintResponse> {
  const response = await h.root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ chatId: h.chatId, characterId, html: CARD_HTML }),
  });
  expect(response.status).toBe(200);
  return cardFrameMintResponseSchema.parse(await response.json());
}

async function servedPolicy(h: ChatRoot, minted: CardFrameMintResponse): Promise<string | null> {
  const response = await h.root.http.request(minted.url);
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  return response.headers.get(POLICY);
}

test("a narrator row's frame mints under the least-trusted present character, and a lowered character narrows it at serve", async () => {
  using plan = finiteReplies("narrator card frame", [CARD]);
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
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "Aria is a warden of the ford." }),
      createCharacterSchema.parse({ handle: "kai", name: "Kai", description: "Kai is a wandering bard." }),
    ],
    group: { output: "narrator", policy: DEFAULT_GROUP_CONFIG.policy },
  });
  const aria = present(h.characters[0]);
  const kai = present(h.characters[1]);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." })).aborted).toBe(false);
  const author = present(present((await readRoomCanon(h.root, h.owner, h.chatId)).at(-1)).characterId);
  expect([aria.id, kai.id]).not.toContain(author);

  // Both characters inherit the install's interactive default, so the narrator row's cards may run their scripts.
  const minted = await mint(h, author);
  expect(minted.granted).toEqual({ externalMedia: false, inlineData: true, interactive: true });
  expect(await servedPolicy(h, minted)).toBe(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "interactive"));

  // Aria drops to Render HTML: the same handle loses scripts at its next serve and keeps the trusted media door.
  await h.caller.character.update({ characterId: aria.id, input: renderPolicyOverrideForStep("trusted") });
  expect(await servedPolicy(h, minted)).toBe(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "static"));

  // Kai drops to plain text: the handle serves at the floor, and a fresh mint grants nothing.
  await h.caller.character.update({ characterId: kai.id, input: renderPolicyOverrideForStep("untrusted") });
  const floor = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static");
  expect(await servedPolicy(h, minted)).toBe(floor);
  expect((await mint(h, author)).granted).toEqual({ externalMedia: false, inlineData: false, interactive: false });
  // Aria's own seat still frames at her own step, so the floor above is the narrator rule, not a broken read.
  expect((await mint(h, aria.id)).granted).toEqual({ externalMedia: false, inlineData: true, interactive: false });
});
