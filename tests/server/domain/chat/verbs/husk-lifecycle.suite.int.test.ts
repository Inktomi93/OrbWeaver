// THE HUSK LIFECYCLE (chat-creation draft-mode replacement, R0) — the cross-verb suite for the create →
// hide → claim → reveal → reap loop. It lives as a `.suite.` because no single verb owns the invariant: the
// LENS is a persistence WHERE, the CLAIM is stamped by a dozen verbs through one chokepoint, the REAP is two
// verbs, and the STATS timing is a contract between `startChat`, the claim, and the rebuild. A per-verb test
// can prove its own arm and still let the loop be broken end to end.
//
// The model under test (design doc §4.2-§4.7, all seven forks owner-ratified):
//   • `startChat` mints a HUSK — `chats.started_at` NULL. Nothing else mints one; a fork/import is born claimed.
//   • A husk is INVISIBLE in `listMemberChats` for EVERYONE including its creator (the PD-65 `temporary` twin).
//   • The first real activity CLAIMS it: a user line, a generated turn, or any explicit host/member config
//     write (F4(a) — the owner's "or did something with"). The stamp is idempotent and one-way.
//   • The CREATION stats deltas fire at CLAIM, not at creation (§4.7) — husk churn must not inflate
//     chat-created economics, and a husk must not consume a character's first-chat bump.
//   • A husk is reaped: `reapHusk` on nav-away (host-only, server re-checks) and the TTL belt inside
//     `reapTemporaryChats`. Every husk reap fans `chatDeleted` (the deliberate PD-65 divergence — a husk CAN
//     be the open room on the creating device, so its removal must reach that device) — on the LIVE-ONLY
//     lane, AFTER `RETURNING` proves the room actually died (R1-4a; see the interleave arms below).
//
// RED-FIRST NOTE (what this file proved before the implementation landed): every arm below except the two
// that name `reapHusk` asserts through an API that already existed — `listMemberChats`, `createChatLifecycle`,
// `createStartChat`, `characterSeatedInAnotherChat` — so each was a genuine behavioral RED on the pre-R0
// source with only the `started_at` column added, not a build error. The `reapHusk` arms could not be
// expressed against the old surface (the verb did not exist) and are post-implementation coverage.

import type { ChatBusEvent, LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns.ts";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { insertChatEventStatement } from "../../../../../packages/server/src/domain/chat/persistence/events.ts";
import { characterSeatedInAnotherChat } from "../../../../../packages/server/src/domain/chat/persistence/participants-read.ts";
import { listMemberChats } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createChatLifecycle } from "../../../../../packages/server/src/domain/chat/verbs/chat-lifecycle.ts";
import { createClaimChat } from "../../../../../packages/server/src/domain/chat/verbs/claim-chat.ts";
import { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, makeLoadParticipantViews, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";

/** A page bound comfortably above every fixture here — these arms are about the LENS, not the keyset. */
const TEST_PAGE_LIMIT = 100;
/** The husk TTL belt's window: `reapTemporaryChats` resolves 24h from the stubbed settings op. */
const TTL_HOURS = 24;
const TTL_MS = TTL_HOURS * 3_600_000;

let db: Db;
let emitted: ChatBusEvent[];
/** The LIVE-ONLY lane's recorder — where `chatDeleted` goes since the R1-4a reorder. Separate buffer from
 *  `emitted` on purpose: WHICH LANE a room death took is half of what changed. */
let fannedLive: LiveOnlyChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
  fannedLive = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

const emitLive = (event: LiveOnlyChatBusEvent): void => {
  fannedLive.push(event);
};

/** Every death announced this run, on either lane — the set an R1-4a assertion quantifies over, because
 *  "the reap announced nothing" must be true of BOTH doors, not just the one the fix happens to use. */
function deathsAnnounced(): readonly ChatBusEvent[] {
  return [...emitted, ...fannedLive].filter((e) => e.type === "chatDeleted");
}

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** The lifecycle bundle under the two recorders + a live claim chokepoint (the composition root's wiring). */
function lifecycle(ctx: ChatContext): ReturnType<typeof createChatLifecycle> {
  return createChatLifecycle(ctx, { emit, emitLive, activeTurns: createActiveTurns(), claimChat: createClaimChat(ctx) });
}

/** A `Db` that runs `hook` immediately BEFORE the first `delete(...)` statement executes — the read→write
 *  window, opened deterministically instead of by timing luck.
 *
 *  WHY IT HANGS OFF `delete`: the reap verbs used to await an `emit` between their SELECT and their DELETE,
 *  and these interleave arms used THAT as the seam. The R1-4a reorder deleted the seam along with the
 *  false-emit (the fan is now after `RETURNING`), and the TTL sweep has no SELECT left at all — so the
 *  window has to be opened at the write itself. Drizzle's write builders are LAZY thenables that mutate and
 *  return `this` from `.where()`/`.returning()`, so one proxy over the object `delete()` returns survives the
 *  whole chain. The stats fence now commits a claimed-room delete through `db.batch`; that execution seam is
 *  intercepted too, after the delete statement has been built but before the batch runs. Fails LOUD if either
 *  seam stops holding: the hook never runs, the doomed room is deleted, and the survivor assertion reds. */
function dbClaimingBeforeDelete(base: Db, hook: () => Promise<void>): Db {
  let fired = false;
  let deleteBuilt = false;
  const wrapBuilder = (builder: object): object =>
    new Proxy(builder, {
      get(target, prop, receiver): unknown {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (prop === "then" && typeof value === "function") {
          const then = value as (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => unknown;
          return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown): unknown => {
            const ready = fired ? Promise.resolve() : hook();
            fired = true;
            return ready.then(() => then.call(target, ok, err));
          };
        }
        if (typeof value !== "function") {
          return value;
        }
        const method = value as (...args: unknown[]) => unknown;
        return (...args: unknown[]): unknown => {
          const out = method.apply(target, args);
          return out === target ? receiver : out;
        };
      },
    });
  return new Proxy(base, {
    get(target, prop, receiver): unknown {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop === "batch" && typeof value === "function") {
        const batch = value as (...args: unknown[]) => Promise<unknown>;
        return async (...args: unknown[]): Promise<unknown> => {
          if (deleteBuilt && !fired) {
            fired = true;
            await hook();
          }
          return await batch.apply(target, args);
        };
      }
      if (prop !== "delete" || typeof value !== "function") {
        return value;
      }
      const del = value as (...args: unknown[]) => object;
      return (...args: unknown[]): object => {
        deleteBuilt = true;
        return wrapBuilder(del.apply(target, args));
      };
    },
  }) as Db;
}

/** `startChat`'s collaborators — creation itself never claims (R2 retired the generate-opening arm that
 *  used to be the one claiming path here; every case in this suite claims through a SEPARATE verb call). */
function startDeps(_ctx: ChatContext): Parameters<typeof createStartChat>[1] {
  return {
    emit,
    prepareCreationEvent: (event) => ({
      statement: insertChatEventStatement(_ctx.db, {
        id: _ctx.newEventId(),
        chatId: event.chatId,
        seq: 1,
        event,
        createdAt: _ctx.now(),
      }),
      publishCommitted: (): void => {
        emitted.push(event);
      },
    }),
    loadParticipantViews: makeLoadParticipantViews(db),
  };
}

/** Read one chat's husk column back. */
async function startedAtOf(chatId: ChatId): Promise<number | null> {
  const [row] = await db.select({ startedAt: chats.startedAt }).from(chats).where(eq(chats.id, chatId));
  return row?.startedAt ?? null;
}

/** A host + a hand-seeded HUSK they host (the `startedAt: null` opt-in). */
async function seedHusk(key: string, opts: { readonly createdAt?: number } = {}): Promise<{ host: UserId; chatId: ChatId }> {
  const host = await seedUser(db, castId<Handle>(`host_${key}`));
  const chatId = await seedChat(db, key, { startedAt: null, ...(opts.createdAt === undefined ? {} : { createdAt: opts.createdAt }) });
  await seedParticipant(db, { chatId, key: `p_${key}`, userId: host, role: "host" });
  return { host, chatId };
}

describe("husk lens — a room nobody started is invisible to the library list", () => {
  test("listMemberChats hides an unclaimed chat from its own creator, and shows it the instant it is claimed", async () => {
    const { host, chatId } = await seedHusk("a");

    expect((await listMemberChats(db, host, { limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toStrictEqual([]);
    // Claimed by a plain host row write — the lens is a pure function of `started_at`, not of canon.
    await lifecycle(makeChatContext(db)).updateTitle({ principal: principal(host), chatId, title: "Real now" });
    expect((await listMemberChats(db, host, { limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toStrictEqual([chatId]);
  });

  test("the husk arm is INDEPENDENT of the archived + temporary arms: includeArchived does not surface a husk", async () => {
    const { host, chatId } = await seedHusk("b");
    await db.update(chats).set({ archived: true }).where(eq(chats.id, chatId));
    expect(await listMemberChats(db, host, { includeArchived: true, limit: TEST_PAGE_LIMIT })).toStrictEqual([]);
  });
});

describe("claim — the one-way, idempotent stamp", () => {
  test("startChat mints a HUSK (started_at NULL) and the room is not in the list until something claims it", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    // FABRICATION-OK: startChat reads exactly one card field on this path (`greetings[0]`, absent here) — a full CharacterCard literal is twenty nulls of noise around it.
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve({ name: "Aria", greetings: [] } as never) });
    const { startChat } = createStartChat(ctx, startDeps(ctx));

    const { chat } = await startChat({ principal: principal(host), characterIds: [aria], opening: "none" });
    expect(await startedAtOf(chat.id)).toBeNull();
    expect(await listMemberChats(db, host, { limit: TEST_PAGE_LIMIT })).toStrictEqual([]);
  });

  test("the stamp is idempotent + one-way: a second claim at a later clock never moves the first instant", async () => {
    const { host, chatId } = await seedHusk("c");
    const later = FROZEN_AT + 5000;
    const life = lifecycle(makeChatContext(db));

    await life.star({ principal: principal(host), chatId, starred: true });
    expect(await startedAtOf(chatId)).toBe(FROZEN_AT);

    await lifecycle(makeChatContext(db, { now: () => later })).archive({ principal: principal(host), chatId, archived: true });
    expect(await startedAtOf(chatId)).toBe(FROZEN_AT);
  });

  test("a claim fans chatsChanged so a SECOND device's list learns the room appeared without a reload", async () => {
    const { host, chatId } = await seedHusk("d");
    const fanned: ChatId[] = [];
    const ctx = makeChatContext(db, {
      emitChatChanged: (id: ChatId): Promise<void> => {
        fanned.push(id);
        return Promise.resolve();
      },
    });

    await lifecycle(ctx).setVariables({ principal: principal(host), chatId, values: { mood: "grim" } });
    expect(fanned).toContain(chatId);
  });

  test("a config write on an ALREADY-claimed room does not re-fan a claim (the stamp is the transition, not the write)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "claimed"); // born claimed (the seeder default)
    await seedParticipant(db, { chatId, key: "p", userId: host, role: "host" });
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });

    await lifecycle(ctx).star({ principal: principal(host), chatId, starred: true });
    expect(deltas).toStrictEqual([]);
  });
});

describe("stats timing — the creation deltas fire at CLAIM, never at creation (§4.7)", () => {
  test("startChat pushes NO stats; the claim pushes the chat-created counters + the seeded greeting contribution", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      // FABRICATION-OK: startChat reads only `greetings[0].text` off the card on this path.
      getCard: () => Promise.resolve({ name: "Aria", greetings: [{ text: "Hello there friend." }] } as never),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const { startChat } = createStartChat(ctx, startDeps(ctx));

    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });
    expect(deltas).toStrictEqual([]);

    await lifecycle(ctx).updateTitle({ principal: principal(host), chatId: chat.id, title: "Started" });
    const created = deltas.find((d) => d.chats === 1);
    expect(created?.chatsCreated).toBe(1);
    expect(created?.characterId).toBe(aria);
    expect(created?.newCharacter).toBe(true);
    // The greeting seeded at creation contributes exactly once — at the claim, with the greeting's own text.
    const greeting = deltas.find((d) => d.assistantTurns === 1);
    expect(greeting?.assistantWords).toBe(3);
    expect(deltas.filter((d) => d.assistantTurns === 1)).toHaveLength(1);
  });

  test("a REAPED husk pushed nothing, ever: creation + reap leave the delta stream empty", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      // FABRICATION-OK: startChat reads only `greetings[0].text` off the card on this path.
      getCard: () => Promise.resolve({ name: "Aria", greetings: [{ text: "Hi." }] } as never),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const { startChat } = createStartChat(ctx, startDeps(ctx));

    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });
    await lifecycle(ctx).reapHusk({ principal: principal(host), chatId: chat.id });
    expect(deltas).toStrictEqual([]);
    expect(await db.select().from(chats).where(eq(chats.id, chat.id))).toStrictEqual([]);
  });
});

describe("firstness — a husk never consumes a character's first-chat bump (§4.7)", () => {
  test("characterSeatedInAnotherChat ignores a seat whose chat is an unclaimed husk, and counts it once claimed", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const husk = await seedChat(db, "husk", { startedAt: null });
    const probe = await seedChat(db, "probe");
    await seedParticipant(db, { chatId: husk, key: "h1", characterId: aria });

    expect(await characterSeatedInAnotherChat(db, aria, probe)).toBe(false);
    await db.update(chats).set({ startedAt: FROZEN_AT }).where(eq(chats.id, husk));
    expect(await characterSeatedInAnotherChat(db, aria, probe)).toBe(true);
  });
});

describe("reap — the nav-away verb and the TTL belt", () => {
  test("reapHusk drops an unclaimed room, fans chatDeleted live (the PD-65 divergence), and no-ops on a CLAIMED one", async () => {
    const { host, chatId } = await seedHusk("e");
    const life = lifecycle(makeChatContext(db));

    await life.reapHusk({ principal: principal(host), chatId });
    expect(await db.select().from(chats).where(eq(chats.id, chatId))).toStrictEqual([]);
    // A husk CAN be the open room on the creating device, so its removal MUST reach that device — the temp
    // reaper's "deliberately no bus event" argument does not transfer. It rides the LIVE-ONLY lane: a durable
    // row would be cascaded away by this very delete, which is why nothing lands in `emitted`.
    expect(fannedLive).toContainEqual({ type: "chatDeleted", chatId });
    expect(emitted).toStrictEqual([]);

    const host2 = await seedUser(db, castId<Handle>("host2"));
    const claimed = await seedChat(db, "claimed2");
    await seedParticipant(db, { chatId: claimed, key: "p2", userId: host2, role: "host" });
    emitted.length = 0;
    fannedLive.length = 0;
    await life.reapHusk({ principal: principal(host2), chatId: claimed });
    expect(await db.select().from(chats).where(eq(chats.id, claimed))).toHaveLength(1);
    expect(deathsAnnounced()).toStrictEqual([]);
  });

  // ── THE INTERLEAVE ARMS (R3's R1-4b data loss + R1-4a's false emit) ──────────────────────────────
  //
  // Both reap arms decide whether a room still qualifies and then delete it, and a CLAIM can land in
  // between: a user returning to the room and typing is exactly the case the nav-away skip and the TTL
  // window exist to protect. TWO separate defects lived in that window and both are pinned here:
  //   • R1-4b (DATA LOSS) — the decision has to be the DELETE's. The predicate rides the WHERE, so a room
  //     that stopped qualifying survives the write that was already in flight for it.
  //   • R1-4a (FALSE EMIT) — the ANNOUNCEMENT has to follow `RETURNING`. It used to precede the DELETE
  //     (forced: a durable append after the row is gone FK-fails), so a declined reap told every open
  //     device the room had died while it survived. With `chatDeleted` on the live-only lane there is
  //     nothing to append, the fan happens after the write, and a survivor is announced on NO lane —
  //     which is what `deathsAnnounced()` quantifies over.
  // The window is opened at the WRITE (`dbClaimingBeforeDelete`), because the awaited-emit seam these arms
  // used to hang off is precisely what the reorder removed.

  test("reapHusk: a claim landing before the write LEAVES THE ROOM and announces NO death (R1-4b + R1-4a)", async () => {
    const { host, chatId } = await seedHusk("interleave-husk");
    const racing = dbClaimingBeforeDelete(db, async () => {
      await db.update(chats).set({ startedAt: FROZEN_AT }).where(eq(chats.id, chatId));
    });

    await lifecycle(makeChatContext(racing)).reapHusk({ principal: principal(host), chatId });

    // R1-4b: the room is still here — the DELETE re-evaluated `started_at IS NULL` and matched nothing.
    expect(await db.select().from(chats).where(eq(chats.id, chatId))).toHaveLength(1);
    // R1-4a: and NOBODY was told it died. This is the assertion that was impossible before the reorder —
    // the old ordering had already fanned `chatDeleted` by the time the DELETE declined, bouncing every
    // open device to landing on a room that survives.
    expect(deathsAnnounced()).toStrictEqual([]);
  });

  test("the TTL sweep: a room claimed under the sweep SURVIVES, is never announced dead, and `reaped` counts REMOVALS", async () => {
    // THE DATA-LOSS ARM. The sweep used to delete by an id list read from a prior SELECT, so a room that
    // stopped qualifying between the two — claimed, or its last other human arriving — went anyway, canon
    // and all. It is now ONE `DELETE … RETURNING` whose WHERE carries the whole conjunction, so the
    // qualification decision and the write are the same statement — and `RETURNING` is simultaneously the
    // honest count and the exact fan set.
    const stale = FROZEN_AT - TTL_MS - 1000;
    const doomed = await seedHusk("sweep-doomed", { createdAt: stale });
    const rescued = await seedChat(db, "sweep-rescued", { startedAt: null, createdAt: stale });
    await seedParticipant(db, { chatId: rescued, key: "p_sweep_rescued", userId: doomed.host, role: "host" });

    const racing = dbClaimingBeforeDelete(db, async () => {
      await db.update(chats).set({ startedAt: FROZEN_AT }).where(eq(chats.id, rescued));
    });

    const result = await lifecycle(makeChatContext(racing)).reapTemporaryChats({ principal: principal(doomed.host) });

    // The claimed room is intact…
    expect(await db.select().from(chats).where(eq(chats.id, rescued))).toHaveLength(1);
    // …the genuinely-doomed one is gone…
    expect(await db.select().from(chats).where(eq(chats.id, doomed.chatId))).toStrictEqual([]);
    // …the count is the REMOVED set, not the doomed one (a caller that trusts `reaped` is told the truth)…
    expect(result).toStrictEqual({ reaped: 1 });
    // …and the fan is EXACTLY the removed set: the rescued room is announced dead on no lane (R1-4a).
    expect(deathsAnnounced()).toStrictEqual([{ type: "chatDeleted", chatId: doomed.chatId }]);
  });

  test("reapHusk is HOST-only — a plain member cannot reap the room out from under the host", async () => {
    const { host, chatId } = await seedHusk("f");
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });

    const err = await lifecycle(makeChatContext(db))
      .reapHusk({ principal: principal(member), chatId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(await db.select().from(chats).where(eq(chats.id, chatId))).toHaveLength(1);
    // …and the same call from the HOST does reap it (the refusal is authority, not a broken predicate).
    await lifecycle(makeChatContext(db)).reapHusk({ principal: principal(host), chatId });
    expect(await db.select().from(chats).where(eq(chats.id, chatId))).toStrictEqual([]);
  });

  test("the TTL belt sweeps an EXPIRED husk, spares a fresh one, and still sweeps expired temporary chats", async () => {
    const { host, chatId: expired } = await seedHusk("old", { createdAt: FROZEN_AT - TTL_MS - 1 });
    const fresh = await seedChat(db, "fresh", { startedAt: null, createdAt: FROZEN_AT });
    await seedParticipant(db, { chatId: fresh, key: "pf", userId: host, role: "host" });
    const temp = await seedChat(db, "temp", { temporary: true, createdAt: FROZEN_AT - TTL_MS - 1 });
    await seedParticipant(db, { chatId: temp, key: "pt", userId: host, role: "host" });

    const { reaped } = await lifecycle(makeChatContext(db)).reapTemporaryChats({ principal: principal(host) });
    expect(reaped).toBe(2);
    expect((await db.select({ id: chats.id }).from(chats)).map((r) => r.id)).toStrictEqual([fresh]);
    expect(fannedLive).toContainEqual({ type: "chatDeleted", chatId: expired });
    expect(fannedLive).toContainEqual({ type: "chatDeleted", chatId: temp });
  });

  test("the TTL belt is host-scoped: another user's expired husk is untouched", async () => {
    const { host } = await seedHusk("mine", { createdAt: FROZEN_AT - TTL_MS - 1 });
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const theirs = await seedChat(db, "theirs", { startedAt: null, createdAt: FROZEN_AT - TTL_MS - 1 });
    await seedParticipant(db, { chatId: theirs, key: "ps", userId: stranger, role: "host" });

    await lifecycle(makeChatContext(db)).reapTemporaryChats({ principal: principal(host) });
    expect((await db.select({ id: chats.id }).from(chats)).map((r) => r.id)).toStrictEqual([theirs]);
  });

  test("the TTL belt spares a husk that gained a SECOND human — a multi-human room is somebody else's too", async () => {
    const { host, chatId } = await seedHusk("shared", { createdAt: FROZEN_AT - TTL_MS - 1 });
    const guest = await seedUser(db, castId<Handle>("guest"));
    await seedParticipant(db, { chatId, key: "g", userId: guest, role: "member" });

    const { reaped } = await lifecycle(makeChatContext(db)).reapTemporaryChats({ principal: principal(host) });
    expect(reaped).toBe(0);
    expect(await db.select().from(chats).where(eq(chats.id, chatId))).toHaveLength(1);
  });
});
