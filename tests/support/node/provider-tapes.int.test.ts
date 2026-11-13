// @subject tests/support/node/provider-tape.ts
// Every committed tape parses, holds no secret or foreign host, and its text steps replay through the production
// chat turn: the recorded stream reaches canon through the real SSE parse, so a parse change breaks the replay.
// Each rpg loop journey replays whole through a lite game, so its recorded state tool calls reach the production
// tool round and the snapshot write. A tape the recorder writes is the file the formatter would leave.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { RPG_NO_CHANGES_TOOL, RPG_TOOL_ROUND_TOOL_NAMES } from "@orb/contracts/rpg";
import { isPlainObject } from "@orb/kit/guards";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { forEachNonEmpty } from "../iso/non-empty.ts";
import { readRoomCanon } from "./chat/canon.ts";
import { createChatRoot } from "./chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";
import type { ProviderTapeStep } from "./provider-tape.ts";
import { PROVIDER_TAPE_DIR, providerTapeLeaks, RPG_LOOP_JOURNEYS, readProviderTape, writeProviderTape } from "./provider-tape.ts";
import { ownedTempDir } from "./temp-dir.ts";

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

// The tool names a step's stream calls: a call names its tool in the first chunk that opens it.
function toolCallNames(step: ProviderTapeStep): readonly string[] {
  return step.frames.flatMap((frame) => {
    const delta = deltaOf(frame);
    const calls: unknown = isPlainObject(delta) ? delta["tool_calls"] : undefined;
    return (Array.isArray(calls) ? calls : []).flatMap((call: unknown) => {
      const fn = isPlainObject(call) ? call["function"] : undefined;
      const name = isPlainObject(fn) ? fn["name"] : undefined;
      return typeof name === "string" && name.length > 0 ? [name] : [];
    });
  });
}

const STATE_WRITING_TOOLS: readonly string[] = RPG_TOOL_ROUND_TOOL_NAMES.filter((name) => name !== RPG_NO_CHANGES_TOOL);

forEachNonEmpty(TAPE_NAMES, "committed provider tapes", (name) => {
  test(`provider tape ${name} parses and holds no secret or foreign host`, () => {
    expect(providerTapeLeaks(readProviderTape(name))).toEqual([]);
  });
});

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const BIOME_ENTRY = join(REPO_ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");

// A recording run writes outside the committed directory and the record script copies the file in, so the bytes the
// recorder writes are the bytes that get committed.
forEachNonEmpty(TAPE_NAMES, "committed provider tapes", (name) => {
  test(`provider tape ${name} is recorded as the formatter leaves it`, async () => {
    await using owner = new AsyncDisposableStack();
    const directory = await ownedTempDir(owner, "provider-tape-record-");
    writeProviderTape(name, readProviderTape(name), directory);
    const recorded = readFileSync(join(directory, `${name}${TAPE_SUFFIX}`), "utf8");

    const committedPath = join(PROVIDER_TAPE_DIR, `${name}${TAPE_SUFFIX}`);
    const formatted = runNicedSync(process.execPath, [BIOME_ENTRY, "format", `--stdin-file-path=${relative(REPO_ROOT, committedPath)}`], {
      cwd: REPO_ROOT,
      input: recorded,
    });
    expect(formatted.status, formatted.stderr).toBe(0);
    expect(recorded).toBe(formatted.stdout);
    // The committed tape went through the same recorder, so a re-record of the same turns changes no byte.
    expect(recorded).toBe(readFileSync(committedPath, "utf8"));
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

// A loopback wire cannot fold, and `cheap` skips the fold, so both modes end in the same post-commit tool round: one
// journey replay covers each tape's state round whichever mode recorded it.
forEachNonEmpty(Object.values(RPG_LOOP_JOURNEYS), "rpg loop journeys", (journey) => {
  test(`rpg loop tape ${journey.tape} replays its character turn and state round through a lite game`, async () => {
    const tape = readProviderTape(journey.tape);
    expect(tape.steps.map(({ step }) => step)).toEqual([...journey.steps]);
    const [turnStep, roundStep] = tape.steps;
    if (turnStep === undefined || roundStep === undefined) {
      throw new Error(`rpg loop tape "${journey.tape}" holds fewer than a character turn and a state round`);
    }
    // The state round must carry a writing tool call, or the journey proves no write at all.
    expect(toolCallNames(roundStep).filter((name) => STATE_WRITING_TOOLS.includes(name)).length).toBeGreaterThan(0);

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
      const served = tape.steps[played];
      played += 1;
      if (served === undefined) {
        return new Response(
          JSON.stringify({ error: { message: `rpg loop tape "${journey.tape}" holds ${String(tape.steps.length)} steps; request ${String(played)} arrived` } }),
          {
            status: 422,
            headers: { "content-type": "application/json" },
          },
        );
      }
      const body = `${served.frames.map((frame) => `data: ${frame}\n\n`).join("")}data: [DONE]\n\n`;
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    };
    await using room = await createChatRoot({ memoryEnabled: false, providerFetch, server: { rpgTrace: true } });
    const connection = await room.root.services.connection.create({
      principal: room.owner,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: CORPUS_TEXT_MODEL,
      declared: {
        kind: "generation",
        generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false } },
        features: { detectServer: false },
      },
    });
    await room.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
    await room.root.services.rpg.createGame({ principal: room.owner, chatId: room.chatId, mode: "lite" });
    await room.caller.chat.send({ chatId: room.chatId, content: TURN_CUE, timeZone: UTC_TIME_ZONE });
    await room.root.settleBackground();

    const assistants = (await readRoomCanon(room.root, room.owner, room.chatId)).filter((message) => message.role === "assistant");
    expect(played).toBe(tape.steps.length);
    expect(assistants.at(-1)?.content).toBe(streamedText(turnStep).trim());
    // The recorded tool call parsed into a snapshot write, not a quiet or refused round.
    expect(room.root.app.rpgTrace?.recent({ chatId: room.chatId }).map(({ event }) => event)).toContainEqual(
      expect.objectContaining({ phase: "flushed", outcome: "wrote" }),
    );
  });
});
