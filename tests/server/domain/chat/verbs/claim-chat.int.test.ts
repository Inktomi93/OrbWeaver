// `claimChat` (R0 §4.2/§4.5/§4.7) — the CHOKEPOINT itself, driven directly rather than through a verb.
// The cross-verb loop (create → hide → claim → reveal → reap) is `husk-lifecycle.suite.int.test.ts`; THIS
// file is the unit contract every one of those verbs is entitled to assume:
//   • the stamp is CONDITIONAL, so it is idempotent and one-way and the transition fires exactly once;
//   • the creation-stats replay is TOTAL over the canon present at claim (slots + swipes), and buckets the
//     chat-created delta on the ROW'S createdAt, not the claim instant (the rebuild buckets by created_at);
//   • the degenerate rooms — no canon, no host, already gone — are silent no-ops, never throws, because the
//     callers invoke it unconditionally and must not have to ask whether the room is a husk.

import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, chats, ownerStats, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { createClaimChat } from "../../../../../packages/server/src/domain/chat/verbs/claim-chat.ts";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

/** One UTC day in ms — the gap that makes a claim land on a different `day` bucket than the creation. */
const ONE_DAY = 86_400_000;
const CONSTRAINT_RE = /UNIQUE|constraint/i;

let db: Db;
let deltas: StatsDelta[];
let fanned: ChatId[];

function holdNextBatch(sourceDb: Db): { readonly heldDb: Db; readonly reached: Promise<void>; readonly release: () => void } {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let held = false;
  const heldDb = new Proxy(sourceDb, {
    get(target, prop, receiver): unknown {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop !== "batch" || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      const batch = value as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]): Promise<unknown> => {
        if (!held) {
          held = true;
          reached.resolve();
          await released.promise;
        }
        return await batch.apply(target, args);
      };
    },
  }) as Db;
  return { heldDb, reached: reached.promise, release: () => released.resolve() };
}

beforeEach(async () => {
  db = await freshDb();
  deltas = [];
  fanned = [];
});

/** A ctx that records both the claim's observable outputs: the stats deltas and the chat-list fan. */
function recordingCtx(over: Partial<ChatContext> = {}): ChatContext {
  return makeChatContext(db, {
    applyStatsDelta: (_b, _d, delta) => {
      deltas.push(delta as StatsDelta);
    },
    emitChatChanged: (chatId: ChatId): Promise<void> => {
      fanned.push(chatId);
      return Promise.resolve();
    },
    ...over,
  });
}

/** A husk with a host + one character seat. `createdAt` defaults to the frozen clock. */
async function seedHusk(key: string, opts: { readonly createdAt?: number } = {}): Promise<{ host: UserId; chatId: ChatId }> {
  const host = await seedUser(db, castId<Handle>(`host_${key}`));
  const character = await seedCharacter(db, host, `char_${key}`);
  const chatId = await seedChat(db, key, { startedAt: null, ...(opts.createdAt === undefined ? {} : { createdAt: opts.createdAt }) });
  await seedParticipant(db, { chatId, key: `h_${key}`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `c_${key}`, characterId: character });
  return { host, chatId };
}

async function startedAtOf(chatId: ChatId): Promise<number | null> {
  const [row] = await db.select({ startedAt: chats.startedAt }).from(chats).where(eq(chats.id, chatId));
  return row?.startedAt ?? null;
}

describe("claimChat — the conditional stamp", () => {
  test("stamps the clock, fans the list once, and a SECOND call is a total no-op (no re-stamp, no re-count, no re-fan)", async () => {
    const { chatId } = await seedHusk("a");
    const claim = createClaimChat(recordingCtx());

    await claim(chatId);
    expect(await startedAtOf(chatId)).toBe(FROZEN_AT);
    expect(fanned).toStrictEqual([chatId]);
    const afterFirst = deltas.length;
    expect(afterFirst).toBeGreaterThan(0);

    // A later clock, the same room: the WHERE clause is the transition test, so nothing happens twice.
    await createClaimChat(recordingCtx({ now: () => FROZEN_AT + ONE_DAY }))(chatId);
    expect(await startedAtOf(chatId)).toBe(FROZEN_AT);
    expect(fanned).toStrictEqual([chatId]);
    expect(deltas).toHaveLength(afterFirst);
  });

  test("a chatId that no longer exists is silent — callers invoke it unconditionally and a racing delete is not their bug", async () => {
    const claim = createClaimChat(recordingCtx());
    await expect(claim(castId<ChatId>("chat_gone"))).resolves.toBeUndefined();
    expect(deltas).toStrictEqual([]);
    expect(fanned).toStrictEqual([]);
  });

  test("a HOSTLESS room still claims — the visibility flip lands even when there is nobody to attribute economics to", async () => {
    const chatId = await seedChat(db, "orphan", { startedAt: null });
    await createClaimChat(recordingCtx())(chatId);

    expect(await startedAtOf(chatId)).toBe(FROZEN_AT);
    expect(fanned).toStrictEqual([chatId]);
    // D18 makes a hostless room representable (an archived orphan); a stats delta with no owner would be a
    // fabricated attribution, so the replay is skipped rather than guessed at.
    expect(deltas).toStrictEqual([]);
  });

  test("serializes concurrent same-room claimers so the replay and fan still fire exactly once", async () => {
    const { host, chatId } = await seedHusk("concurrent");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "seeded greeting" });
    const held = holdNextBatch(db);
    const claim = createClaimChat(
      makeChatContext(held.heldDb, {
        applyStatsDelta: (batch, deltaDb, delta) => applyStatsDelta(batch as BatchStmt[], deltaDb, delta),
        emitChatChanged: (id): Promise<void> => {
          fanned.push(id);
          return Promise.resolve();
        },
      }),
    );

    const first = claim(chatId);
    await held.reached;
    const second = claim(chatId);
    held.release();
    await Promise.all([first, second]);

    const [owner] = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host));
    expect(owner?.chats).toBe(1);
    expect(owner?.assistantTurns).toBe(1);
    expect(fanned).toStrictEqual([chatId]);
  });

  test("rolls back the visibility flip, replay, and version on a mid-batch failure, then permits a clean retry", async () => {
    const { host, chatId } = await seedHusk("retry");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "seeded greeting" });
    let injectFailure = true;
    const claim = createClaimChat(
      makeChatContext(db, {
        applyStatsDelta: (batch, deltaDb, delta) => {
          const statements = batch as BatchStmt[];
          applyStatsDelta(statements, deltaDb, delta);
          if (injectFailure) {
            injectFailure = false;
            statements.push(deltaDb.insert(chats).values({ id: chatId }));
          }
        },
        emitChatChanged: () => Promise.resolve(),
      }),
    );

    await expect(claim(chatId)).rejects.toThrow(CONSTRAINT_RE);
    expect(await startedAtOf(chatId)).toBeNull();
    expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host))).toStrictEqual([]);
    expect(await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host))).toStrictEqual([]);

    await claim(chatId);
    expect(await startedAtOf(chatId)).toBe(FROZEN_AT);
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host)))[0]?.chats).toBe(1);
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBeGreaterThan(0);
  });
});

describe("claimChat — the creation-stats replay", () => {
  test("keeps started_at hidden until its replay deltas and canon version can commit in the same batch", async () => {
    const { host, chatId } = await seedHusk("atomic");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "seeded greeting" });
    const held = holdNextBatch(db);
    const claiming = createClaimChat(
      makeChatContext(held.heldDb, {
        applyStatsDelta: (batch, deltaDb, delta) => applyStatsDelta(batch as BatchStmt[], deltaDb, delta),
        emitChatChanged: () => Promise.resolve(),
      }),
    )(chatId);

    await held.reached;
    const visibleWhileReplayHeld = await startedAtOf(chatId);
    await reconcileStats(db, { ownerId: host, now: () => FROZEN_AT + ONE_DAY });
    held.release();
    await claiming;

    const [owner] = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host));
    expect(owner?.chats).toBe(1);
    expect(owner?.assistantTurns).toBe(1);
    expect(visibleWhileReplayHeld).toBeNull();
  });

  test("buckets the chat-created delta on the ROW'S createdAt, not the claim instant (the rebuild buckets by created_at)", async () => {
    const bornAt = FROZEN_AT - 3 * ONE_DAY;
    const { chatId } = await seedHusk("late", { createdAt: bornAt });

    await createClaimChat(recordingCtx())(chatId);

    const created = deltas.find((d) => d.chats === 1);
    // A room created three days ago and started today still counts as created three days ago — otherwise a
    // reconcile (which reads `chats.created_at`) would disagree with the live plane on the daily histogram.
    expect(created?.day).toBe(new Date(bornAt).toISOString().slice(0, 10));
    expect(created?.firstAt).toBe(bornAt);
  });

  test("replays EVERY canon row present at claim, exactly once — a greet-all room contributes one delta per seeded greeting", async () => {
    const { chatId } = await seedHusk("canon");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "first greeting here" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "second greeting" });

    await createClaimChat(recordingCtx())(chatId);

    expect(deltas.filter((d) => d.assistantTurns === 1)).toHaveLength(2);
    // Single-variant rows are unsettled by definition, so nothing is credited as a swipe. (The non-selected
    // variant arm of the replay is the fork-copy fold verbatim — `verbs/fork.ts::pushForkStatsDeltas` — and it
    // is unreachable at claim under the ordering invariant, since a greeting swipe would itself have claimed.)
    expect(deltas.filter((d) => d.swipes === 1)).toStrictEqual([]);
  });

  test("a room with NO canon still pushes its chat-created delta (creation counts even when the opening seeded nothing)", async () => {
    const { chatId } = await seedHusk("bare");

    await createClaimChat(recordingCtx())(chatId);

    expect(deltas.filter((d) => d.chats === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.assistantTurns === 1)).toStrictEqual([]);
  });
});

/** The per-character room census (`character_stats.chats`) as a writer left it — read straight off the
 *  rollup so the assertion is over STORED rows, never a builder's return value. */
async function characterCensus(): Promise<{ characterId: CharacterId; chats: number; firstChatAt: number | null }[]> {
  const rows = await db
    .select({ characterId: characterStats.characterId, chats: characterStats.chats, firstChatAt: characterStats.firstChatAt })
    .from(characterStats);
  return rows
    .map((r) => ({ chats: r.chats, firstChatAt: r.firstChatAt, characterId: r.characterId }))
    .sort((a, b) => a.characterId.localeCompare(b.characterId));
}

/** A husk with a host and TWO character seats — the ordinary group room. `bSpeaks` seeds a greeting for the
 *  second seat too (a greet-all room); without it the second seat is a SILENT founding member. */
async function seedTwoSeatHusk(key: string, opts: { readonly bSpeaks: boolean }): Promise<{ host: UserId; chatId: ChatId; a: CharacterId; b: CharacterId }> {
  const host = await seedUser(db, castId<Handle>(`host_${key}`));
  const a = await seedCharacter(db, host, `char_${key}_a`);
  const b = await seedCharacter(db, host, `char_${key}_b`);
  const chatId = await seedChat(db, key, { startedAt: null });
  await seedParticipant(db, { chatId, key: `h_${key}`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `ca_${key}`, characterId: a });
  await seedParticipant(db, { chatId, key: `cb_${key}`, characterId: b });
  await seedMessage(db, chatId, 1, { role: "assistant", characterId: a, content: "A greets the room" });
  if (opts.bSpeaks) {
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: b, content: "B greets the room" });
  }
  return { host, chatId, a, b };
}

/** Claim through the REAL apply so the census under test is the one a live claim actually stores. */
async function claimWithRealStats(chatId: ChatId): Promise<void> {
  await createClaimChat(
    makeChatContext(db, {
      applyStatsDelta: (batch, deltaDb, delta) => applyStatsDelta(batch as BatchStmt[], deltaDb, delta),
      emitChatChanged: () => Promise.resolve(),
    }),
  )(chatId);
}

// #1147 — THE PER-CHARACTER ROOM CENSUS IS A TWO-WRITER CONTRACT, and the SEAT axis is the half a
// single-character drift gate can never see. `rebuild-from-canon.ts::loadChatMeta` DEFINES
// `character_stats.chats` as `COUNT(DISTINCT cp.chat_id)` over a character's seats; `apply-delta.ts`'s
// header binds the live plane to equal that rebuild column-for-column; `verbs/freshness.ts` promises the
// reader the live rollup is never stale. A two-seat room is the ordinary group chat — so a replay that
// credits only the founding seat makes every Analytics/leaderboard surface print 0 chats for a
// seated-second character until somebody runs a reconcile by hand.
describe("claimChat — the per-character room census (#1147)", () => {
  test("EVERY founding seat counts the room: a two-character claim leaves the same census a canon rebuild does", async () => {
    const { host, a, b, chatId } = await seedTwoSeatHusk("census", { bSpeaks: true });

    await claimWithRealStats(chatId);
    const live = await characterCensus();

    await db.delete(characterStats);
    await reconcileStats(db, { ownerId: host, now: () => FROZEN_AT });
    const rebuilt = await characterCensus();

    expect(live).toStrictEqual(rebuilt);
    // …and not vacuously: BOTH seats hold the one room, each stamped with the room's creation instant.
    expect(live).toStrictEqual([
      { characterId: String(a), chats: 1, firstChatAt: FROZEN_AT },
      { characterId: String(b), chats: 1, firstChatAt: FROZEN_AT },
    ]);
  });

  test("a SILENT founding seat is still a census row: a character that never spoke holds the room on both writers", async () => {
    const { host, a, b, chatId } = await seedTwoSeatHusk("silent", { bSpeaks: false });

    await claimWithRealStats(chatId);
    const live = await characterCensus();

    await db.delete(characterStats);
    await reconcileStats(db, { ownerId: host, now: () => FROZEN_AT });
    const rebuilt = await characterCensus();

    expect(live).toStrictEqual(rebuilt);
    // "Seated here, never spoke" is a real library state (a greet-less card, an imported seated character) —
    // the row carries the room and zero economics, it is not an ABSENT character.
    expect(live).toStrictEqual([
      { characterId: String(a), chats: 1, firstChatAt: FROZEN_AT },
      { characterId: String(b), chats: 1, firstChatAt: FROZEN_AT },
    ]);
    const [silent] = await db.select().from(characterStats).where(eq(characterStats.characterId, b));
    expect(silent).toMatchObject({ assistantTurns: 0, contentBytes: 0 });
  });
});
