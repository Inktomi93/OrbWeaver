// The canon-EDIT verbs (chat.md Part III per-verb specs + §11 the auth matrix; D26). Proves against a real
// libSQL db: an edit mutates the VARIANT (content/reasoning) or the SLOT (selection/hidden/seq/attribution)
// and NEVER doubles content (the slot stays one row, variantCount unchanged); the author-or-host gate; the FK
// cascade on delete; the emitted bus event; and the PD-110 runOnEdit regex re-apply on `editMessage`. The
// verbs are reached through the BUNDLE `createEdit(ctx, {emit, resolveForeignInputs})`.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt, Db } from "@orb/db";
import {
  characterStats,
  chats,
  dailyStats,
  messages,
  messageVariants,
  modelStats,
  ownerStats,
} from "@orb/db";
import type { CharacterId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName, VarOp } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  ChatNotFoundError,
  ChatOperationError,
} from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createEdit } from "../../../../../packages/server/src/domain/chat/verbs/edit";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  addVariant,
  FROZEN_AT,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedPersona,
  seedUser,
} from "../_support";

let db: Db;
let emitted: ChatBusEvent[];
/** The host-global regex source the fake FOREIGN resolver serves (per-test scripts; reset empty). */
let globalScripts: RegexScript[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
  globalScripts = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

/** The FOREIGN-half fake (the PD-110 runOnEdit sources) — DEFAULT config + the per-test `globalScripts`. */
const resolveForeignInputs: Parameters<typeof createEdit>[1]["resolveForeignInputs"] = () =>
  Promise.resolve({
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    globalRegexScripts: globalScripts,
    scanDepth: 6,
    injectionTokenBudget: 0,
  });

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** Seed a solo room: host + member humans, a character, and return their ids. */
async function seedRoom(): Promise<{
  host: UserId;
  member: UserId;
  chatId: Awaited<ReturnType<typeof seedChat>>;
  charA: CharacterId;
}> {
  const host = await seedUser(db, "host");
  const member = await seedUser(db, "member");
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });
  return { host, member, chatId, charA };
}

describe("editMessage — mutate the selected variant (D26, no doubling)", () => {
  test("the author edits their own message: content changes, the slot stays one row", async () => {
    const { member, chatId } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "orig",
    });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const view = await edit.editMessage({
      principal: principal(member),
      chatId,
      messageId,
      content: "fixed",
    });

    expect(view.content).toBe("fixed");
    expect(view.variantCount).toBe(1); // D26: edit mutated the variant, never appended one
    expect(view.editedAt).toBe(view.createdAt); // editedAt stamped (FROZEN clock)
    const variants = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.messageId, messageId));
    expect(variants).toHaveLength(1);
    expect(variants[0]?.content).toBe("fixed");
    expect(emitted).toEqual([{ type: "messageEdited", chatId, messageId, view }]);
  });

  test("a non-author member is refused with not_author; the host may edit any slot", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const err = await edit
      .editMessage({ principal: principal(member), chatId, messageId, content: "x" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "hostfix",
    });
    expect(view.content).toBe("hostfix");
  });

  test("the canon-purity strip drops a leaked self speaker-label on a character row", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const ctx = makeChatContext(db, {
      getCard: () =>
        Promise.resolve({ name: "Aria", avatarAssetId: null, regexScripts: [] } as never),
    });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "Aria: hello there",
    });
    expect(view.content).toBe("hello there");
  });
});

describe("editMessage — runOnEdit regex re-apply (PD-110; D53 host-tier)", () => {
  /** A minimal live card (the assemble RESOLVE + the purify name read; regexScripts ride the cast tier). */
  const card = (name: string, regexScripts: RegexScript[] = []): CharacterCard =>
    ({ name, description: "", avatarAssetId: null, regexScripts }) as unknown as CharacterCard;

  const script = (over: Record<string, unknown>): RegexScript =>
    regexScriptSchema.parse({
      id: "s1",
      name: "s1",
      findRegex: "badword",
      replaceString: "****",
      ...over,
    });

  test("a runOnEdit AI_OUTPUT script transforms an assistant edit before persist", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    globalScripts = [script({ placement: ["AI_OUTPUT"], runOnEdit: true })];
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "she said badword twice",
    });

    // Canon-mutating at write: the STORED row is the post-regex text.
    expect(view.content).toBe("she said **** twice");
    const [variant] = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.messageId, messageId));
    expect(variant?.content).toBe("she said **** twice");
  });

  test("a runOnEdit:false script does NOT re-apply on edit", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    globalScripts = [script({ placement: ["AI_OUTPUT"], runOnEdit: false })];
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "badword survives",
    });

    expect(view.content).toBe("badword survives");
  });

  test("a USER_INPUT runOnEdit script fires on a user-slot edit", async () => {
    const { member, chatId } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, { role: "user", authorUserId: member });
    globalScripts = [script({ placement: ["USER_INPUT"], runOnEdit: true })];
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    const view = await edit.editMessage({
      principal: principal(member),
      chatId,
      messageId,
      content: "i typed badword",
    });

    expect(view.content).toBe("i typed ****");
  });

  test("the D53 watchdog path: a throwing applyRegexReplace skips the script, the content survives", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    globalScripts = [script({ placement: ["AI_OUTPUT"], runOnEdit: true })];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(card("Aria")),
      // The node:vm watchdog seam: a pathological pattern throws instead of hanging — the executor's
      // per-script catch skips it and the next transform runs on the text as-is.
      applyRegexReplace: () => {
        throw new Error("regex timeout (watchdog)");
      },
    });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "badword stays because the script was skipped",
    });

    expect(view.content).toBe("badword stays because the script was skipped");
  });
});

describe("selectVariant — flip the pointer to a sibling swipe (D26 zero-copy)", () => {
  test("selecting an appended swipe moves the pointer; a foreign variant is NOT_FOUND", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "swipe0",
    });
    const swipe1 = await addVariant(db, messageId, 1, "swipe1");
    const other = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const view = await edit.selectVariant({
      principal: principal(host),
      chatId,
      messageId,
      variantId: swipe1,
    });
    expect(view.selectedVariantIdx).toBe(1);
    expect(view.content).toBe("swipe1");
    expect(view.variantCount).toBe(2);
    expect(emitted.at(-1)).toEqual({ type: "variantSelected", chatId, messageId, view });

    const err = await edit
      .selectVariant({ principal: principal(host), chatId, messageId, variantId: other.variantId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
  });
});

describe("D46 runtime plane — swipe-clobber rewind (ST #3263)", () => {
  const setX = (v: string): VarOp[] => [{ op: "set", key: "hp", value: v }];

  /** Read the chat's materialized runtime cache. */
  async function runtimeCache(chatId: string): Promise<Record<string, string> | null> {
    const [row] = await db
      .select({ runtimeVariables: chats.runtimeVariables })
      .from(chats)
      .where(eq(chats.id, castId(chatId)));
    return row?.runtimeVariables ?? null;
  }

  test("selecting an alternate variant re-folds the cache — a played setvar rewinds", async () => {
    const { host, chatId, charA } = await seedRoom();
    // A committed turn whose SELECTED variant set X=1 (the delta persisted on the variant).
    const { messageId, variantId: v0 } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "X is now 1",
    });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("1") })
      .where(eq(messageVariants.id, v0));
    // Simulate the prior commit's materialized cache (what a real turn would have folded).
    await db
      .update(chats)
      .set({ runtimeVariables: { hp: "1" } })
      .where(eq(chats.id, chatId));

    // An ALTERNATE swipe that set nothing (empty delta) — the classic swipe target.
    const v1 = await addVariant(db, messageId, 1, "nothing about X");
    await db.update(messageVariants).set({ variableDelta: [] }).where(eq(messageVariants.id, v1));

    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    // Swipe to v1 → X REWINDS (the fold of the new selected chain has no X). ST #3263 cannot occur.
    await edit.selectVariant({ principal: principal(host), chatId, messageId, variantId: v1 });
    expect(await runtimeCache(chatId)).toBeNull();

    // Swipe BACK to v0 → X returns (re-fold, not a clobber).
    await edit.selectVariant({ principal: principal(host), chatId, messageId, variantId: v0 });
    expect(await runtimeCache(chatId)).toEqual({ hp: "1" });
  });

  test("deleteMessages re-folds the cache over the remaining chain", async () => {
    const { host, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("1") })
      .where(eq(messageVariants.id, a.variantId));
    const b = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("2") })
      .where(eq(messageVariants.id, b.variantId));
    await db
      .update(chats)
      .set({ runtimeVariables: { hp: "2" } })
      .where(eq(chats.id, chatId));

    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });
    // Delete the later message → the fold rewinds to the earlier delta (X=1).
    await edit.deleteMessages({ principal: principal(host), chatId, messageIds: [b.messageId] });
    expect(await runtimeCache(chatId)).toEqual({ hp: "1" });
  });
});

describe("setMessageHidden / editReasoning / clearReasoning", () => {
  test("setMessageHidden toggles excludedFromPrompt (the row survives)", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const view = await edit.setMessageHidden({
      principal: principal(host),
      chatId,
      messageId,
      hidden: true,
    });
    expect(view.excludedFromPrompt).toBe(true);
    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.excludedFromPrompt).toBe(true);
    // The dedicated carrier (PD-86) — not the messageEdited fallback.
    expect(emitted.at(-1)).toEqual({ type: "messageHidden", chatId, messageId, view });
  });

  test("editReasoning sets, clearReasoning nulls, the variant's reasoning", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId, variantId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const edited = await edit.editReasoning({
      principal: principal(host),
      chatId,
      messageId,
      reasoning: "because",
    });
    expect(edited.reasoning).toBe("because");
    expect(emitted.at(-1)?.type).toBe("reasoningEdited");

    const cleared = await edit.clearReasoning({ principal: principal(host), chatId, messageId });
    expect(cleared.reasoning).toBeNull();
    expect(emitted.at(-1)?.type).toBe("reasoningCleared");
    const [v] = await db.select().from(messageVariants).where(eq(messageVariants.id, variantId));
    expect(v?.reasoning).toBeNull();
  });
});

describe("deleteMessages — bulk, author-or-host, FK cascade", () => {
  test("the host deletes a set; variants cascade; emits messagesDeleted", async () => {
    const { host, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const b = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.deleteMessages({
      principal: principal(host),
      chatId,
      messageIds: [a.messageId, b.messageId],
    });

    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(0);
    const variants = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.id, a.variantId));
    expect(variants).toHaveLength(0); // FK CASCADE
    expect(emitted).toEqual([
      { type: "messagesDeleted", chatId, messageIds: [a.messageId, b.messageId] },
    ]);
  });

  test("a member cannot delete another member's slot (not_author)", async () => {
    const { member, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const err = await edit
      .deleteMessages({ principal: principal(member), chatId, messageIds: [a.messageId] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");
  });

  test("a successful delete writes the chat.deleteMessages audit row; a refused one writes none", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const audits: AuditEntry[] = [];
    const edit = createEdit(
      makeChatContext(db, {
        audit: (entry): Promise<void> => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      { emit, resolveForeignInputs },
    );

    // Refused first (member ≠ author) — existence-before-audit: NO phantom row for a delete that never ran.
    await edit
      .deleteMessages({ principal: principal(member), chatId, messageIds: [a.messageId] })
      .catch((e: unknown) => e);
    expect(audits).toEqual([]);

    await edit.deleteMessages({ principal: principal(host), chatId, messageIds: [a.messageId] });
    expect(audits).toEqual([
      {
        actorUserId: host,
        action: "chat.deleteMessages",
        entityType: "chat",
        entityId: chatId,
        metadata: { messageIds: [a.messageId] },
      },
    ]);
  });
});

describe("canon-mutator stats deltas (stats.md — the delete/edit push)", () => {
  test("deleteMessages pushes the exact NEGATIVE contribution of each slot + swipe into its batch", async () => {
    const { host, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "three words here",
    });
    await addVariant(db, a.messageId, 1, "a swipe take");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      applyStatsDelta: (_batch, _db, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    await edit.deleteMessages({ principal: principal(host), chatId, messageIds: [a.messageId] });

    // One canon (selected-variant) delta + one swipe delta, both signed −1, attributed to the HOST.
    expect(deltas).toHaveLength(2);
    const canon = deltas.find((d) => d.assistantTurns !== undefined && d.assistantTurns !== 0);
    const swipe = deltas.find((d) => d.swipes !== undefined && d.swipes !== 0);
    expect(canon?.ownerId).toBe(host);
    expect(canon?.characterId).toBe(charA);
    expect(canon?.assistantTurns).toBe(-1);
    expect(canon?.assistantWords).toBe(-3);
    expect(canon?.contentBytes).toBe(-"three words here".length);
    expect(swipe?.swipes).toBe(-1);
    expect(swipe?.swipeWords).toBe(-3);
  });

  test("editMessage pushes the NET word/byte diff bucketed on the slot's original day", async () => {
    const { member, chatId } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "one two",
    });
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      applyStatsDelta: (_batch, _db, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const edit = createEdit(ctx, { emit, resolveForeignInputs });

    await edit.editMessage({
      principal: principal(member),
      chatId,
      messageId,
      content: "one two three four",
    });

    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.userWords).toBe(2); // 4 − 2
    expect(deltas[0]?.assistantWords).toBe(0);
    expect(deltas[0]?.contentBytes).toBe("one two three four".length - "one two".length);
    expect(deltas[0]?.characterId).toBeNull(); // per-char grain is assistant-only
  });
});

// ── The drift gate (stats inv #3): a canon-mutator verb's LIVE delta, applied on top of a reconciled
// baseline, must leave the four rollups byte-identical to a full `reconcileStats` over the POST-mutation
// canon — proving live == rebuild on the ADDITIVE columns (words/tokens/cost/swipes/counts). Extrema
// (`firstChatAt`/`lastActivityAt`/`maxContextTokens`) + bookkeeping (`id`/`computedAt`) are stripped — a
// subtracted extremum can't be retracted live (it re-floats + settles on the next reconcile, stats-delta.ts).
const NON_ADDITIVE = new Set([
  "id",
  "computedAt",
  "firstChatAt",
  "lastActivityAt",
  "maxContextTokens",
]);

/** Strip the non-additive/bookkeeping columns so the two writers are compared over the DATA they compute. */
function strip(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !NON_ADDITIVE.has(k)));
}

interface RollupSnapshot {
  owner: Record<string, unknown> | null;
  chars: Record<string, unknown>[];
  days: Record<string, unknown>[];
  models: Record<string, unknown>[];
}

/** Read + normalize the four rollup tables for `owner` (sorted so the comparison is order-independent). */
async function snapshotRollups(database: Db, owner: UserId): Promise<RollupSnapshot> {
  const [ownerRow] = await database.select().from(ownerStats).where(eq(ownerStats.ownerId, owner));
  const chars = await database.select().from(characterStats);
  const days = await database.select().from(dailyStats).where(eq(dailyStats.ownerId, owner));
  const models = await database.select().from(modelStats).where(eq(modelStats.ownerId, owner));
  const byKey =
    (key: string) =>
    (a: Record<string, unknown>, b: Record<string, unknown>): number =>
      String(a[key]).localeCompare(String(b[key]));
  return {
    owner: ownerRow ? strip(ownerRow) : null,
    chars: chars.map(strip).sort(byKey("characterId")),
    days: days.map(strip).sort(byKey("day")),
    models: models.map(strip).sort(byKey("model")),
  };
}

/** A stats ctx whose `applyStatsDelta` BOTH records the pushed deltas AND applies them for real (so the
 *  rollups actually land in the batch the verb commits — the live half of the drift comparison). */
function recordingStatsCtx(database: Db, sink: StatsDelta[]): ReturnType<typeof makeChatContext> {
  return makeChatContext(database, {
    applyStatsDelta: (batch, deltaDb, delta) => {
      sink.push(delta as StatsDelta);
      applyStatsDelta(batch as BatchStmt[], deltaDb, delta);
    },
  });
}

describe("canon-mutator stats drift gate (live delta == a reconcile over the resulting canon)", () => {
  const clock = { now: () => FROZEN_AT };

  test("selectVariant — the 4-part swap keeps the rollups drift-free (cost/cache follow the selection)", async () => {
    const { host, chatId, charA } = await seedRoom();
    // v0 = the SELECTED variant (modest economics); v1 = a sibling swipe with LARGER economics + a bigger
    // context window (distinct so a wrong/absent swap would visibly drift cost/cache/tokens/idx).
    const { messageId, variantId: v0 } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "small selected take",
    });
    await db
      .update(messageVariants)
      .set({
        model: "gpt",
        provider: "openrouter",
        tokensIn: 10,
        tokensOut: 20,
        costUsd: 0.5,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        contextWindow: 1000,
        genStartedAt: FROZEN_AT,
        genFinishedAt: FROZEN_AT + 100,
        reasoning: "hmm",
      })
      .where(eq(messageVariants.id, v0));
    const v1 = await addVariant(db, messageId, 1, "a much larger alternative body here");
    await db
      .update(messageVariants)
      .set({
        model: "gpt",
        provider: "openrouter",
        tokensIn: 100,
        tokensOut: 200,
        costUsd: 5,
        cacheReadTokens: 50,
        cacheWriteTokens: 30,
        contextWindow: 2000,
        genStartedAt: FROZEN_AT,
        genFinishedAt: FROZEN_AT + 300,
        reasoning: "big think",
      })
      .where(eq(messageVariants.id, v1));

    const deltas: StatsDelta[] = [];
    const edit = createEdit(recordingStatsCtx(db, deltas), { emit, resolveForeignInputs });

    // Baseline: reconcile the PRE-flip canon (v0 selected) into the rollups.
    await reconcileStats(db, { ownerId: host, now: clock.now });
    // Flip v0 → v1: the live path applies the signed swap on top of the baseline.
    await edit.selectVariant({ principal: principal(host), chatId, messageId, variantId: v1 });

    // Composition: −old-as-message, +old-as-swipe, −new-as-swipe, +new-as-message (all host-attributed).
    expect(deltas).toHaveLength(4);
    expect(deltas.every((d) => d.ownerId === host)).toBe(true);
    const live = await snapshotRollups(db, host);

    // Reconcile the POST-flip canon (a per-owner REPLACE) and assert the live rollups already matched it.
    await reconcileStats(db, { ownerId: host, now: clock.now });
    expect(live).toEqual(await snapshotRollups(db, host));

    // Guard against a false green from two empties: the message stream now credits v1's economics + idx 1.
    expect(live.owner).toMatchObject({
      assistantTurns: 1,
      costUsd: 5,
      cacheReadTokens: 50,
      activeIdxSum: 1,
    });
  });

  test("duplicateMessage — the copied-economics delta keeps the rollups drift-free (dup double-counts, live == rebuild)", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId, variantId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "copy me two words",
    });
    await db
      .update(messageVariants)
      .set({
        model: "gpt",
        provider: "openrouter",
        tokensIn: 12,
        tokensOut: 34,
        costUsd: 1.5,
        cacheReadTokens: 6,
        cacheWriteTokens: 4,
        contextWindow: 900,
        reasoning: "r",
      })
      .where(eq(messageVariants.id, variantId));

    const deltas: StatsDelta[] = [];
    const edit = createEdit(recordingStatsCtx(db, deltas), { emit, resolveForeignInputs });

    await reconcileStats(db, { ownerId: host, now: clock.now });
    await edit.duplicateMessage({ principal: principal(host), chatId, messageId });

    // One +1 canonMessageDelta carrying the COPIED economics (the rebuild folds the copy identically).
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.assistantTurns).toBe(1);
    expect(deltas[0]?.costUsd).toBe(1.5);
    const live = await snapshotRollups(db, host);

    await reconcileStats(db, { ownerId: host, now: clock.now });
    expect(live).toEqual(await snapshotRollups(db, host));

    // Guard: the dup DOUBLED the source's contribution (source + copy) — and live agrees with the rebuild.
    expect(live.owner).toMatchObject({ assistantTurns: 2, costUsd: 3 });
  });
});

describe("moveMessage — host-only re-sequence", () => {
  test("moving the head to the tail re-stamps the affected block", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    const m1 = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "one",
    });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "two" });
    await seedMessage(db, chatId, 3, { role: "assistant", characterId: charA, content: "three" });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.moveMessage({
      principal: principal(host),
      chatId,
      messageId: m1.messageId,
      toSeq: 3,
    });

    const ordered = await db
      .select({ id: messages.id, seq: messages.seq, content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.seq));
    expect(ordered.map((r) => r.content)).toEqual(["two", "three", "one"]);
    expect(emitted.at(-1)).toEqual({ type: "messagesReordered", chatId });
  });

  test("a MID move re-stamps ONLY the block; trailing rows keep their seq VALUES (F2 — no stranding)", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    // [id1@1, id2@2, id3@3, id4@4, id5@5]; move id2 → toSeq 4 (a mid move, id5 trails the block).
    const m1 = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "1",
    });
    const m2 = await seedMessage(db, chatId, 2, {
      role: "user",
      authorUserId: member,
      content: "2",
    });
    await seedMessage(db, chatId, 3, { role: "assistant", characterId: charA, content: "3" });
    await seedMessage(db, chatId, 4, { role: "assistant", characterId: charA, content: "4" });
    await seedMessage(db, chatId, 5, { role: "assistant", characterId: charA, content: "5" });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.moveMessage({
      principal: principal(host),
      chatId,
      messageId: m2.messageId,
      toSeq: 4,
    });

    const ordered = await db
      .select({ id: messages.id, seq: messages.seq, content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.seq));
    // The moved order is [1,3,4,2,5] AND the seq values stay tight 1..5 — id5 is NOT stranded (was seq 11),
    // and maxSeq is unchanged outside the block (the verb's own documented invariant, edit.ts:482-484).
    expect(ordered.map((r) => r.content)).toEqual(["1", "3", "4", "2", "5"]);
    expect(ordered.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    // id1 (below the block) and id5 (above the block) keep their ORIGINAL seq values — only the block moved.
    expect(ordered.find((r) => r.id === m1.messageId)?.seq).toBe(1);
    expect(ordered.at(-1)?.content).toBe("5");
    expect(ordered.at(-1)?.seq).toBe(5);
  });

  test("a reorder re-folds runtime_variables over the NEW order (F3 — D46 later-op-wins)", async () => {
    const { host, chatId, charA } = await seedRoom();
    // A@seq2 sets hp=10; B@seq3 sets hp=20 → the later op (B) wins → cache hp=20.
    const a = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: charA,
      content: "A",
    });
    await db
      .update(messageVariants)
      .set({ variableDelta: [{ op: "set", key: "hp", value: "10" }] })
      .where(eq(messageVariants.id, a.variantId));
    const b = await seedMessage(db, chatId, 3, {
      role: "assistant",
      characterId: charA,
      content: "B",
    });
    await db
      .update(messageVariants)
      .set({ variableDelta: [{ op: "set", key: "hp", value: "20" }] })
      .where(eq(messageVariants.id, b.variantId));
    await db
      .update(chats)
      .set({ runtimeVariables: { hp: "20" } })
      .where(eq(chats.id, chatId));
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    // Move B before A (B → seq 2, A → seq 3): now A is the LATER op → the fold flips to hp=10.
    await edit.moveMessage({
      principal: principal(host),
      chatId,
      messageId: b.messageId,
      toSeq: 2,
    });

    const [row] = await db
      .select({ runtimeVariables: chats.runtimeVariables })
      .from(chats)
      .where(eq(chats.id, chatId));
    expect(row?.runtimeVariables).toEqual({ hp: "10" });
  });

  test("a member is refused (not_host)", async () => {
    const { member, chatId } = await seedRoom();
    const m1 = await seedMessage(db, chatId, 1, { role: "user", authorUserId: member });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });
    const err = await edit
      .moveMessage({ principal: principal(member), chatId, messageId: m1.messageId, toSeq: 2 })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("duplicateMessage / reattributeMessages", () => {
  test("duplicateMessage copies the slot + selected variant to a new tail; the original is intact", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "echo",
    });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const dup = await edit.duplicateMessage({ principal: principal(host), chatId, messageId });
    expect(dup.content).toBe("echo");
    expect(dup.seq).toBe(2);
    expect(dup.id).not.toBe(messageId);
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(2);
    expect(emitted.at(-1)?.type).toBe("messageCommitted");
  });

  test("reattributeMessages (host) re-stamps the characterId", async () => {
    const { host, chatId, charA } = await seedRoom();
    const charB = await seedCharacter(db, host, "borg");
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.reattributeMessages({
      principal: principal(host),
      chatId,
      messageIds: [a.messageId],
      characterId: charB,
    });

    const [row] = await db.select().from(messages).where(eq(messages.id, a.messageId));
    expect(row?.characterId).toBe(charB);
    expect(emitted.at(-1)?.type).toBe("messageEdited");
  });
});

describe("reattributePersona — author-or-host per row; re-stamp USER slots' personaId (§5)", () => {
  /** Seed a user message authored by `author`, stamped `opts.personaId` (default null), at `seq`. */
  function seedUserMsg(
    chatId: Awaited<ReturnType<typeof seedChat>>,
    seq: number,
    author: UserId,
    opts: { personaId?: PersonaId | null; content?: string } = {},
  ): ReturnType<typeof seedMessage> {
    return seedMessage(db, chatId, seq, {
      role: "user",
      authorUserId: author,
      personaId: opts.personaId ?? null,
      content: opts.content ?? "{{user}} waves",
    });
  }

  test("the author re-stamps their OWN user message: personaId updated + messageEdited emitted", async () => {
    const { member, chatId } = await seedRoom();
    const persona = await seedPersona(db, member, "mara");
    const { messageId } = await seedUserMsg(chatId, 1, member);
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.reattributePersona({
      principal: principal(member),
      chatId,
      messageIds: [messageId],
      personaId: persona,
    });

    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.personaId).toBe(persona);
    const last = emitted.at(-1);
    expect(last?.type).toBe("messageEdited");
    expect(last?.type === "messageEdited" && last.view?.personaId).toBe(persona);
  });

  test("the host re-stamps ANOTHER member's message to a persona that MEMBER owns", async () => {
    const { host, member, chatId } = await seedRoom();
    const persona = await seedPersona(db, member, "mara"); // owned by the MEMBER (the row's author)
    const { messageId } = await seedUserMsg(chatId, 1, member);
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.reattributePersona({
      principal: principal(host),
      chatId,
      messageIds: [messageId],
      personaId: persona,
    });

    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.personaId).toBe(persona);
  });

  test("a non-author, non-host member is refused with not_author (host may re-stamp)", async () => {
    const { member, chatId } = await seedRoom();
    const other = await seedUser(db, "other");
    await seedParticipant(db, { chatId, key: "o", userId: other, role: "member" });
    const persona = await seedPersona(db, member, "mara");
    const { messageId } = await seedUserMsg(chatId, 1, member); // authored by `member`
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const err = await edit
      .reattributePersona({
        principal: principal(other), // neither author nor host
        chatId,
        messageIds: [messageId],
        personaId: persona,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");
    // no write landed
    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.personaId).toBeNull();
  });

  test("the ownership belt: a persona NOT owned by the row's author is refused (even for the host)", async () => {
    const { host, member, chatId } = await seedRoom();
    const hostPersona = await seedPersona(db, host, "hostpersona"); // owned by the HOST, not the author
    const { messageId } = await seedUserMsg(chatId, 1, member);
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const err = await edit
      .reattributePersona({
        principal: principal(host), // host clears the author-or-host gate…
        chatId,
        messageIds: [messageId],
        personaId: hostPersona, // …but the persona isn't the AUTHOR's
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_persona_owner");
    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.personaId).toBeNull();
  });

  test("user-rows-only: targeting an assistant row is refused with not_user_message (nothing written)", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    const persona = await seedPersona(db, member, "mara");
    const asst = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    const err = await edit
      .reattributePersona({
        principal: principal(host),
        chatId,
        messageIds: [asst.messageId],
        personaId: persona,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_user_message");
    const [row] = await db.select().from(messages).where(eq(messages.id, asst.messageId));
    expect(row?.personaId).toBeNull();
  });

  test("bulk: N user-row ids → exactly N messageEdited events, each carrying the new personaId", async () => {
    const { member, chatId } = await seedRoom();
    const persona = await seedPersona(db, member, "mara");
    const m1 = await seedUserMsg(chatId, 1, member);
    const m2 = await seedUserMsg(chatId, 2, member);
    const m3 = await seedUserMsg(chatId, 3, member);
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.reattributePersona({
      principal: principal(member),
      chatId,
      messageIds: [m1.messageId, m2.messageId, m3.messageId],
      personaId: persona,
    });

    const edits = emitted.filter((e) => e.type === "messageEdited");
    expect(edits).toHaveLength(3);
    expect(edits.every((e) => e.type === "messageEdited" && e.view?.personaId === persona)).toBe(
      true,
    );
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows.every((r) => r.personaId === persona)).toBe(true);
  });

  test("an empty messageIds set is an idempotent no-op (no event, no write)", async () => {
    const { member, chatId } = await seedRoom();
    const persona = await seedPersona(db, member, "mara");
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    await edit.reattributePersona({
      principal: principal(member),
      chatId,
      messageIds: [],
      personaId: persona,
    });
    expect(emitted).toHaveLength(0);
  });

  // ── C5 (#59 §6 parity lock), server side: after the stamp flips, the SAME kit atom re-resolves {{user}} ──
  test("C5 server: reattributePersona flips the stamp → resolveRowMacros renders the NEW persona for {{user}}", async () => {
    const { member, chatId } = await seedRoom();
    const mara = await seedPersona(db, member, "mara");
    const zara = await seedPersona(db, member, "zara");
    const { messageId } = await seedUserMsg(chatId, 1, member, {
      personaId: mara,
      content: "{{user}} waves",
    });
    const edit = createEdit(makeChatContext(db), { emit, resolveForeignInputs });

    // The per-chat name producer (Chat-Macro-Resolution §1) covering both personas.
    const personaNamesById = new Map<PersonaId, RowPersonaName>([
      [mara, { name: "Mara", description: "" }],
      [zara, { name: "Zara", description: "" }],
    ]);
    const ctx = {
      characterNamesById: new Map<CharacterId, RowCharacterName>(),
      personaNamesById,
    };

    // Before: the row is stamped Mara → {{user}} resolves to Mara.
    const before = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(
      resolveRowMacros(
        "{{user}} waves",
        { characterId: null, personaId: before[0]?.personaId ?? null },
        ctx,
      ),
    ).toBe("Mara waves");

    await edit.reattributePersona({
      principal: principal(member),
      chatId,
      messageIds: [messageId],
      personaId: zara,
    });

    // After: the SAME atom, fed the row's NEW stamp, renders Zara — the storage stayed the literal macro.
    const after = await db
      .select()
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.id, messageId));
    expect(after[0]?.message_variants.content).toBe("{{user}} waves"); // RAW storage untouched (D51)
    expect(
      resolveRowMacros(
        "{{user}} waves",
        { characterId: null, personaId: after[0]?.messages.personaId ?? null },
        ctx,
      ),
    ).toBe("Zara waves");
  });
});
