// `forkChat` (D27 — a fork is a DEEP COPY into a new membership-scoped chat; the only link is `parentChatId`;
// NO shared rows). Proves against a real libSQL db: the new chat has a fresh id + `parentChatId` lineage, the
// canon is copied with FRESH message/variant ids (mutating the fork leaves the source untouched), the FORKER
// becomes host while other humans are NOT auto-joined (D16 chokepoint — FLAG[fork-humans]), and `chatCreated`
// fires. Reached through the BUNDLE `createFork(ctx, { emit, loadParticipantViews })`.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characters, chatInjections, chats, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { and, asc, eq, getTableColumns } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { ChatContext, ForkGameArgs } from "../../../../../packages/server/src/domain/chat/index.ts";
import { createFork } from "../../../../../packages/server/src/domain/chat/verbs/fork.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import {
  addVariant,
  makeChatContext,
  makeLoadParticipantViews,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedPersona,
  seedUser,
} from "../_support.ts";

let db: Db;
let emitted: ChatBusEvent[];
let loadParticipantViews: ReturnType<typeof makeLoadParticipantViews>;

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
  loadParticipantViews = makeLoadParticipantViews(db);
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** An owner-scoped `getCard` fake mirroring the REAL one (D28 — `loadOwnedCharacterRow`): the card resolves
 *  only for its OWNER, `null` for a non-owner. The fork character-drop resolver (D64 / F4) calls this per seated
 *  character to decide which seats the forker doesn't own (→ dropped); the harness default is a bare `null`. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    if (row === undefined || row.ownerId !== ownerId) {
      return null;
    }
    // The D64 resolver reads only null-vs-resolved; `characterParticipantView` reads only name/avatarAssetId.
    // @orb-waive no-test-fabrication(unknown): minimal `CharacterCard` double (scenario.ts precedent). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    return { name: row.name, avatarAssetId: null } as unknown as CharacterCard;
  };
}

// ── THE PER-COLUMN FORK CLASSIFICATION (the census table its tests read) ────────────────────────────────
/** What the fork copy must do with ONE `message_variants` column (see the census `describe` for the law):
 *  `remapped` = a fresh id / a pointer through the fork's id maps, never equal to the source value ·
 *  `member-projected` = prose the §3.6 strips transform for a non-host forker (the hidden-span body strip /
 *  the P3 reasoning cut — the census seeds hidden-free bytes on a NON-deception game, where both strips are
 *  identity, and the transforms themselves are proven by the dedicated §3.6 tests) · `host-plane` = readable
 *  ONLY behind a host gate, so NULL for a non-host forker and verbatim for a host · `copied` = already
 *  member-readable in the source room, so verbatim for every forker. */
const FORK_COLUMN_CLASSES = ["remapped", "member-projected", "host-plane", "copied"] as const;
type ForkColumnClass = (typeof FORK_COLUMN_CLASSES)[number];

/** EVERY `message_variants` column, classified — the behavioral twin of `forkVariantValues`'s `tsc` ratchet.
 *  `satisfies Record<keyof …$inferSelect, …>` makes a NEW column a compile error here too, and the census
 *  test cross-checks it against the LIVE drizzle table so neither side can rot alone. */
const FORK_COLUMN_CLASS = {
  id: "remapped",
  messageId: "remapped",
  contextBoundaryMessageId: "remapped",
  content: "member-projected",
  preContinueContent: "member-projected",
  lastContinuationContent: "member-projected",
  reasoning: "member-projected",
  preContinueReasoning: "member-projected",
  lastContinuationReasoning: "member-projected",
  // The replayable reasoning blocks (audit A1) carry the thinking prose too — the same P3 cut as `reasoning`.
  reasoningParts: "member-projected",
  // The host-gated variant-wire trio (`loadVariantWire`) + the two HOST-PLANE provenance columns.
  promptSnapshot: "host-plane",
  params: "host-plane",
  macroDraws: "host-plane",
  rawContent: "host-plane",
  macroFreezes: "host-plane",
  // On the member-visible `MessageView` (economics readout / tool chips / the cost key) …
  idx: "copied",
  model: "copied",
  provider: "copied",
  tokensIn: "copied",
  tokensOut: "copied",
  tokenProvenance: "copied",
  // Attribution (§5.3b): which connection wrote the swipe + where its cost figure came from — an id and a
  // provenance word beside `provider`/`model`, member-readable on the same readout.
  connectionId: "copied",
  costProvenance: "copied",
  cacheReadTokens: "copied",
  cacheWriteTokens: "copied",
  // The reasoning-token count and the cost breakdown (inference audit B5/B8) — economics numbers beside the two above.
  reasoningTokens: "copied",
  costUsd: "copied",
  costDetails: "copied",
  contextWindow: "copied",
  ttftMs: "copied",
  finishReason: "copied",
  stopReason: "copied",
  terminalReason: "copied",
  genStartedAt: "copied",
  genFinishedAt: "copied",
  generationId: "copied",
  toolCalls: "copied",
  createdAt: "copied",
  // … and the off-view but prose-free / member-derivable rest: scalar knobs + diagnostics
  // (`reasoningEffort`/`maxOutputTokens`/`apiErrorStatus`), the variable op-log whose fold a member reads
  // unclamped through the member-gated `getVariables`, and the stats-only `reasoning_duration` sidecar.
  reasoningEffort: "copied",
  maxOutputTokens: "copied",
  apiErrorStatus: "copied",
  variableDelta: "copied",
  metadata: "copied",
} as const satisfies Record<keyof typeof messageVariants.$inferSelect, ForkColumnClass>;

/** Compare a COPIED variant row against its source per {@link FORK_COLUMN_CLASS}, ACCUMULATING every offender
 *  (a per-column `expect` stops at the first, hiding the rest of a multi-column regression). `leaked` =
 *  host-plane bytes that crossed the boundary / a stale un-remapped id; `dropped` = a member-readable column
 *  the copy lost. On the HOST arm every class but `remapped` must copy verbatim (a host already reads it all). */
function censusMismatches(
  src: typeof messageVariants.$inferSelect,
  copy: typeof messageVariants.$inferSelect,
  arm: "host" | "non-host",
): { leaked: string[]; dropped: string[] } {
  const leaked: string[] = [];
  const dropped: string[] = [];
  for (const [column, klass] of Object.entries(FORK_COLUMN_CLASS)) {
    const key = column as keyof typeof messageVariants.$inferSelect;
    if (klass === "remapped") {
      if (copy[key] === src[key]) {
        leaked.push(`${column} (stale source id)`);
      }
    } else if (klass === "host-plane" && arm === "non-host") {
      if (copy[key] !== null) {
        leaked.push(column);
      }
    } else if (JSON.stringify(copy[key]) !== JSON.stringify(src[key])) {
      dropped.push(column);
    }
  }
  return { leaked, dropped };
}

describe("forkChat — canon-mutator stats push (stats.md)", () => {
  test("a fork pushes chat-created + every copied slot/swipe contribution into its creation batch", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "one two" });
    const m2 = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: charA,
      content: "three",
    });
    await addVariant(db, m2.messageId, 1, "a swipe");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      getCard: ownedCard(),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const fork = createFork(ctx, { emit, loadParticipantViews });

    await fork.forkChat({ principal: principal(host), chatId });

    // chat-created (+fork lineage) + 2 copied slots + 1 copied swipe = 4 deltas, all positive.
    expect(deltas).toHaveLength(4);
    const created = deltas.find((d) => d.chats === 1);
    expect(created?.forkedChats).toBe(1);
    expect(created?.chatsCreated).toBe(1);
    expect(deltas.filter((d) => d.userTurns === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.assistantTurns === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.swipes === 1)).toHaveLength(1);
    expect(new Set(deltas.map((d) => d.ownerId))).toEqual(new Set([host]));
  });

  // #1147 — A FORK IS A NEW ROOM FOR EVERY SEAT IT COPIES. The rebuild credits the forked chat to each of
  // its character participants, so a two-character source room must leave two census bumps and two
  // character fork counters behind — while the OWNER's library still gains exactly ONE room. Counting only
  // the primary seat is how a seated-second character reads 0 chats on every Analytics surface.
  test("a MULTI-SEAT fork counts the new room for every copied seat, and once for the owner", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const charB = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "ca", characterId: charA });
    await seedParticipant(db, { chatId, key: "cb", characterId: charB });
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      getCard: ownedCard(),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const fork = createFork(ctx, { emit, loadParticipantViews });

    await fork.forkChat({ principal: principal(host), chatId });

    // Each seat is credited the room exactly once…
    expect(deltas.filter((d) => d.characterChats === 1).map((d) => d.characterId)).toEqual([charA, charB]);
    expect(deltas.filter((d) => d.characterForkedChats === 1)).toHaveLength(2);
    // …and the owner's library counts the ONE new room, once, on the primary seat's head delta.
    expect(deltas.filter((d) => d.chats === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.forkedChats === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.chatsCreated === 1)).toHaveLength(1);
  });
});

describe("forkChat — D27 deep copy", () => {
  test("a carried asset background that GC already won cannot land on the fork", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const missingAssetId = mintTypeId(ID_PREFIX.asset);
    const chatId = await seedChat(db, "stale-background", {
      metadata: {
        background: {
          kind: "asset",
          externalUrl: "",
          assetId: missingAssetId,
          assetHash: "gone",
          mime: "image/png",
          provenanceUrl: "",
        },
      },
    });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });

    const err = await fork.forkChat({ principal: principal(host), chatId }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("background_unavailable");
    expect(await db.select().from(chats)).toHaveLength(1);
    expect(emitted).toEqual([]);
  });

  test("the host forks a multi-human room: parented, canon copied with fresh ids, the OTHER human is not copied", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    // The HOST forks (fork gate: a multi-human room is host-only). The host OWNS the characters — the F4
    // character-ownership guard requires the new host to own every seated card.
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    const m1 = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: host,
      content: "one",
    });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "two" });
    await db.insert(chatInjections).values({
      id: castId("chat_injection_src"),
      chatId,
      position: "in_prompt",
      depth: 0,
      role: "system",
      content: "note",
      createdAt: 1,
    });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });

    expect(chat.parentChatId).toBe(chatId);
    expect(chat.id).not.toBe(chatId);
    expect(emitted).toEqual([{ type: "chatCreated", chatId: chat.id }]);

    // The forker is HOST of the fork; the characters copied as members; the OTHER human is NOT copied (FLAG[fork-humans]).
    const host2 = chat.participants.find((p) => p.role === "host");
    expect(host2?.userId).toBe(host);
    expect(chat.participants.some((p) => p.characterId === charA)).toBe(true);
    expect(chat.participants.some((p) => p.userId === member)).toBe(false);

    // The canon copied with FRESH ids (no shared rows), content preserved.
    const forkMsgs = await db
      .select({ id: messages.id, seq: messages.seq, content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chat.id))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["one", "two"]);
    expect(forkMsgs.some((r) => r.id === m1.messageId)).toBe(false);

    const forkInjections = await db.select().from(chatInjections).where(eq(chatInjections.chatId, chat.id));
    expect(forkInjections).toHaveLength(1);
    expect(forkInjections[0]?.content).toBe("note");
    expect(forkInjections[0]?.id).not.toBe("chat_injection_src");
  });

  test("mutating the fork leaves the source canon untouched (no shared rows)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    const src = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "original",
    });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });

    // Edit the fork's copied variant directly; the source's variant must NOT change.
    const [forkMsg] = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    await db
      .update(messageVariants)
      .set({ content: "mutated" })
      .where(eq(messageVariants.id, forkMsg?.selectedVariantId ?? castId("x")));

    const [srcVariant] = await db.select().from(messageVariants).where(eq(messageVariants.id, src.variantId));
    expect(srcVariant?.content).toBe("original");
  });

  test("throughSeq truncates the copy at the fork point", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "kept" });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "trimmed" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId, throughSeq: 1 });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chat.id));
    expect(forkMsgs.map((r) => r.content)).toEqual(["kept"]);
  });

  test("D46: a fork carries config picks + REFOLDS the runtime cache from the copied chain", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    // Config plane: the stored ChoiceBlock picks (carried verbatim on fork).
    await db
      .update(chats)
      .set({ variableValues: { pov: "first" } })
      .where(eq(chats.id, chatId));
    // Runtime plane: two committed turns' deltas (X=1 then X=2) — the fork must re-fold, not copy the cache blob.
    const setX = (v: string): VarOp[] => [{ op: "set", key: "hp", value: v }];
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

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });

    const [forkRow] = await db
      .select({ variableValues: chats.variableValues, runtimeVariables: chats.runtimeVariables })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    expect(forkRow?.variableValues).toEqual({ pov: "first" });
    expect(forkRow?.runtimeVariables).toEqual({ hp: "2" });
  });

  test("D46: a TRUNCATED fork re-folds only the kept chain (not the source's full cache)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    const setX = (v: string): VarOp[] => [{ op: "set", key: "hp", value: v }];
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

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId, throughSeq: 1 });

    const [forkRow] = await db
      .select({ runtimeVariables: chats.runtimeVariables })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    // Only seq 1 was copied → the fork's cache re-folds to X=1, NOT the source's X=2.
    expect(forkRow?.runtimeVariables).toEqual({ hp: "1" });
  });
});

describe("forkChat — D64 character-drop on a non-owner fork (F4/PD-21 ruling)", () => {
  test("a non-owner fork SUCCEEDS: it drops the un-owned character seats, keeps the forker's characters + the whole history", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    // Single-owner characters (D28): aria belongs to another user (the source's departed host), bella to the FORKER.
    // The forking member is the SOLE present human (fork allowed via the solo arm), and is a non-host, so the
    // character-drop ruling applies: they resolve bella but NOT aria → keep bella's seat, drop aria's; canon whole.
    const aria = await seedCharacter(db, host, "aria");
    const bella = await seedCharacter(db, member, "bella");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "ca", characterId: aria });
    await seedParticipant(db, { chatId, key: "cb", characterId: bella });
    await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: aria,
      content: "from aria",
    });
    await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: bella,
      content: "from bella",
    });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    // The fork exists (the ruling: succeed, don't refuse), the forker is host.
    expect(chat.parentChatId).toBe(chatId);
    expect(emitted).toContainEqual({ type: "chatCreated", chatId: chat.id });
    expect(chat.participants.find((p) => p.role === "host")?.userId).toBe(member);
    // The forker's own character seat is KEPT; the un-owned seat is DROPPED from the fork roster.
    expect(chat.participants.some((p) => p.characterId === bella)).toBe(true);
    expect(chat.participants.some((p) => p.characterId === aria)).toBe(false);

    // History is copied WHOLE — even the dropped character's prior lines survive in the fork canon.
    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, castId(chat.id)))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["from aria", "from bella"]);
  });

  test("an OWNER forking their OWN chat is unchanged: every character seat is kept", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "hi" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });

    const { chat } = await fork.forkChat({ principal: principal(host), chatId });
    expect(chat.parentChatId).toBe(chatId);
    expect(chat.participants.some((p) => p.characterId === charA)).toBe(true);
    expect(emitted).toContainEqual({ type: "chatCreated", chatId: chat.id });
  });

  // The anchor arm of the same single-owner rule (stickler 2026-08-03 F2, the fork's latent twin): the fork's
  // host is the FORKER, and the D51 anchor resolves under the host's principal (owner-scoped `persona.get`).
  // Copying a foreign `anchorPersonaId` verbatim mints a room born with a dead POV pin — the knob serves an
  // unreadable id while `{{user}}` silently falls through to the active persona. Conditional, like the character
  // drop and the `resolveForkGmPreset` gate: keep what the forker can read, null what they cannot.
  test("a foreign anchor persona is NULLED on the fork; the forker's own anchor is carried", async () => {
    const host = await seedUser(db, castId<Handle>("anchor_host"));
    const member = await seedUser(db, castId<Handle>("anchor_member"));
    const hostAnchor = await seedPersona(db, host, "hostpov");
    const memberAnchor = await seedPersona(db, member, "memberpov");
    const foreignSrc = await seedChat(db, "anchor_foreign_src", { anchorPersonaId: hostAnchor });
    await seedParticipant(db, { chatId: foreignSrc, key: "fm", userId: member, role: "member" });
    const ownSrc = await seedChat(db, "anchor_own_src", { anchorPersonaId: memberAnchor });
    await seedParticipant(db, { chatId: ownSrc, key: "om", userId: member, role: "member" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const foreignFork = await fork.forkChat({ principal: principal(member), chatId: foreignSrc });
    const ownFork = await fork.forkChat({ principal: principal(member), chatId: ownSrc });

    const [foreignRow] = await db
      .select()
      .from(chats)
      .where(eq(chats.id, castId(foreignFork.chat.id)));
    expect(foreignRow?.anchorPersonaId).toBeNull();
    const [ownRow] = await db
      .select()
      .from(chats)
      .where(eq(chats.id, castId(ownFork.chat.id)));
    expect(ownRow?.anchorPersonaId).toBe(memberAnchor);
    // The SOURCE rooms are untouched — a fork never re-pins the room it copied from.
    const [srcRow] = await db.select().from(chats).where(eq(chats.id, foreignSrc));
    expect(srcRow?.anchorPersonaId).toBe(hostAnchor);
  });
});

// The D16 join-history floor on the FORK path. `forkChat` is matrix-classified `member`, and the fork is a
// deep COPY into a room where the forker is HOST — so an unfloored copy is a laundering bypass: a `from-join`
// member could fork the source and end up owning the very pre-join transcript `listMessages` withholds. The
// copy floor is the FORKER's own `historyFloorSeq`, resolved at the same chokepoint every read uses.
describe("forkChat — the D16 join-history floor (a fork must not launder pre-join canon)", () => {
  test("a from-join member's fork copies ONLY their own window; the source keeps everything", async () => {
    const host = await seedUser(db, castId<Handle>("jhf_host"));
    const member = await seedUser(db, castId<Handle>("jhf_member"));
    const chatId = await seedChat(db, "jhf_src");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join secret" });
    await seedMessage(db, chatId, 2, { role: "user", authorUserId: host, content: "more pre-join" });
    await seedMessage(db, chatId, 3, { role: "assistant", content: "after they joined" });
    // Redeemed at head 3 and RESTRICTED to `from-join` (the opt-in clamp; the column default is `full`). The
    // SOLE present human is this floored member (the host left without a handoff), so the fork is ALLOWED via
    // the solo arm — and the clamp still narrows the copy to their own window (the belt this test proves).
    await seedParticipant(db, { chatId, key: "jhf_m", userId: member, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, castId(chat.id)))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["after they joined"]);

    // The SOURCE room is untouched — the clamp narrows what the forker may carry, it never deletes canon.
    const srcMsgs = await db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId));
    expect(srcMsgs).toHaveLength(3);
  });

  test("a clamped forker does not carry the compaction checkpoint (it distills the rows their floor hid)", async () => {
    await seedUser(db, castId<Handle>("jhk_host"));
    const member = await seedUser(db, castId<Handle>("jhk_member"));
    const chatId = await seedChat(db, "jhk_src");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join secret" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "after they joined" });
    await db.update(chats).set({ compactSummary: "the pre-join story", compactedAtSeq: 1 }).where(eq(chats.id, chatId));
    // Sole present human = the floored member (host left, no handoff) ⇒ fork allowed via the solo arm; the
    // clamp still drops the checkpoint that distills the rows their floor hid.
    await seedParticipant(db, { chatId, key: "jhk_m", userId: member, role: "member", joinSeq: 2, joinHistoryVisibility: "from-join" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    const [forkRow] = await db
      .select({ summary: chats.compactSummary, at: chats.compactedAtSeq })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    expect(forkRow?.summary).toBeNull();
    expect(forkRow?.at).toBeNull();
  });

  test("a `full` member's fork is unchanged — the whole source canon + checkpoint carry", async () => {
    await seedUser(db, castId<Handle>("jhu_host"));
    const member = await seedUser(db, castId<Handle>("jhu_member"));
    const chatId = await seedChat(db, "jhu_src");
    await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join secret" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "after they joined" });
    await db.update(chats).set({ compactSummary: "the pre-join story", compactedAtSeq: 1 }).where(eq(chats.id, chatId));
    // Sole present human = this `full`-visibility member ⇒ fork allowed via the solo arm; `full` carries everything.
    await seedParticipant(db, { chatId, key: "jhu_m", userId: member, role: "member", joinSeq: 2, joinHistoryVisibility: "full" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, castId(chat.id)))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["pre-join secret", "after they joined"]);
    const [forkRow] = await db
      .select({ summary: chats.compactSummary })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    expect(forkRow?.summary).toBe("the pre-join story");
  });

  // D79 ruling #8 (F6) — THE FLOORED FORK'S VARIABLE CARRY. The runtime variable state is DERIVED by folding
  // the seq-ordered chain (slot deltas ∪ standalone out-of-turn batches), so a floored fork that copies only
  // `seq >= floor` slots must reconstitute the invisible prefix — else its fold silently diverges from the
  // room's real state (F6a) — WITHOUT carrying the pre-floor batches verbatim (F6b: an overwritten pre-floor
  // value is one the forker could never read, and it resurfaces in the room they now host). The shape is the
  // variables twin of the compaction checkpoint: invisible history collapses into ONE present-state baseline
  // batch stamped at the floor. See `verbs/fork.ts::buildForkStandaloneDeltas`.
  describe("D79 #8 — the variable-carry baseline (invisible history collapses to present state)", () => {
    const setOp = (key: string, value: string): VarOp[] => [{ op: "set", key, value }];

    /** The source chat's variable-plane fixture, shared by the three arms so they differ ONLY in the forker's
     *  floor. Four slots + three standalone batches, with the pre-floor batch value (`old-crown`) OVERWRITTEN
     *  above it (the F6b leak carrier) and two ABOVE-floor `inc`s (the ops that make a naive
     *  fold-at-the-fork-point baseline double-count). True fold at head: hp 12, secret daylight, relic
     *  new-crown, note "-post". */
    async function seedVariableChain(chatId: ChatId): Promise<void> {
      const delta = async (seq: number, ops: VarOp[]): Promise<void> => {
        const { variantId } = await seedMessage(db, chatId, seq, { role: "assistant", content: `body-${seq}` });
        await db.update(messageVariants).set({ variableDelta: ops }).where(eq(messageVariants.id, variantId));
      };
      await delta(1, [
        { op: "set", key: "hp", value: "10" },
        { op: "set", key: "secret", value: "moonlight" },
      ]);
      await delta(2, setOp("secret", "daylight"));
      await delta(3, [{ op: "inc", key: "hp" }]);
      await delta(4, [{ op: "inc", key: "hp" }]);
      await db
        .update(chats)
        .set({
          standaloneVariableDeltas: [
            { seq: 1, delta: setOp("relic", "old-crown") },
            { seq: 2, delta: setOp("relic", "new-crown") },
            { seq: 4, delta: [{ op: "add", key: "note", value: "-post" }] },
          ],
          // The source's live cache = the true fold of that chain (what `applyStandaloneVariableOps` / the turn
          // commit would have written). The fork's own fold is asserted against THIS, not a re-spelled literal.
          runtimeVariables: { hp: "12", secret: "daylight", relic: "new-crown", note: "-post" },
        })
        .where(eq(chats.id, chatId));
    }

    async function forkRow(chatId: ChatId): Promise<{ runtime: unknown; standalone: unknown }> {
      const [row] = await db
        .select({ runtime: chats.runtimeVariables, standalone: chats.standaloneVariableDeltas })
        .from(chats)
        .where(eq(chats.id, castId(chatId)));
      return { runtime: row?.runtime ?? null, standalone: row?.standalone ?? null };
    }

    test("a HOST fork is unchanged: every standalone batch carries VERBATIM, no baseline is minted", async () => {
      const host = await seedUser(db, castId<Handle>("vb_host"));
      const chatId = await seedChat(db, "vb_host_src");
      await seedParticipant(db, { chatId, key: "vb_h", userId: host, role: "host" });
      await seedVariableChain(chatId);

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(host), chatId });

      const row = await forkRow(chat.id);
      // Byte-identical log (no baseline row, original seq stamps intact) and the source's true fold.
      expect(row.standalone).toEqual([
        { seq: 1, delta: setOp("relic", "old-crown") },
        { seq: 2, delta: setOp("relic", "new-crown") },
        { seq: 4, delta: [{ op: "add", key: "note", value: "-post" }] },
      ]);
      expect(row.runtime).toEqual({ hp: "12", secret: "daylight", relic: "new-crown", note: "-post" });
    });

    test("an UNFLOORED (`full`) sole-human fork carries verbatim too — the fork's state equals the source's", async () => {
      const member = await seedUser(db, castId<Handle>("vb_full_member"));
      const chatId = await seedChat(db, "vb_full_src");
      // `full` visibility ⇒ NO_HISTORY_FLOOR; sole present human ⇒ the fork gate's solo arm allows it.
      await seedParticipant(db, { chatId, key: "vb_f", userId: member, role: "member", joinSeq: 3, joinHistoryVisibility: "full" });
      await seedVariableChain(chatId);

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(member), chatId });

      const [srcRow] = await db.select({ runtime: chats.runtimeVariables, standalone: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId));
      const row = await forkRow(chat.id);
      expect(row.standalone).toEqual(srcRow?.standalone);
      expect(row.runtime).toEqual(srcRow?.runtime);
    });

    test("a FLOORED sole-human fork: state equals the source's, via ONE baseline batch — no pre-floor value, no pre-floor stamp", async () => {
      const member = await seedUser(db, castId<Handle>("vb_floor_member"));
      const chatId = await seedChat(db, "vb_floor_src");
      await seedVariableChain(chatId);
      // Joined at seq 3 with the opt-in restriction; sole present human (the host left without a handoff) ⇒
      // the fork is allowed via the solo arm, and the copy floor is seq 3.
      await seedParticipant(db, { chatId, key: "vb_c", userId: member, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(member), chatId });

      const [srcRow] = await db.select({ runtime: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId));
      const row = await forkRow(chat.id);
      // (a) CORRECTNESS — the fork's fold is byte-equal to the room's real state at the fork point. The old
      // behavior dropped the pre-floor SLOT deltas entirely (hp "2", no `secret`): a silent gameplay reset.
      expect(row.runtime).toEqual(srcRow?.runtime);
      expect(row.runtime).toEqual({ hp: "12", secret: "daylight", relic: "new-crown", note: "-post" });
      // (b) THE LOG — one synthetic baseline stamped AT the floor (the state the member walked in on, which
      // their unclamped `getVariables` already reads), then only the above-floor batches. `secret` folds to
      // `daylight`: the pre-floor `moonlight` write is collapsed away, not carried.
      expect(row.standalone).toEqual([
        {
          seq: 3,
          delta: [
            { op: "set", key: "hp", value: "11" },
            { op: "set", key: "secret", value: "daylight" },
            { op: "set", key: "relic", value: "new-crown" },
          ],
        },
        { seq: 4, delta: [{ op: "add", key: "note", value: "-post" }] },
      ]);
      // (c) VISIBILITY — no superseded pre-floor batch VALUE rides into the room the forker now hosts (F6b),
      // and no stamp below the floor survives to be refolded later.
      const serialized = JSON.stringify(row.standalone);
      expect(serialized).not.toContain("old-crown");
      expect(serialized).not.toContain("moonlight");
      for (const batch of row.standalone as { seq: number }[]) {
        expect(batch.seq).toBeGreaterThanOrEqual(3);
      }
    });

    test("a floored fork truncated BELOW the floor carries no variable state at all (the visible slice is empty)", async () => {
      const member = await seedUser(db, castId<Handle>("vb_trunc_member"));
      const chatId = await seedChat(db, "vb_trunc_src");
      await seedVariableChain(chatId);
      await seedParticipant(db, { chatId, key: "vb_t", userId: member, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(member), chatId, throughSeq: 2 });

      // No canon is visible at that horizon, so state as-of seq 2 would be state the forker may not read.
      const forkMsgs = await db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.chatId, castId(chat.id)));
      expect(forkMsgs).toHaveLength(0);
      const row = await forkRow(chat.id);
      expect(row.standalone).toBeNull();
      expect(row.runtime).toBeNull();
    });
  });

  // §3.6 member-strip across the fork boundary (D106): a fork copies canon into a room the forker HOSTS. A
  // NON-HOST forker never had host-plane access to the source's hidden-class spans; if the copy kept them, the
  // forker would read the GM-plane truth verbatim via the fork's HOST listMessages — laundering the member-strip
  // through the member→host transition. This strip is now DEFENSE-IN-DEPTH: the fork gate refuses a non-host in
  // a MULTI-human room, so a non-host forker only reaches here as the SOLE present human (solo arm) — the tests
  // seed exactly that (a lone non-host member, host departed). The belt still fires (a non-host role → strip).
  describe("§3.6 hidden-content strip across the member→host fork boundary (defense-in-depth belt)", () => {
    const lie = '<lie character="Z" truth="he is the traitor"/>';

    test("a NON-HOST (solo) forker's copied assistant body is STRIPPED of hidden spans", async () => {
      const member = await seedUser(db, castId<Handle>("member"));
      const charA = await seedCharacter(db, member, "aria");
      const chatId = await seedChat(db, "hs_src");
      // Sole present human = a non-host member (host departed, no handoff) ⇒ fork allowed via the solo arm; the
      // non-host role still triggers the body strip belt.
      await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: `He smiles. ${lie} "Nothing," he says.` });

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(member), chatId });

      const [row] = await db
        .select({ content: messageVariants.content })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, castId(chat.id)));
      expect(row?.content).toBe('He smiles.  "Nothing," he says.');
      expect(row?.content).not.toContain("traitor");
      expect(row?.content).not.toContain("<lie");
    });

    test("a (solo) non-host forker's copied continue-snapshot BODY twins are also stripped (undo/revert can't re-expose the truth)", async () => {
      const member = await seedUser(db, castId<Handle>("member"));
      const charA = await seedCharacter(db, member, "aria");
      const chatId = await seedChat(db, "hs_snap");
      await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      const m = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "clean tip" });
      // Stamp the continue-snapshot twins with a lie in the pre-continue body (the undo target).
      await db
        .update(messageVariants)
        .set({ preContinueContent: `pre ${lie} pre`, lastContinuationContent: `cont ${lie} cont` })
        .where(eq(messageVariants.id, castId(m.variantId)));

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(member), chatId });

      const [row] = await db
        .select({ pre: messageVariants.preContinueContent, cont: messageVariants.lastContinuationContent })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, castId(chat.id)));
      expect(row?.pre).not.toContain("traitor");
      expect(row?.cont).not.toContain("traitor");
      expect(row?.pre).toBe("pre  pre");
      expect(row?.cont).toBe("cont  cont");
    });

    // The ASSEMBLED-PROMPT arm of the same laundering boundary (RAWVIEW, 2026-08-02). `promptSnapshot` is the
    // `AssembledPrompt` the turn ACTUALLY SENT: the model always reads hidden spans verbatim (member-visibility
    // header, §3.6 "WHO SEES WHAT"), and the blob embeds the whole assembled history — including slots below a
    // clamped member's D16 floor, which the fork's SLOT copy correctly withholds. `copyVariantStmt` spreads
    // `...variant`, so the blob rode into the copy untouched; the moment a host-only reader exists
    // (`chat.getVariantWire`), a member-turned-host forker recovers exactly the bytes the body strip and the
    // floor removed. Same verdict axis as the body/reasoning strips: drop it whenever the forker is non-host.
    test("a NON-HOST (solo) forker's copied promptSnapshot is DROPPED (it embeds hidden spans + pre-floor history)", async () => {
      const member = await seedUser(db, castId<Handle>("member"));
      const charA = await seedCharacter(db, member, "aria");
      const chatId = await seedChat(db, "hs_snapshot");
      await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      const m = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "He shrugs." });
      // The blob as the engine writes it: the hidden truth rides `dynamic` (the wire projection is verbatim) and
      // the pre-join canon rides `static` (the assembled history the fit-pass kept). Only the blob's PRESENCE
      // in the copy is under test — the copy path reads no field of it.
      // @orb-waive no-test-fabrication(never): an AssembledPrompt stand-in whose fields the copy path never reads. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const snapshot = {
        static: "PRE-JOIN CANON: the vault code is 4417.",
        dynamic: `He smiles. ${lie} "Nothing," he says.`,
        afterHistory: [],
        sendHistory: true,
        trace: {},
      } as never;
      await db
        .update(messageVariants)
        .set({ promptSnapshot: snapshot })
        .where(eq(messageVariants.id, castId(m.variantId)));

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(member), chatId });

      const [row] = await db
        .select({ snapshot: messageVariants.promptSnapshot })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, castId(chat.id)));
      expect(JSON.stringify(row?.snapshot ?? null)).not.toContain("traitor");
      expect(JSON.stringify(row?.snapshot ?? null)).not.toContain("4417");
      expect(row?.snapshot ?? null).toBeNull();
    });

    test("a HOST forker's copied promptSnapshot survives (they already read every byte of it)", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const charA = await seedCharacter(db, host, "aria");
      const chatId = await seedChat(db, "hs_snapshot2");
      await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      const m = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "He shrugs." });
      // @orb-waive no-test-fabrication(never): only the blob's PRESENCE is under test; `trace` is never read by the copy path. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const snapshot = { static: "s", dynamic: `d ${lie}`, afterHistory: [], sendHistory: true, trace: {} } as never;
      await db
        .update(messageVariants)
        .set({ promptSnapshot: snapshot })
        .where(eq(messageVariants.id, castId(m.variantId)));

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(host), chatId });

      const [row] = await db
        .select({ snapshot: messageVariants.promptSnapshot })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, castId(chat.id)));
      expect(JSON.stringify(row?.snapshot ?? null)).toContain("traitor");
    });

    test("a HOST forker's copied assistant body is VERBATIM (they already read the truth)", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const charA = await seedCharacter(db, host, "aria");
      const chatId = await seedChat(db, "hs_src2");
      await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      const body = `He smiles. ${lie} done`;
      await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: body });

      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(host), chatId });

      const [row] = await db
        .select({ content: messageVariants.content })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(eq(messages.chatId, castId(chat.id)));
      expect(row?.content).toBe(body);
      expect(row?.content).toContain("traitor");
    });

    // The P3 REASONING arm of the same laundering boundary — the fork is a COPY PATH that carries the durable
    // `message_variants.reasoning` (now rendered on every committed row), plus its continue-snapshot twins. A
    // non-host forker of a DECEPTION-active source becomes HOST of the copy, so an uncleared reasoning column
    // would hand them the GM-plane spill through the fork's own host read.
    describe("the P3 reasoning arm (deception-active source)", () => {
      const spill = "I'll say the study, but he is really in the crypt.";
      /** Deception-active source: the injected op says the reasoning channel is host-only for this chat. */
      function deceptionRpg(): NonNullable<ChatContext["rpg"]> {
        // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — forkChat reaches only resolveReasoningHostOnly here (forkGame is never called: the source carries no game pointer). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
        return { resolveReasoningHostOnly: () => Promise.resolve(true) } as unknown as NonNullable<ChatContext["rpg"]>;
      }

      /** Seed a source room whose tail assistant variant carries the spill in `reasoning` AND in both
       *  continue-snapshot reasoning twins (the undo/revert restore targets). */
      async function seedSpilledRoom(key: string, human: UserId, role: ParticipantRole): Promise<ChatId> {
        const charA = await seedCharacter(db, human, `${key}_char`);
        const chatId = await seedChat(db, key);
        await seedParticipant(db, { chatId, key: "h", userId: human, role });
        await seedParticipant(db, { chatId, key: "c", characterId: charA });
        const m = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "He shrugs.", reasoning: spill });
        await db
          .update(messageVariants)
          .set({ preContinueReasoning: `pre ${spill}`, lastContinuationReasoning: `cont ${spill}` })
          .where(eq(messageVariants.id, castId(m.variantId)));
        return chatId;
      }

      async function forkedReasoning(chatId: ChatId, forker: UserId): Promise<{ reasoning: string | null; pre: string | null; cont: string | null }> {
        const fork = createFork(makeChatContext(db, { getCard: ownedCard(), rpg: deceptionRpg() }), { emit, loadParticipantViews });
        const { chat } = await fork.forkChat({ principal: principal(forker), chatId: castId(chatId) });
        const [row] = await db
          .select({
            reasoning: messageVariants.reasoning,
            pre: messageVariants.preContinueReasoning,
            cont: messageVariants.lastContinuationReasoning,
          })
          .from(messages)
          .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
          .where(eq(messages.chatId, castId(chat.id)));
        return { reasoning: row?.reasoning ?? null, pre: row?.pre ?? null, cont: row?.cont ?? null };
      }

      test("a NON-HOST (solo) forker's copy carries NO reasoning — the live column AND both continue-snapshot twins are nulled", async () => {
        const member = await seedUser(db, castId<Handle>("rs_member"));
        const chatId = await seedSpilledRoom("rs_src", member, "member");

        const copied = await forkedReasoning(chatId, member);

        expect(copied).toEqual({ reasoning: null, pre: null, cont: null });
        expect(JSON.stringify(copied)).not.toContain("crypt");
      });

      test("a HOST forker's copy keeps the reasoning verbatim (they already read the host plane)", async () => {
        const host = await seedUser(db, castId<Handle>("rs_host"));
        const chatId = await seedSpilledRoom("rs_src2", host, "host");

        const copied = await forkedReasoning(chatId, host);

        expect(copied.reasoning).toBe(spill);
        expect(copied.pre).toBe(`pre ${spill}`);
        expect(copied.cont).toBe(`cont ${spill}`);
      });
    });
  });

  // THE PER-COLUMN CLASSIFICATION + THE UNCLASSIFIED-COLUMN TRIPWIRE (2026-08-07). The copy used to spread
  // `...variant` and subtract a hand-maintained deny-list, so a column ADDED to `message_variants` defaulted to
  // COPIED — backwards at a member→host boundary, and it had already let three columns through
  // (`promptSnapshot`, retro-fitted; `rawContent`/`macroFreezes`, added by the identity spine and copied
  // verbatim). `forkVariantValues` is now an ALLOW-LIST typed `Required<…$inferInsert>`, so a new column fails
  // `tsc`; this table is the BEHAVIORAL twin of that ratchet — a new column must be classified HERE too, and the
  // census below proves the running verb actually honors each class.
  //
  // THE LAW (fork.ts): a column readable ONLY through a HOST-GATED surface does not survive the member→host
  // fork. `promptSnapshot`/`params`/`macroDraws` are the three fields `loadVariantWire` serves behind
  // `chat.getVariantWire`'s `requireHost`; `rawContent`/`macroFreezes` are declared HOST-PLANE by their own
  // contract. Everything else is already member-readable in the source room, so the fork grants nothing new.
  describe("§3.6 the per-column fork classification (the unclassified-column tripwire)", () => {
    test("EVERY message_variants column is classified — a new column lands here or the fork copies it blind", () => {
      // Read off the live drizzle table, so a schema addition reds THIS test even if the `tsc` ratchet in
      // fork.ts were worked around (a cast, a widened type). Two-sided: a dropped column reds too.
      expect(Object.keys(getTableColumns(messageVariants)).sort()).toEqual(Object.keys(FORK_COLUMN_CLASS).sort());
    });

    /** Seed a room whose tail assistant variant has EVERY nullable column populated with a distinctive value,
     *  so the census can tell "copied" from "silently null" per column. Body prose is deliberately hidden-free
     *  and the game is non-deception, so the member-projected columns are identity here. */
    async function seedFullyPopulatedRoom(key: string, human: UserId, role: ParticipantRole): Promise<ChatId> {
      const charA = await seedCharacter(db, human, `${key}_char`);
      const chatId = await seedChat(db, key);
      await seedParticipant(db, { chatId, key: "h", userId: human, role });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      const first = await seedMessage(db, chatId, 1, { role: "user", authorUserId: human, content: "opening" });
      const m = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "He shrugs." });
      await db
        .update(messageVariants)
        .set({
          // @orb-waive no-test-fabrication(never): an `AssembledPrompt` stand-in — the copy path reads no field of it, only its presence. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
          promptSnapshot: { static: "PRE-JOIN CANON", dynamic: "d", afterHistory: [], sendHistory: true, trace: {} } as never,
          // The host-gated wire trio's other two members: the initiator's per-send knobs (note the
          // `advanced.claudeEnv` escape hatch + the free-text compaction instructions) and the draw record.
          params: { temperature: 0.7, compaction: { instructions: "HOST-ONLY compaction prose" }, advanced: { claudeEnv: { ["GM_KNOB"]: "host-secret" } } },
          macroDraws: { gmPool: { pick: "the traitor is Z" } },
          rawContent: 'He shrugs. {{roll:d20}} <lie truth="pre-strip bytes"/>',
          macroFreezes: [{ name: "roll", args: "d20", value: "17" }],
          reasoning: "thinking",
          reasoningEffort: "high",
          model: testModelId("m1"),
          provider: testProviderId("p1"),
          tokensIn: 11,
          tokensOut: 22,
          cacheReadTokens: 33,
          cacheWriteTokens: 44,
          costUsd: 0.5,
          contextWindow: 8192,
          maxOutputTokens: 128,
          ttftMs: 55,
          finishReason: "stop",
          stopReason: "end_turn",
          terminalReason: "complete",
          apiErrorStatus: 429,
          genStartedAt: 1000,
          genFinishedAt: 2000,
          generationId: "gen-abc",
          toolCalls: [{ toolCallId: "call_1", name: "roll", arguments: "{}", result: "{}", isError: false, durationMs: 5 }],
          variableDelta: [{ op: "set", key: "k", value: "v" }],
          // The ONE key anything reads off this blob (`substrate/stats-delta.ts::reasoningMsOf`) — snake_case
          // because the sidecar's vocabulary is the ST import's, not ours.
          metadata: { ["reasoning_duration"]: 1234 },
          preContinueContent: "pre body",
          lastContinuationContent: "cont body",
          preContinueReasoning: "pre think",
          lastContinuationReasoning: "cont think",
          // The cross-slot fit-pass pointer — inside the copied range, so the fork must REMAP it.
          contextBoundaryMessageId: castId(first.messageId),
        })
        .where(eq(messageVariants.id, castId(m.variantId)));
      return chatId;
    }

    /** The WHOLE tail (seq 2) variant row of a chat — every column, so the census reads them all. */
    async function tailVariantRow(chatId: ChatId): Promise<typeof messageVariants.$inferSelect | undefined> {
      const [slot] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.seq, 2)));
      if (slot === undefined) {
        return;
      }
      const [variant] = await db.select().from(messageVariants).where(eq(messageVariants.messageId, slot.id));
      return variant;
    }

    /** Fork as `forker` and return the source + copied tail variant rows. */
    async function censusRows(
      chatId: ChatId,
      forker: UserId,
    ): Promise<{ src: typeof messageVariants.$inferSelect; copy: typeof messageVariants.$inferSelect }> {
      const src = await tailVariantRow(chatId);
      const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(forker), chatId });
      const copy = await tailVariantRow(castId(chat.id));
      if (src === undefined || copy === undefined) {
        throw new Error("census: the seeded tail variant did not survive the fork");
      }
      return { src, copy };
    }

    test("a NON-HOST (solo) forker's copy honors every class — host-plane columns NULL, the rest verbatim", async () => {
      const member = await seedUser(db, castId<Handle>("census_member"));
      // Sole present human, non-host (the host departed without a handoff) — the one live way a member reaches
      // the fork, and the exact posture that turns them into HOST of the copy.
      const chatId = await seedFullyPopulatedRoom("census_src", member, "member");

      const { src, copy } = await censusRows(chatId, member);

      const { leaked, dropped } = censusMismatches(src, copy, "non-host");
      expect(leaked, "host-plane columns crossed the member→host fork boundary").toEqual([]);
      expect(dropped, "member-readable columns were lost by the fork copy").toEqual([]);
      // The boundary pointer remapped INTO the fork rather than degrading to null (a real copied slot exists).
      expect(copy.contextBoundaryMessageId).not.toBeNull();
      // Belt on the BYTES, independent of the classification table: none of the four host-plane secrets seeded
      // above may appear ANYWHERE on the copied row, whatever column a future author parks them in.
      const copiedBytes = JSON.stringify(copy);
      for (const secret of ["host-secret", "the traitor is Z", "pre-strip bytes", "HOST-ONLY compaction prose"]) {
        expect(copiedBytes, `a host-plane byte survived the fork: ${secret}`).not.toContain(secret);
      }
    });

    test("a HOST forker's copy keeps every host-plane column verbatim (they already read every byte)", async () => {
      const host = await seedUser(db, castId<Handle>("census_host"));
      const chatId = await seedFullyPopulatedRoom("census_src2", host, "host");

      const { src, copy } = await censusRows(chatId, host);

      const { leaked, dropped } = censusMismatches(src, copy, "host");
      expect(leaked, "a host forker's ids must still be remapped").toEqual([]);
      expect(dropped, "a HOST fork must copy every non-remapped column verbatim — including the host plane").toEqual([]);
    });
  });

  // FORK CLONES THE GAME (fork-clones-the-game §3.2) — the WIRING proof: `forkChat` hands `ChatRpgOps.forkGame`
  // the fork's id maps (built from the floor-clamped/throughSeq-truncated copy) + the forker's source-room
  // posture, AFTER the atomic batch commits, and never fails the fork on a clone error. The rpg-side re-key +
  // strip rules are proven in `tests/server/domain/rpg/chat-ops/fork-game.int.test.ts`; this proves the seam.
  describe("§3.2 game-clone wiring", () => {
    /** A stub `ctx.rpg` capturing the `forkGame` call. `resolveReasoningHostOnly` returns false (non-deception),
     *  the only OTHER op `forkChat` reaches. Cast — the verb touches just these two ops. */
    function captureRpg(over: { throwOnFork?: boolean } = {}): { calls: ForkGameArgs[]; rpg: NonNullable<ChatContext["rpg"]> } {
      const calls: ForkGameArgs[] = [];
      // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — forkChat reaches only resolveReasoningHostOnly + forkGame. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const rpg = {
        resolveReasoningHostOnly: () => Promise.resolve(false),
        forkGame: (args: ForkGameArgs) => {
          calls.push(args);
          if (over.throwOnFork === true) {
            return Promise.reject(new Error("clone boom"));
          }
          return Promise.resolve({ cloned: true });
        },
      } as unknown as NonNullable<ChatContext["rpg"]>;
      return { calls, rpg };
    }

    test("a game-fork calls forkGame with the source/new chat ids, the built id maps, and the forker's posture", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const charA = await seedCharacter(db, host, "aria");
      const chatId = await seedChat(db, "gc_src");
      await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
      await seedParticipant(db, { chatId, key: "c", characterId: charA });
      const m1 = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "beat" });

      const { calls, rpg } = captureRpg();
      const fork = createFork(makeChatContext(db, { getCard: ownedCard(), rpg }), { emit, loadParticipantViews });
      const { chat } = await fork.forkChat({ principal: principal(host), chatId });

      expect(calls).toHaveLength(1);
      const args = calls[0];
      expect(args?.sourceChatId).toBe(chatId);
      expect(args?.newChatId).toBe(castId(chat.id));
      // The map re-keys the SOURCE slot/variant to a FRESH fork id (never the same id — a fork copies).
      const mappedSlot = args?.slotIdMap.get(m1.messageId);
      const mappedVariant = args?.variantIdMap.get(m1.variantId);
      expect(mappedSlot).toBeDefined();
      expect(mappedSlot).not.toBe(m1.messageId);
      expect(mappedVariant).toBeDefined();
      expect(mappedVariant).not.toBe(m1.variantId);
      // The forker is the host of THIS source room → readsHidden true, userId = the forker.
      expect(args?.forker).toEqual({ userId: host, readsHidden: true });
    });

    test("a (solo) NON-HOST forker hands forkGame readsHidden:false (the host-secret strip axis, belt)", async () => {
      const member = await seedUser(db, castId<Handle>("member"));
      const chatId = await seedChat(db, "gc_member");
      // Sole present human = a non-host member (host departed) ⇒ fork allowed via the solo arm; the clone still
      // receives readsHidden:false so its host-secret strips fire (defense-in-depth belt).
      await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
      await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });

      const { calls, rpg } = captureRpg();
      const fork = createFork(makeChatContext(db, { getCard: ownedCard(), rpg }), { emit, loadParticipantViews });
      await fork.forkChat({ principal: principal(member), chatId });

      expect(calls[0]?.forker).toEqual({ userId: member, readsHidden: false });
    });

    test("a clone FAILURE never fails the fork — the fork ships as a valid plain chat", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const chatId = await seedChat(db, "gc_boom");
      await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
      await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });

      const { rpg } = captureRpg({ throwOnFork: true });
      const fork = createFork(makeChatContext(db, { getCard: ownedCard(), rpg }), { emit, loadParticipantViews });
      // The clone throws, but the fork still resolves (degraded-not-broken) with a real forked chat row.
      const { chat } = await fork.forkChat({ principal: principal(host), chatId });
      const [row] = await db
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.id, castId(chat.id)));
      expect(row?.id).toBe(castId(chat.id));
    });
  });
});

// THE FORK GATE (owner policy 2026-07-28): a fork is allowed when the caller is the HOST, or is the SOLE
// present HUMAN in the room (a solo chat/game — nothing to launder). A NON-HOST caller with ANOTHER present
// human member is REFUSED — the multi-human member→host secret-laundering case, now closed at the source (the
// strips demote to defense-in-depth belt). Human = `kind:"human"`; a seated character never counts.
describe("forkChat — the host-or-sole-human fork gate", () => {
  test("SOLO HOST forks — allowed", async () => {
    const host = await seedUser(db, castId<Handle>("gate_host"));
    const chatId = await seedChat(db, "gate_solo_host");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });
    expect(chat.parentChatId).toBe(chatId);
  });

  test("SOLE NON-HOST HUMAN forks — allowed (host departed, no handoff; nothing to launder)", async () => {
    const member = await seedUser(db, castId<Handle>("gate_lone_member"));
    const chatId = await seedChat(db, "gate_solo_member");
    // A lone non-host human (a character seat is also present — it does NOT count as a human).
    const charA = await seedCharacter(db, member, "aria");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "beat" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });
    expect(chat.parentChatId).toBe(chatId);
    // The lone forker becomes the fork's host.
    expect(chat.participants.find((p) => p.role === "host")?.userId).toBe(member);
  });

  test("NON-HOST member in a MULTI-HUMAN room — REFUSED with not_host (a known-existence authority refusal)", async () => {
    const host = await seedUser(db, castId<Handle>("gate_mh_host"));
    const member = await seedUser(db, castId<Handle>("gate_mh_member"));
    const chatId = await seedChat(db, "gate_multi");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const err = await fork.forkChat({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    // No fork chat row was created (the refusal is before any write).
    expect(await db.select({ id: chats.id }).from(chats).where(eq(chats.parentChatId, chatId))).toEqual([]);
    expect(emitted).toEqual([]);
  });

  test("a NON-MEMBER stranger — REFUSED with leak-free NOT_FOUND (never reveals the room exists)", async () => {
    const host = await seedUser(db, castId<Handle>("gate_nf_host"));
    const stranger = await seedUser(db, castId<Handle>("gate_nf_stranger"));
    const chatId = await seedChat(db, "gate_nf");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const err = await fork.forkChat({ principal: principal(stranger), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
    expect(await db.select({ id: chats.id }).from(chats).where(eq(chats.parentChatId, chatId))).toEqual([]);
  });
});
