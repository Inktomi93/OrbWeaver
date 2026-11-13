// @subject packages/server/src/domain/chat/engine/rerank-pick.ts
// Smart's reranker pick through public send and generate: the last-speaker ban, rank order, blank names, the window clip and Stop.
// The rerank role is a physical peer answering native scores; the roster, the canon and the verb run in production.

import { createCharacterSchema } from "@orb/contracts/character";
import { estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";
import { send, smartRoom, warnings } from "./smart-picker.fixtures.ts";
import { B_CHAT_MODEL, B_RERANK_WINDOW_TOKENS, saveSpeakerConnection, speakerInputs } from "./speaker-funding-physical.ts";
import { priorExchange } from "./turn-generate-policy.fixtures.ts";

const SMART = { output: "per-speaker", policy: "smart" } as const;
const ARIA_FIRST = [
  { index: 0, ["relevance_score"]: 5 },
  { index: 1, ["relevance_score"]: 1 },
] as const;
const rerankBodySchema = z.object({ query: z.string(), documents: z.array(z.string()) });

type Room = Awaited<ReturnType<typeof smartRoom>>;

async function bindRerank(room: Room): Promise<void> {
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "rerank");
}

function rerankRequests(room: Room): readonly Request[] {
  return room.peer.requests.filter((request) => new URL(request.url).pathname === "/v1/rerank");
}

/** The handles of the characters who committed a reply, in commit order. */
function speakers(room: Room, outcome: Awaited<ReturnType<typeof send>>): (string | undefined)[] {
  return outcome.messages.filter((m) => m.role === "assistant").map((m) => room.h.characters.find((character) => character.id === m.characterId)?.handle);
}

test("several addressed characters answer in the reranker's rank order, not the order the line names them", async () => {
  await using room = await smartRoom(
    {
      chat: ["Bryn first.", "Aria second."],
      rerank: [
        { index: 1, ["relevance_score"]: 5 },
        { index: 0, ["relevance_score"]: 1 },
      ],
    },
    { group: { ...SMART, allowSelfResponses: true } },
  );
  await bindRerank(room);
  expect(speakers(room, await send(room, "aria, bryn: thoughts?"))).toEqual(["bryn", "aria"]);
  expect(rerankRequests(room)).toHaveLength(1);
  expect(warnings(room)).toEqual([]);
});

test("the last speaker sits out a reply to its own line, and the ban lifts for a human line or a room that allows self-responses", async () => {
  const own = { transcript: priorExchange("aria", "Nothing more to add.") };
  await using banned = await smartRoom({ chat: ["Bryn steps in."], rerank: [...ARIA_FIRST] }, { ...own, group: { ...SMART, allowSelfResponses: false } });
  await bindRerank(banned);
  const bannedOutcome = await banned.h.root.services.chat.generate({ principal: banned.h.owner, chatId: banned.h.chatId });
  expect(speakers(banned, bannedOutcome)).toEqual(["bryn"]);

  await using lifted = await smartRoom({ chat: ["Aria goes on."], rerank: [...ARIA_FIRST] }, { ...own, group: { ...SMART, allowSelfResponses: true } });
  await bindRerank(lifted);
  const liftedOutcome = await lifted.h.root.services.chat.generate({ principal: lifted.h.owner, chatId: lifted.h.chatId });
  expect(speakers(lifted, liftedOutcome)).toEqual(["aria"]);

  await using human = await smartRoom(
    { chat: ["Aria answers the player."], rerank: [...ARIA_FIRST] },
    { ...own, group: { ...SMART, allowSelfResponses: false } },
  );
  await bindRerank(human);
  expect(speakers(human, await send(human))).toEqual(["aria"]);
});

test("a seat with a blank name is never ranked: a lone named seat answers unranked, and all-blank seats degrade with the warning", async () => {
  const seat = (handle: string, name: string): ReturnType<typeof createCharacterSchema.parse> =>
    createCharacterSchema.parse({ handle, name, description: `The traveller ${handle}.` });
  await using lone = await smartRoom(
    { chat: ["Aria alone."] },
    { characters: [seat("aria", "aria"), seat("ghost", " ")], group: { ...SMART, allowSelfResponses: true } },
  );
  await bindRerank(lone);
  expect(speakers(lone, await send(lone))).toEqual(["aria"]);
  expect(rerankRequests(lone)).toEqual([]);
  expect(warnings(lone)).toEqual([]);

  await using blank = await smartRoom(
    { chat: ["Someone answers."] },
    { characters: [seat("ghost", " "), seat("shade", "  ")], group: { ...SMART, allowSelfResponses: true } },
  );
  await bindRerank(blank);
  const outcome = await send(blank);
  expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  expect(rerankRequests(blank)).toEqual([]);
  expect(warnings(blank)).toEqual([{ type: "warning", chatId: blank.h.chatId, code: "speaker_rerank_unavailable" }]);
});

test("each character document is clipped to the reranker's window before it is sent, its name intact", async () => {
  const long = (handle: string): ReturnType<typeof createCharacterSchema.parse> =>
    createCharacterSchema.parse({ handle, name: handle, description: `The traveller ${handle} ${"wanders the long road and ".repeat(400)}` });
  await using room = await smartRoom(
    { chat: ["Aria answers."], rerank: [...ARIA_FIRST] },
    { characters: [long("aria"), long("bryn")], group: { ...SMART, allowSelfResponses: true } },
  );
  await bindRerank(room);
  await send(room);
  const [request] = rerankRequests(room);
  const body = rerankBodySchema.parse(await request?.clone().json());
  expect(body.documents).toHaveLength(2);
  for (const [at, document] of body.documents.entries()) {
    expect(document.startsWith(at === 0 ? "aria: " : "bryn: ")).toBe(true);
    expect(estimateTokens(body.query) + estimateTokens(document)).toBeLessThanOrEqual(safeTokenWindow(B_RERANK_WINDOW_TOKENS));
  }
});

test("public Stop during a rerank that never answers ends the call and cancels the pick: no fallback speaker, warning or foreground generation", async () => {
  await using room = await smartRoom({ holdRerank: true }, { group: { ...SMART, allowSelfResponses: true } });
  await bindRerank(room);
  const sending = send(room);
  const settled = Promise.allSettled([sending]);
  try {
    await room.peer.reached;
    await room.h.root.services.chat.abort({ principal: room.h.owner, chatId: room.h.chatId });
    // The held answer is never released here: the turn's signal reaches the rerank call, so the pick ends on the Stop.
    const outcome = await sending;
    await room.peer.closed;
    expect(outcome).toMatchObject({ aborted: true, abortReason: "user" });
    expect(outcome.messages.filter((m) => m.role === "assistant")).toEqual([]);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
    expect(warnings(room)).toEqual([]);
  } finally {
    room.peer.release();
    await room.h.root.services.chat.abort({ principal: room.h.owner, chatId: room.h.chatId });
    await settled;
  }
});
