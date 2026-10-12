// The variant's recorded `params` state the EFFECTIVE generation settings the turn ran under (preset params
// folded with the per-send intent), not the per-send overrides alone. Drives the real engine against a real db.

import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { testModelId } from "@orb/testkit/iso/inference-identities.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { beforeEach, describe } from "vitest";
import type { TurnPrep, TurnStreamChunk } from "#server/domain/chat/contract/results.ts";
import { createTurnEngine } from "#server/domain/chat/engine/engine.ts";
import { generateDigests } from "#server/domain/chat/memory/generate/digests.ts";
import { generateSegments } from "#server/domain/chat/memory/generate/segments.ts";
import { loadWitnessHorizons } from "#server/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "#server/domain/chat/memory/recall/recall.ts";
import { makeChatContext, seedChat, seedParticipant, seedUser, testConnection } from "../_support.ts";

const HOST = castId<UserId>("user_host");

const PRESET_TEMPERATURE = 0.4;
const SEND_TOP_P = 0.9;
const PRESET_MAX_OUTPUT = 700;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function engineOf(): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(db, {
    runChatTurn: () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "final", economics: { content: "Hi there", model: testModelId("test-model") } };
      })(),
  });
  return createTurnEngine(ctx, {
    emit: () => Promise.resolve(),
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments,
    generateDigests,
    loadWitnessHorizons,
    recallMemory,
    runCompaction: () => Promise.resolve({ summary: "", compactedAtSeq: 0, updated: false }),
  });
}

describe("variant params — what the wire record states", () => {
  test("the recorded params are the preset params folded with the per-send intent, per-send winning", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "c1");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const assembleContext: AssembleContext = {
      timezone: UTC_TIME_ZONE,
      character: { name: "Aria", description: "a bold knight" },
      promptConfig: {
        ...DEFAULT_PROMPT_CONFIG,
        params: { ...DEFAULT_PROMPT_CONFIG.params, temperature: PRESET_TEMPERATURE, topP: 0.5, maxOutputTokens: PRESET_MAX_OUTPUT },
      },
      activePersona: { name: "Alex", description: "the user" },
      recentMessages: [],
    };
    const prep: TurnPrep = {
      chatId,
      assembleContext,
      connection: testConnection(),
      triggeredBy: HOST,
      funderUserId: HOST,
      runAsUserId: HOST,
      kind: "send",
      intent: { topP: SEND_TOP_P },
      speakerCharacterId: null,
    };

    const outcome = await engineOf().runTurn(prep);
    expect(outcome.aborted).toBe(false);

    const [row] = await db.select().from(messageVariants);
    // Preset-only settings are present, the per-send override wins on the shared field.
    expect(row?.params).toMatchObject({ temperature: PRESET_TEMPERATURE, topP: SEND_TOP_P, maxOutputTokens: PRESET_MAX_OUTPUT });
  });
});
