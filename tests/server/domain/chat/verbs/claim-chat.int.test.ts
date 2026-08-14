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
import { chats } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { createClaimChat } from "../../../../../packages/server/src/domain/chat/verbs/claim-chat.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

/** One UTC day in ms — the gap that makes a claim land on a different `day` bucket than the creation. */
const ONE_DAY = 86_400_000;

let db: Db;
let deltas: StatsDelta[];
let fanned: ChatId[];

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
});

describe("claimChat — the creation-stats replay", () => {
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
