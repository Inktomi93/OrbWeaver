// stats drift gate — the CROSS-WRITER equality harness (the stats design doc inv #3; D60 doc 02 §4 the agent row).
//
// The build plan (docs/plans/agent-principals/design.md) is explicit: the drift suite must gain the agent row "on
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
// backstop the stats design doc inv #3 names, and the AP2 checkpoint (07 §2) requires.
//
// THE SEED IS MULTI-CHARACTER FOR A REASON (#1147): a one-character canon cannot tell "per room" from "per
// SEAT", so this gate ran green for months over a live plane that credited a room only to its FIRST
// founding seat. Any arm added here that touches the chat/character grains carries a second seat, or it
// re-opens the blind spot.

import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, chatParticipants, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { canonMessageDelta, chatCreatedDelta, seatChatDelta, swipeVariantDelta } from "../../../../../packages/server/src/domain/chat/substrate/stats-delta.ts";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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
  // Deliberately output-only: the drift gate must prove the live model slice and the canon rebuild
  // count each nullable axis independently instead of manufacturing an input sample from scalar zero.
  tokensIn: null,
  tokensOut: 11,
} as const;
// The ESTIMATED turn — an IMPORTED row the token-usage catch-up settled (`domain/import/verbs/
// backfill-token-usage`). It is the third `tokenProvenance` arm and the one no writer test exercised: the
// sample keys it feeds are RUNTIME-BUILT STRINGS on both sides (`tokenSampleSlice`'s
// `` `${prefix}…${suffix}` `` and the rebuild's `` acc[`tokensIn${kind}`] ``), so a typo in either half is
// invisible to tsc and shows up only as a rollup that silently counts nothing. Both writers must fold it
// into the ESTIMATED columns and leave the measured ones alone.
const ESTIMATED_ASSIST = {
  content: "an imported line, token-counted by estimate",
  model: "gpt",
  provider: "openrouter",
  tokensIn: 7,
  tokensOut: 3,
  tokenProvenance: "estimated",
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
  // seq 4 — the ESTIMATED turn (an imported row the catch-up settled).
  await seedMessage(db, {
    chatId,
    seq: 4,
    role: "assistant",
    characterId,
    createdAt: T0,
    variants: [{ ...ESTIMATED_ASSIST }],
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
        tokenProvenance: "unrecorded",
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
        tokenProvenance: "measured",
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
        tokenProvenance: "measured",
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
    // The ESTIMATED turn — the third provenance arm, folded by both writers into the *EstimatedSamples
    // columns (and into the same scalar token totals a measured row feeds).
    canonMessageDelta({
      ownerId,
      sign: 1,
      now: T0,
      row: {
        characterId,
        role: "assistant",
        createdAt: T0,
        content: ESTIMATED_ASSIST.content,
        tokensIn: ESTIMATED_ASSIST.tokensIn,
        tokensOut: ESTIMATED_ASSIST.tokensOut,
        tokenProvenance: ESTIMATED_ASSIST.tokenProvenance,
        costUsd: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        contextWindow: null,
        genStartedAt: null,
        genFinishedAt: null,
        model: ESTIMATED_ASSIST.model,
        provider: ESTIMATED_ASSIST.provider,
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
        tokenProvenance: "measured",
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
  const ownerRow = (await database.select().from(ownerStats).where(eq(ownerStats.ownerId, owner)))[0];
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
    expect(live.owner).toMatchObject({ assistantTurns: 3, tokensIn: 19, tokensOut: 38 });
    expect(live.chars).toHaveLength(1);
    // …and the PROVENANCE split is real on both sides: the estimated turn lands in the estimated columns
    // only (a runtime-built key that missed would leave these at 0 while `toEqual` above stayed green,
    // because both writers would have missed it the same way ONLY if they shared the typo — they don't).
    expect(live.owner).toMatchObject({
      tokensInMeasuredSamples: 2,
      tokensOutMeasuredSamples: 3,
      tokensInEstimatedSamples: 1,
      tokensOutEstimatedSamples: 1,
    });
  });

  // R0 §4.7 — THE HUSK IS A TWO-WRITER CONTRACT, and this is the arm that pins it. A husk (`chats.started_at`
  // NULL) is a room nobody started: the LIVE plane pushes nothing for it, because the creation deltas moved
  // off `startChat` onto the claim chokepoint and the claim never fired. The REBUILD had to learn the same
  // rule (`rebuild-from-canon.ts::ownerChatIds` + `loadChatMeta`) or it would keep counting the room, its
  // seeded greeting and its character seat — and the gate above would red the first time a user bounced off
  // the picker. Fixing one side of a two-writer contract and not the other is the failure this asserts
  // against, so the husk here carries EVERYTHING a real room would (a seat, canon with economics, a
  // creation day) and still must move neither writer by a single column.
  test("a HUSK moves NEITHER writer: an unclaimed room with a full canon contributes zero to both", async () => {
    // The husk seats the SAME character the started room does — deliberately: that makes the husk's only
    // possible effect the chat/canon counts under test, and keeps `owner_stats.characters` (which the rebuild
    // derives from the characters TABLE, not from seats) out of the comparison.
    const husk = await seedChat(db, characterId, { id: "chat_husk", createdAt: T0, updatedAt: T0, startedAt: null });
    await seedMessage(db, {
      chatId: husk,
      seq: 1,
      role: "assistant",
      characterId,
      createdAt: T0,
      variants: [{ ...CHAR_ASSIST, content: "an unstarted room's seeded greeting" }],
    });

    // Writer A over a canon that now includes the husk.
    const clock = createFrozenClock(T0 + 5000);
    await reconcileStats(db, { ownerId, now: clock.now });
    const reconciled = await snapshotRollups(db, ownerId);

    // Writer B — the SAME live replay as the arm above, deliberately unchanged: the husk contributes no
    // delta because nothing ever claimed it, so if the rebuild counted it the two would diverge.
    await wipeRollups(db);
    const batch: BatchStmt[] = [];
    for (const delta of liveDeltas()) {
      applyStatsDelta(batch, db, delta);
    }
    await db.batch(batchMany(batch));
    const live = await snapshotRollups(db, ownerId);

    expect(reconciled).toEqual(live);
    // …and not vacuously: the husk's own character never gets a rollup row, and the owner's chat count is
    // still the ONE started room.
    expect(reconciled.chars).toHaveLength(1);
    expect(reconciled.chars[0]).toMatchObject({ chats: 1, assistantTurns: 2 });
    expect(reconciled.owner).toMatchObject({ chats: 1, assistantTurns: 3 });
  });

  // #1147 — THE SEAT AXIS. Every arm above seeds exactly ONE character, and that is precisely why this gate
  // ran green for months while the live plane credited the room only to a room's FIRST founding seat: with
  // one seat, "per room" and "per seat" are the same number. A room with two character seats is the ordinary
  // group chat, and it is the smallest canon that can tell the two apart — the rebuild counts the room ONCE
  // for the owner and ONCE PER SEAT for the census (`loadChatMeta`), so the live plane must too. The second
  // seat here is deliberately SILENT: it also pins the census POPULATION (a seat with no canon is still a
  // row), which is the other half of what a single-character seed could never see.
  test("a SECOND SEAT moves BOTH writers identically: the room counts once for the owner and once per seat", async () => {
    const second = await seedCharacter(db, ownerId, { id: "character_b", name: "Bryn" });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_second_seat"),
      chatId,
      kind: "character",
      characterId: second,
      role: "member",
      joinSeq: 0,
    });

    const clock = createFrozenClock(T0 + 5000);
    await reconcileStats(db, { ownerId, now: clock.now });
    const reconciled = await snapshotRollups(db, ownerId);

    await wipeRollups(db);
    const batch: BatchStmt[] = [];
    // The live replay a two-seat claim produces: the head `chatCreatedDelta` for the primary seat, ONE
    // `seatChatDelta` for the second (`verbs/claim-chat.ts`), then the canon folds unchanged.
    for (const delta of [...liveDeltas(), seatChatDelta({ ownerId, characterId: second, forked: false, newCharacter: true, now: T0 })]) {
      applyStatsDelta(batch, db, delta);
    }
    await db.batch(batchMany(batch));
    const live = await snapshotRollups(db, ownerId);

    expect(live).toEqual(reconciled);
    // …and not vacuously: two census rows, each holding the ONE room, while the OWNER's library still
    // counts that room once (the whole reason the two grains had to be split).
    expect(live.chars).toHaveLength(2);
    expect(live.chars.map((c) => c["chats"])).toStrictEqual([1, 1]);
    expect(live.owner).toMatchObject({ chats: 1, characters: 2 });
  });
});
