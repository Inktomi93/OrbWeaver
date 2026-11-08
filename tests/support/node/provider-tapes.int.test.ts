// @subject tests/support/node/provider-tape.ts
// Every committed tape parses, holds no secret or foreign host, and its text steps replay through the production
// chat turn: the recorded stream reaches canon through the real SSE parse, so a parse change breaks the replay.
import { readdirSync } from "node:fs";
import { isPlainObject } from "@orb/kit/guards";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { forEachNonEmpty } from "../iso/non-empty.ts";
import { readRoomCanon } from "./chat/canon.ts";
import { createChatRoot } from "./chat/composed.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";
import type { ProviderTapeStep } from "./provider-tape.ts";
import { PROVIDER_TAPE_DIR, providerTapeLeaks, readProviderTape } from "./provider-tape.ts";

const TAPE_SUFFIX = ".json";
const CHAT_PATH = "/chat/completions";
const TURN_CUE = "Continue the scene.";

const TAPE_NAMES = readdirSync(PROVIDER_TAPE_DIR, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(TAPE_SUFFIX))
  .map((path) => path.slice(0, -TAPE_SUFFIX.length))
  .toSorted();

function deltaOf(frame: string): unknown {
  const chunk: unknown = JSON.parse(frame);
  const choices = isPlainObject(chunk) ? chunk["choices"] : undefined;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  return isPlainObject(first) ? first["delta"] : undefined;
}

// A step whose stream carries tool calls drives a tool loop no plain room has; the e2e journeys replay those.
function isTextStep(step: ProviderTapeStep): boolean {
  return step.frames.every((frame) => {
    const delta = deltaOf(frame);
    return !(isPlainObject(delta) && delta["tool_calls"] !== undefined);
  });
}

function streamedText(step: ProviderTapeStep): string {
  return step.frames
    .map((frame) => {
      const delta = deltaOf(frame);
      return isPlainObject(delta) && typeof delta["content"] === "string" ? delta["content"] : "";
    })
    .join("");
}

forEachNonEmpty(TAPE_NAMES, "committed provider tapes", (name) => {
  test(`provider tape ${name} parses and holds no secret or foreign host`, () => {
    expect(providerTapeLeaks(readProviderTape(name))).toEqual([]);
  });
});

const TEXT_STEPS = TAPE_NAMES.flatMap((name) =>
  readProviderTape(name)
    .steps.filter((step) => isTextStep(step) && streamedText(step).trim().length > 0)
    .map((step) => ({ name, step })),
);

forEachNonEmpty(TEXT_STEPS, "recorded text steps", ({ name, step }) => {
  test(`provider tape ${name} step ${step.step} replays into canon through the production turn`, async () => {
    const corpus = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "unused: the tape answers every chat request",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    });
    let played = 0;
    const providerFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith(CHAT_PATH)) {
        return await corpus.execute(request);
      }
      played += 1;
      const body = `${step.frames.map((frame) => `data: ${frame}\n\n`).join("")}data: [DONE]\n\n`;
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    };
    await using room = await createChatRoot({ memoryEnabled: false, providerFetch });
    await room.caller.chat.send({ chatId: room.chatId, content: TURN_CUE, timeZone: UTC_TIME_ZONE });
    const assistants = (await readRoomCanon(room.root, room.owner, room.chatId)).filter((message) => message.role === "assistant");
    expect(played).toBe(1);
    expect(assistants.at(-1)?.content).toBe(streamedText(step).trim());
  });
});
