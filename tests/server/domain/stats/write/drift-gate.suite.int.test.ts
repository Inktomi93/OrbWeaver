// stats drift gate — the CROSS-WRITER equality harness (stats.md inv #3; D60 doc 02 §4 the agent row).
//
// The build plan (agent-principal-design/07 §3) is explicit: the drift suite must gain the agent row "on
// BOTH writers in the same commit, or the gate lies." Two INDEPENDENT per-writer tests asserting matching
// hand-computed constants (which is what `apply-delta` + `rebuild-from-canon` each carry today) do NOT
// satisfy that — neither one runs both writers over one canon, so a drift between them is invisible.
//
// THIS is the missing gate: seed ONE canon (a host-owned-character assistant turn WITH a swipe, a user
// turn, and an AGENT-authored assistant row — characterId NULL, D60), then produce the four rollups TWO
// ways over that same canon and assert they are byte-identical (modulo the minted `id` + the clock
// `computedAt`):
//   • WRITER A (reconcile) — `reconcileStats` rebuilds the rollups by streaming the canon.
//   • WRITER B (live)      — the SAME canon replayed through the production delta builders
//     (`chatCreatedDelta`/`canonMessageDelta`/`swipeVariantDelta` — whose contract IS "mirror the rebuild
//     folds", stats-delta.ts header) + `applyStatsDelta` upserting into the four rollup tables.
// If either writer drifts on ANY column — for the agent row or any other — `toEqual` fails. This is the
// backstop stats.md inv #3 names, and the AP2 checkpoint (07 §2) requires.

import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt, Db } from "@orb/db";
import { batchMany, characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  canonMessageDelta,
  chatCreatedDelta,
  swipeVariantDelta,
} from "../../../../../packages/server/src/domain/chat/substrate/stats-delta.ts";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedPersona, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;
let chatId: ChatId;

// ── The ONE canon (economics shared by the seed AND the live replay — single source of truth). ──
// The character-assistant turn: full economics + reasoning + a context window + a swipe.
const CHAR_ASSIST = {
  content: "I am here",
  model: "gpt",
  provider: "openrouter",
  tokensIn: 10,
  tokensOut: 20,
  costUsd: 0.5,
  cacheReadTokens: 5,
  cacheWriteTokens: 3,
  contextWindow: 1000,
  genStartedAt: T0,
  genFinishedAt: T0 + 100,
  reasoning: "thinking",
  reasoningDuration: 40,
} as const;
const CHAR_SWIPE = {
  content: "alt take",
  model: "gpt",
  provider: "openrouter",
  tokensIn: 2,
  tokensOut: 4,
  genStartedAt: T0,
  genFinishedAt: T0 + 50,
} as const;
// The AGENT-authored assistant turn (characterId NULL — the D60 doc 02 §4 twin: folds to the HOST owner,
// never a character_stats row).
const AGENT_ASSIST = {
  content: "buddy speaks",
  model: "gpt",
  provider: "openrouter",
  tokensIn: 7,
  tokensOut: 11,
} as const;
const USER_TEXT = "hello world";
// biome-ignore lint/style/useNamingConvention: the json_extract('$.reasoning_duration') read path key.
const CHAR_META = { reasoning_duration: CHAR_ASSIST.reasoningDuration } as const;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId, { name: "Aria" });
  const personaId = await seedPersona(db, ownerId);
  chatId = await seedChat(db, characterId, { createdAt: T0, updatedAt: T0 });
  // seq 1 — a user turn (no economics).
  await seedMessage(db, {
    chatId,
    seq: 1,
    role: "user",
    personaId,
    createdAt: T0,
    variants: [{ content: USER_TEXT }],
  });
  // seq 2 — the character-assistant turn: selected variant + one swipe (both `gpt`/`openrouter`).
  await seedMessage(db, {
    chatId,
    seq: 2,
    role: "assistant",
    characterId,
    createdAt: T0,
    selectedIdx: 0,
    variants: [{ ...CHAR_ASSIST }, { ...CHAR_SWIPE }],
  });
  // seq 3 — the AGENT-authored assistant turn: characterId NULL (D60).
  await seedMessage(db, {
    chatId,
    seq: 3,
    role: "assistant",
    characterId: null,
    createdAt: T0,
    variants: [{ ...AGENT_ASSIST }],
  });
});

/** The live-writer replay of the seeded canon: the exact deltas the production builders emit for these
 *  rows, in write order. `canonMessageDelta`/`swipeVariantDelta` are the declared mirrors of the rebuild's
 *  `foldMessage`/`foldSwipe`; `chatCreatedDelta({newCharacter: true})` supplies the chat/character library
 *  counts the message folds don't own (reconcile derives them from the character/chat tables — esoteric
 *  #10). PD-96: `newCharacter` is the REAL builder output (the `start-chat` first-chat probe sets it) —
 *  no hand-spread masking the wiring. */
function liveDeltas(): StatsDelta[] {
  return [
    chatCreatedDelta({ ownerId, characterId, forked: false, newCharacter: true, now: T0 }),
    // The user turn — no character grain (drift gate: user rows carry characterId null).
    canonMessageDelta({
      ownerId,
      sign: 1,
      now: T0,
      row: {
        characterId: null,
        role: "user",
        createdAt: T0,
        content: USER_TEXT,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        contextWindow: null,
        genStartedAt: null,
        genFinishedAt: null,
        model: null,
        provider: null,
        reasoning: null,
        metadata: null,
        selectedIdx: null,
        variantCount: 1,
      },
    }),
    // The character-assistant turn (its SELECTED variant; variantCount 2 = settled).
    canonMessageDelta({
      ownerId,
      sign: 1,
      now: T0,
      row: {
        characterId,
        role: "assistant",
        createdAt: T0,
        content: CHAR_ASSIST.content,
        tokensIn: CHAR_ASSIST.tokensIn,
        tokensOut: CHAR_ASSIST.tokensOut,
        costUsd: CHAR_ASSIST.costUsd,
        cacheReadTokens: CHAR_ASSIST.cacheReadTokens,
        cacheWriteTokens: CHAR_ASSIST.cacheWriteTokens,
        contextWindow: CHAR_ASSIST.contextWindow,
        genStartedAt: CHAR_ASSIST.genStartedAt,
        genFinishedAt: CHAR_ASSIST.genFinishedAt,
        model: CHAR_ASSIST.model,
        provider: CHAR_ASSIST.provider,
        reasoning: CHAR_ASSIST.reasoning,
        metadata: CHAR_META,
        selectedIdx: 0,
        variantCount: 2,
      },
    }),
    // The AGENT-authored assistant turn — characterId null (D60 doc 02 §4).
    canonMessageDelta({
      ownerId,
      sign: 1,
      now: T0,
      row: {
        characterId: null,
        role: "assistant",
        createdAt: T0,
        content: AGENT_ASSIST.content,
        tokensIn: AGENT_ASSIST.tokensIn,
        tokensOut: AGENT_ASSIST.tokensOut,
        costUsd: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        contextWindow: null,
        genStartedAt: null,
        genFinishedAt: null,
        model: AGENT_ASSIST.model,
        provider: AGENT_ASSIST.provider,
        reasoning: null,
        metadata: null,
        selectedIdx: null,
        variantCount: 1,
      },
    }),
    // The character's swipe (the NON-selected variant).
    swipeVariantDelta({
      ownerId,
      sign: 1,
      now: T0,
      row: {
        characterId,
        msgCreatedAt: T0,
        content: CHAR_SWIPE.content,
        tokensIn: CHAR_SWIPE.tokensIn,
        tokensOut: CHAR_SWIPE.tokensOut,
        genStartedAt: CHAR_SWIPE.genStartedAt,
        genFinishedAt: CHAR_SWIPE.genFinishedAt,
        model: CHAR_SWIPE.model,
        provider: CHAR_SWIPE.provider,
        reasoning: null,
        metadata: null,
      },
    }),
  ];
}

/** Drop the two legitimately non-deterministic columns (`id` = minted, `computedAt` = injected clock) so
 *  the comparison is over the DATA the two writers compute, not their bookkeeping. */
function strip(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k !== "id" && k !== "computedAt") {
      out[k] = v;
    }
  }
  return out;
}

const byKey =
  (k: string) =>
  (a: Record<string, unknown>, b: Record<string, unknown>): number =>
    String(a[k]).localeCompare(String(b[k]));

interface RollupSnapshot {
  owner: Record<string, unknown> | null;
  chars: Record<string, unknown>[];
  days: Record<string, unknown>[];
  models: Record<string, unknown>[];
}

/** Read the four rollup tables for `ownerId` and normalize (strip bookkeeping + sort) into a comparable shape. */
async function snapshotRollups(database: Db, owner: UserId): Promise<RollupSnapshot> {
  const ownerRow = (
    await database.select().from(ownerStats).where(eq(ownerStats.ownerId, owner))
  )[0];
  const chars = await database.select().from(characterStats);
  const days = await database.select().from(dailyStats).where(eq(dailyStats.ownerId, owner));
  const models = await database.select().from(modelStats).where(eq(modelStats.ownerId, owner));
  return {
    owner: ownerRow ? strip(ownerRow) : null,
    chars: chars.map(strip).sort(byKey("characterId")),
    days: days.map(strip).sort(byKey("day")),
    models: models.map(strip).sort(byKey("model")),
  };
}

async function wipeRollups(database: Db): Promise<void> {
  await database.delete(characterStats);
  await database.delete(ownerStats);
  await database.delete(dailyStats);
  await database.delete(modelStats);
}

describe("stats drift gate — live deltas vs a canon rebuild agree column-for-column (D60 agent row)", () => {
  test("the four rollups are byte-identical whether rebuilt from canon or applied live", async () => {
    // Writer A — reconcile the four rollups from canon.
    const clock = createFrozenClock(T0 + 5000);
    await reconcileStats(db, { ownerId, now: clock.now });
    const reconciled = await snapshotRollups(db, ownerId);

    // Reset, then Writer B — replay the SAME canon through the live builders into the same tables.
    await wipeRollups(db);
    const batch: BatchStmt[] = [];
    for (const delta of liveDeltas()) {
      applyStatsDelta(batch, db, delta);
    }
    await db.batch(batchMany(batch));
    const live = await snapshotRollups(db, ownerId);

    // THE GATE: no drift between the two writers over one canon — the agent row included.
    expect(live).toEqual(reconciled);

    // Guard against a false green from two identical EMPTIES (a canon that silently dropped the rows would
    // still `toEqual`): pin the agent's contribution is actually present — the host counts BOTH assistant
    // turns, and no character_stats row was minted for the agent.
    expect(live.owner).toMatchObject({ assistantTurns: 2, tokensIn: 19, tokensOut: 35 });
    expect(live.chars).toHaveLength(1);
  });
});
