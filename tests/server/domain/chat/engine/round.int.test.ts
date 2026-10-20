// @subject packages/server/src/domain/chat/engine/round.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { GroupConfig, TurnOutcome } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import { messages } from "@orb/db";
import { jsonValueSchema } from "@orb/kit/json";
import { makePromptConfig } from "@orb/testkit/iso/preset-config.ts";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";

async function room(group: Partial<GroupConfig> = {}, names = ["Aria", "Bran"], promptConfig?: PromptConfig): Promise<ChatRoot> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A committed round reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return await createChatRoot({
    providerFetch: provider.execute,
    ...(promptConfig === undefined ? {} : { promptConfig }),
    characters: names.map((name) => createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: `${name}'s unique card.` })),
    group: { output: "per-speaker", policy: "list", ...group },
  });
}

// Inspect physical JSON rather than reconstructing an engine request or its assembly inputs.
async function inputs(h: ChatRoot): Promise<readonly (readonly { readonly role: string; readonly content: string }[])[]> {
  const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  return await Promise.all(
    requests.map(async (request) => {
      const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
      if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
        throw new Error("the physical chat request has no message list");
      }
      return body["messages"].map((message) => {
        if (
          message === null ||
          typeof message !== "object" ||
          Array.isArray(message) ||
          typeof message["role"] !== "string" ||
          typeof message["content"] !== "string"
        ) {
          throw new Error("the text-only round emitted a non-text physical message");
        }
        return { role: message["role"], content: message["content"] };
      });
    }),
  );
}

async function send(h: ChatRoot): Promise<TurnOutcome> {
  return await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "What happens next?" });
}

test("runs each resolved speaker, committing a row per speaker (characterId = speaker)", async () => {
  await using h = await room({}, ["Aria", "Bran", "Cara"]);
  const outcome = await send(h);
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter(({ role }) => role === "assistant")).toHaveLength(3);
  const history = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(history.map(({ seq }) => seq)).toEqual([1, 2, 3, 4]);
  expect(history.slice(1).map(({ characterId }) => characterId)).toEqual(h.characters.map(({ id }) => id));
  expect(history.slice(1).every(({ role }) => role === "assistant")).toBe(true);
});

test("per-speaker merged: every speaker sends the same roster block, and each cue names its own speaker", async () => {
  await using h = await room({ cardScope: "merged" });
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(2);
  const systems = requests.map((rows) =>
    rows
      .filter(({ role }) => role === "system")
      .map(({ content }) => content)
      .join("\n"),
  );
  expect(systems[0]).toContain("[Character — Bran]");
  expect(systems[1]).toBe(systems[0]);
  expect(requests[0]?.at(-1)?.content).toContain("Write the next reply only as Aria.");
  expect(requests[1]?.at(-1)?.content).toContain("Write the next reply only as Bran.");
});

test("ONE immutable ctx: every speaker's request shares the same built system block", async () => {
  await using h = await room();
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.filter(({ role }) => role === "system")).toEqual(requests[1]?.filter(({ role }) => role === "system"));
});

test("canon advances between speakers: speaker k+1's history includes speaker k's committed row", async () => {
  await using h = await room();
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(2);
  expect(requests[1]?.length).toBeGreaterThan(requests[0]?.length ?? 0);
  expect(requests[0]?.some(({ content }) => content.includes("A committed round reply."))).toBe(false);
  expect(requests[1]?.some(({ content }) => content.includes("A committed round reply."))).toBe(true);
});

test("the two-axis group nudge fences each speaker by name (multi-speaker round)", async () => {
  await using h = await room();
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.at(-1)?.content).toContain("only as Aria");
  expect(requests[1]?.at(-1)?.content).toContain("only as Bran");
});

test("the host's PROSE override re-words the round nudge, keeping the per-speaker name fence", async () => {
  await using h = await room(
    {},
    ["Aria", "Bran"],
    makePromptConfig({ prose: { "chat.group.roundNudge": { text: "[SPEAK AS {{name}}. Nobody else.]", baseVersion: 1 } } }),
  );
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.at(-1)?.content).toContain("[SPEAK AS Aria. Nobody else.]");
  expect(requests[0]?.at(-1)?.content).not.toContain("Write the next reply only as");
  expect(requests[1]?.at(-1)?.content).toContain("[SPEAK AS Bran. Nobody else.]");
});

test("the per-chat lock is released after the round (a subsequent round runs)", async () => {
  await using h = await room({}, ["Aria"]);
  expect((await send(h)).aborted).toBe(false);
  expect((await send(h)).aborted).toBe(false);
  const rows = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(rows.map(({ seq }) => seq)).toEqual([1, 2, 3, 4]);
  expect(rows.map(({ role }) => role)).toEqual(["user", "assistant", "user", "assistant"]);
});

test("a MULTI-member narrator round asks for the <speaker> markers AND names the characters", async () => {
  await using h = await room({ output: "narrator" });
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(1);
  const text = requests[0]?.map(({ content }) => content).join("\n");
  expect(text).toContain("<speaker>Name</speaker>");
  expect(text).toContain("voicing the present characters (Aria, Bran)");
  expect(text).not.toContain("Write the next reply only as");
});

test("speakerTags OFF drops the marker instruction but keeps the group nudge (independent toggles)", async () => {
  await using h = await room({ output: "narrator", speakerTags: false });
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(1);
  const text = requests[0]?.map(({ content }) => content).join("\n");
  expect(text).not.toContain("<speaker>");
  expect(text).toContain("voicing the present characters (Aria, Bran)");
});

test("a SINGLE-CHARACTER narrator round sends no nudge at all (byte-identical single turn)", async () => {
  await using h = await room({ output: "narrator" }, ["Aria"]);
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(1);
  const text = requests[0]?.map(({ content }) => content).join("\n");
  expect(text).not.toContain("<speaker>");
  expect(text).not.toContain("voicing the present characters");
});

test("the host's PROSE override re-words the speaker-tag instruction (PROSE-1, owner-editable)", async () => {
  await using h = await room(
    { output: "narrator" },
    ["Aria", "Bran"],
    makePromptConfig({ prose: { "chat.group.speakerTags": { text: "[TAG THEM: <speaker>X</speaker>.]", baseVersion: 1 } } }),
  );
  await send(h);
  const requests = await inputs(h);
  expect(requests).toHaveLength(1);
  const text = requests[0]?.map(({ content }) => content).join("\n");
  expect(text).toContain("[TAG THEM: <speaker>X</speaker>.]");
  expect(text).not.toContain("Wrap each character's spoken lines");
});
