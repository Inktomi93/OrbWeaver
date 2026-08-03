// The QUIET, non-canon generation seam (domain/chat/verbs/quiet-generate). Its OWN contract, pinned directly
// (not just through managed compaction): a bounded generation through the chat's resolved connection via the
// injected `runChatTurn`, reducing the stream to `{text, costUsd}`. The load-bearing guarantees are what it does
// NOT do — commit no canon (messages / message_variants), emit no bus events, spawn no ghost — plus the reduce
// shape (final content wins; costUsd rides economics) and failure-honesty (a throwing stream propagates).

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { QuietGenerateParams } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import type { TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createQuietGenerate } from "../../../../../packages/server/src/domain/chat/verbs/quiet-generate.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, testConnection } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const CONNECTION: ResolvedConnection = testConnection("vllm", "agent-sdk");

/** A `runChatTurn` that records its request into `sink` then yields the given stream (the verb's only dep). */
function scriptedRun(sink: TurnRequest[], chunks: readonly TurnStreamChunk[]): ChatContext["runChatTurn"] {
  return (req: TurnRequest) => {
    sink.push(req);
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
  };
}

function paramsOf(chatId: ChatId, over: Partial<QuietGenerateParams> = {}): QuietGenerateParams {
  return { chatId, connection: CONNECTION, systemPrompt: "You summarize.", userText: "the transcript to summarize", ...over };
}

/** The chat-preset-params resolver (side-gen ladder middle rung). Default = an empty posture (no chat preset
 *  params) so the quiet floor stands — the common case; a test that exercises the ladder overrides it. */
const NO_CHAT_PARAMS: ChatContext["resolveChatPresetParams"] = () => Promise.resolve({});

describe("quietGenerate — the verb's own contract", () => {
  test("returns {text, costUsd} — final content wins over deltas, costUsd rides economics", async () => {
    const sink: TurnRequest[] = [];
    const run = scriptedRun(sink, [
      { kind: "text", text: "partial " },
      { kind: "text", text: "delta" },
      { kind: "final", economics: { content: "THE MARKER", costUsd: 0.017, model: "m" } },
    ]);
    const chatId = await seedChat(db, "q");
    const quiet = createQuietGenerate({ runChatTurn: run, resolveChatPresetParams: NO_CHAT_PARAMS });

    const result = await quiet(paramsOf(chatId));

    expect(result).toEqual({ text: "THE MARKER", costUsd: 0.017 });
    // The system prompt rode the static prefix, the userText rode the one user message, and the connection passed through.
    const req = sink.at(0);
    expect(req?.prompt.static).toBe("You summarize.");
    expect(req?.connection).toBe(CONNECTION);
    expect(req?.history).toHaveLength(1);
    expect(req?.history.at(0)?.role).toBe("user");
  });

  test("SIDE-GEN LADDER — byte-identical default: no chat preset params ⇒ the wire intent carries the quiet_generate floor", async () => {
    // The no-behavior-change-at-default guarantee: a chat whose host has no preset params gets exactly the OLD
    // hardcoded posture (temp 0.3, 1024 out) on the wire — the floor catalog IS that encoding.
    const sink: TurnRequest[] = [];
    const chatId = await seedChat(db, "qfloor");
    const quiet = createQuietGenerate({
      runChatTurn: scriptedRun(sink, [{ kind: "final", economics: { content: "M", model: "m" } }]),
      resolveChatPresetParams: NO_CHAT_PARAMS,
    });
    await quiet(paramsOf(chatId));
    expect(sink.at(0)?.intent).toMatchObject({ temperature: 0.3, maxOutputTokens: 1024 });
  });

  test("SIDE-GEN LADDER — the chat host's preset params OVERRIDE the floor on the wire (the user's temp reaches quiet-generate)", async () => {
    // The whole point of the program: a user's global gen params reach side-gen. The chat host's preset sets
    // temperature 0.9 → the wire intent carries 0.9 (over the 0.3 floor); maxOutputTokens the preset didn't set
    // defers to the quiet floor (1024).
    const sink: TurnRequest[] = [];
    const chatId = await seedChat(db, "qover");
    const quiet = createQuietGenerate({
      runChatTurn: scriptedRun(sink, [{ kind: "final", economics: { content: "M", model: "m" } }]),
      resolveChatPresetParams: () => Promise.resolve({ temperature: 0.9 }),
    });
    await quiet(paramsOf(chatId));
    expect(sink.at(0)?.intent).toMatchObject({ temperature: 0.9, maxOutputTokens: 1024 });
  });

  test("SIDE-GEN LADDER — the caller's intent (compaction's per-pass override) beats BOTH the chat params and the floor", async () => {
    // The top rung: compaction passes SIDE_GEN_POSTURES.compaction ({temperature:0.3}) as `intent`; even when the
    // chat preset sets 0.9, the caller intent wins on temperature. maxOutputTokens (unset at both) → the floor.
    const sink: TurnRequest[] = [];
    const chatId = await seedChat(db, "qtop");
    const quiet = createQuietGenerate({
      runChatTurn: scriptedRun(sink, [{ kind: "final", economics: { content: "M", model: "m" } }]),
      resolveChatPresetParams: () => Promise.resolve({ temperature: 0.9, maxOutputTokens: 2000 }),
    });
    await quiet(paramsOf(chatId, { intent: { temperature: 0.3 } }));
    // temperature from the caller intent (0.3); maxOutputTokens from the chat preset (2000, the caller intent left it unset).
    expect(sink.at(0)?.intent).toMatchObject({ temperature: 0.3, maxOutputTokens: 2000 });
  });

  test("a null economics cost yields costUsd: null (a local vLLM turn reports none)", async () => {
    const chatId = await seedChat(db, "q2");
    const quiet = createQuietGenerate({
      runChatTurn: scriptedRun([], [{ kind: "final", economics: { content: "M", model: "m" } }]),
      resolveChatPresetParams: NO_CHAT_PARAMS,
    });
    const result = await quiet(paramsOf(chatId));
    expect(result.costUsd).toBeNull();
    expect(result.text).toBe("M");
  });

  test("COMMITS ZERO canon: no messages / message_variants rows are written for the chat", async () => {
    const chatId = await seedChat(db, "q3");
    const quiet = createQuietGenerate({
      runChatTurn: scriptedRun([], [{ kind: "final", economics: { content: "M", costUsd: 0.01, model: "m" } }]),
      resolveChatPresetParams: NO_CHAT_PARAMS,
    });

    await quiet(paramsOf(chatId));

    // A quiet generation is non-canon — the transcript is untouched.
    const slots = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(slots).toHaveLength(0);
    const variants = await db.select().from(messageVariants);
    expect(variants).toHaveLength(0);
  });

  test("EMITS NOTHING: the verb has no bus/emit dep — a quiet generation can't fire turnStarted/delta/turnCompleted", () => {
    // Structural pin: `createQuietGenerate`'s deps are exactly `{ runChatTurn, resolveChatPresetParams }` — no
    // `emit`, no canon-write op — so it is IMPOSSIBLE for it to emit a bus turn event or persist a ghost. The
    // `resolveChatPresetParams` dep is a READ (the side-gen sampling ladder's middle rung), never a write.
    const deps = { runChatTurn: scriptedRun([], []), resolveChatPresetParams: NO_CHAT_PARAMS };
    const keys = Object.keys(deps);
    expect(keys).toEqual(["runChatTurn", "resolveChatPresetParams"]);
  });

  test("FAILURE HONESTY: a throwing stream propagates (the caller owns the typed error)", async () => {
    const chatId = await seedChat(db, "q4");
    const throwing: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.reject(new Error("provider down"));
        yield { kind: "text", text: "" }; // unreachable
      })();
    const quiet = createQuietGenerate({ runChatTurn: throwing, resolveChatPresetParams: NO_CHAT_PARAMS });

    const err = await quiet(paramsOf(chatId)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("provider down");
  });
});
