// tests/legacy/server/domain/rpg/chat-ops/fork-game — `ChatRpgOps.forkGame` (fork-clones-the-game §3.2). The
// SECURITY core: a fork clones the game vertical through the fork's id maps, and a NON-HOST forker's copy must
// carry NO host secrets and NO cross-tenant rows. This is a two-principal EXPLOIT DRIVE — a source game owned by
// host `gm` (a foreign preset, a steering secret, hidden-span tracker prose), forked by member `mallory`, with
// the copy read back to prove every strip fired and the remap is correct.
//
// The op is principal-free (chat gated the caller); the harness drives it directly with hand-built id maps —
// exactly the maps `verbs/fork.ts::buildCanonCopy` hands it (only COPIED rows are in the maps, so the horizon is
// encoded by construction). What the tests prove:
//   • host-secret strip: steeringNote → "", a FOREIGN gmPresetId → null, an OWNED/shared gmPresetId → carried;
//   • hidden-span belt: snapshot `recentEvents` + journal `content` lose their `<lie …/>` truth for a non-host forker;
//   • cross-tenant: the fork's rows key the NEW game/chat/variants only — never a source id (no dangling FK);
//   • variant remap: each fork snapshot resolves ITS copied variant (swipe-consistency across the fork);
//   • truncated-fork horizon: a snapshot/journal whose variant is NOT in the map is DROPPED (not carried past throughSeq);
//   • pointer LAST: the pointer fires AFTER the rows exist, with the cloned `engaged` state;

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { isDeceptionActive } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messageVariants, presets, rpgCheckpoints, rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, PresetId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { eq } from "drizzle-orm";
import { emptyState, expect, liteConfig, makeRpgService, quest, questId, seedChat, seedMessage, seedUser, test } from "../_support.ts";
import {
  findGameByChat,
  insertCheckpoint,
  insertGame,
  insertJournalEntry,
  insertSnapshot,
  listAllJournal,
  listCheckpoints,
  listSheets,
  listSnapshots,
  resolveSnapshotForTurn,
  seedForkTarget,
  updateGame,
  upsertSheet,
  writeHandSnapshot,
} from "./_fork-game-support.ts";

/** A hidden-span `<lie …/>` the strip must remove. `stripHiddenSpans` deletes the whole self-closing tag, so
 *  the `truth` attr's secret never survives into a non-host forker's copy. */
const LIE = '<lie character="Mira" truth="she is the assassin"/>';

/** Seed a preset row for an ALREADY-seeded owner (no user re-seed — the FK owner exists). The `gmPresetId` FK
 *  references `presets.id`, so a game's preset knob must point at a real row. */
async function seedPresetRow(db: Db, id: PresetId, ownerId: UserId): Promise<PresetId> {
  await db.insert(presets).values({ id, ownerId, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT_MS, updatedAt: FROZEN_AT_MS });
  return id;
}

/** Seed a source GAME owned by `gmHandle` with every plane populated: a foreign preset knob, a steering-note
 *  secret, one assistant slot + snapshot carrying a `<lie>` in recentEvents, a model journal entry with a
 *  `<lie>` in its content, a hand journal entry, a sheet, a widget, and a checkpoint over the snapshot.
 *  Returns the ids the fork remaps against. */
async function seedSourceGame(
  db: Db,
  gmHandle: string,
  opts: { readonly gmPresetId?: PresetId | null; readonly deception?: boolean } = {},
): Promise<{
  chatId: ChatId;
  gameId: RpgGameId;
  messageId: MessageId;
  variantId: MessageVariantId;
  snapshotId: RpgSnapshotId;
}> {
  const gm = await seedUser(db, castId<Handle>(gmHandle));
  const chatId = await seedChat(db, `src_${gmHandle}`);
  const gameId = castId<RpgGameId>(`rpg_game_src_${gmHandle}`);
  const config = {
    ...liteConfig(),
    lite: { steeringNote: "GM SECRET: Mira betrays the party in act 3" },
    features: { ...liteConfig().features, deception: opts.deception ?? false },
  };
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: gm,
    gmPresetId: opts.gmPresetId ?? null,
    config,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat one" });
  const snapshotId = castId<RpgSnapshotId>(`rpg_snapshot_src_${gmHandle}`);
  await insertSnapshot(db, {
    id: snapshotId,
    gameId,
    messageId,
    variantId,
    ...emptyState(),
    location: "the tavern",
    recentEvents: [`Mira smiles warmly ${LIE}`],
    committed: 1,
    createdAt: FROZEN_AT_MS,
  });
  await insertJournalEntry(db, {
    id: castId(`rpg_journal_model_${gmHandle}`),
    gameId,
    type: "event",
    title: "The meeting",
    content: `They met at the ford. ${LIE}`,
    variantId,
    sourceMessageId: messageId,
    createdAt: FROZEN_AT_MS,
  });
  await insertJournalEntry(db, {
    id: castId(`rpg_journal_hand_${gmHandle}`),
    gameId,
    type: "note",
    title: "Host note",
    content: "a hand entry (every lineage)",
    variantId: null,
    sourceMessageId: null,
    createdAt: FROZEN_AT_MS,
  });
  await upsertSheet(db, {
    id: castId(`rpg_sheet_src_${gmHandle}`),
    gameId,
    characterId: null,
    userId: gm,
    sheet: { className: "Rogue", attributes: {}, flavor: "", level: 3, trackerGrants: ["bound_will"], trackerRevokes: [] },
    now: FROZEN_AT_MS,
  });
  await insertCheckpoint(db, { id: castId(`rpg_checkpoint_src_${gmHandle}`), gameId, snapshotId, label: "start", trigger: "manual", createdAt: FROZEN_AT_MS });
  return { chatId, gameId, messageId, variantId, snapshotId };
}

test("a NON-HOST forker's copy carries NO host secrets: steeringNote stripped, foreign gmPresetId nulled, hidden spans gone", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm", { deception: true });
  // The source host `gm` owns a private preset used as the game's gmPresetId. The forker does NOT own it.
  const foreignPreset = await seedPresetRow(db, castId<PresetId>("preset_gm_private"), castId<UserId>("user_gm"));
  await updateGame(db, src.gameId, { gmPresetId: foreignPreset });
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "m", src);

  const h = makeRpgService(db);
  // `mallory` does NOT own the foreign preset (ownedPresets is empty) → it must drop to null.
  const result = await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  expect(result.cloned).toBe(true);
  const forkGame = await findGameByChat(db, forkChatId);
  expect(forkGame).toBeDefined();
  // STRIP 1 — steeringNote wiped (the host-only GM directive never launders into the member's new host view).
  expect(forkGame?.config.lite.steeringNote).toBe("");
  // NO STRIP 1b any more — the host's re-authored teach copy left this blob entirely (owner ruling 2026-08-08:
  // PRESET-homed). The guarantee it used to give is now STRIP 2's: the copy lives in the GM preset, and a preset
  // the forker cannot read is nulled below, so a non-host fork still cannot resolve the host's re-authored bytes.
  // STRIP 2 — the FOREIGN gmPresetId nulled (a preset the forker can't read never rides into their turns).
  expect(forkGame?.gmPresetId).toBeNull();
  // Non-secret play-style carries (deception feature bit survives — it is member-visible mechanics).
  expect(forkGame !== undefined && isDeceptionActive(forkGame.config.features)).toBe(true);

  // STRIP 3 — the hidden-span BELT: snapshot recentEvents + journal content lose the `<lie>` truth.
  const forkSnaps = await listSnapshots(db, forkGame?.id as RpgGameId);
  expect(forkSnaps).toHaveLength(1);
  expect(forkSnaps[0]?.recentEvents).toEqual(["Mira smiles warmly "]);
  expect(forkSnaps[0]?.recentEvents?.join("")).not.toContain("assassin");

  const forkJournal = await listAllJournal(db, forkGame?.id as RpgGameId);
  const forkModel = forkJournal.find((j) => j.title === "The meeting");
  expect(forkModel?.content).toBe("They met at the ford. ");
  expect(forkJournal.map((j) => j.content).join("")).not.toContain("assassin");
});

// #1398 — THE BELT IS A PROPERTY OF THE COPY, NOT TWO CALL SITES. The hidden-span strip fired on exactly two
// fields (`recentEvents`, journal `content`) while every OTHER free-text plane copied verbatim: ambient
// location, an actor's identity/status/inventory prose, quest text, the plot rail, journal `title`/`label`,
// a checkpoint label, a sheet's flavor. A `<lie …/>` an extractor quoted into any of them rode into the
// non-host forker's new room whole. (SEVERITY NOTE, re-derived on the tree: this is DEFENCE IN DEPTH, not a
// live member→host escalation — no rpg read strips hidden spans, so the source room's own member-gated
// `getTrackerView`/`listJournal` already serve these planes raw to the same human. That SOURCE-side gap is
// filed separately; the fork must not be the place a laundered secret becomes a new room's canon.)
test("a NON-HOST forker's copy strips hidden spans from EVERY free-text plane, not just recentEvents + journal content", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "planes");
  // Plant the SAME `<lie>` in every plane the copy carries. Each is a place an extractor can quote canon.
  await db
    .update(rpgSnapshots)
    .set({
      location: `the tavern ${LIE}`,
      quests: [quest("q1", { name: `Find Mira ${LIE}`, description: `She was last seen at the ford ${LIE}` })],
      plot: { act: 1, title: `The Betrayal ${LIE}`, acts: [{ title: `Act one ${LIE}`, summary: `The party gathers ${LIE}` }] },
      actorState: [
        {
          actorRef: { kind: "npc", npcKey: "mira" },
          identity: { name: "Mira", emoji: "", mood: `wary ${LIE}`, thoughts: `she plans it tonight ${LIE}`, relationship: { kind: "neutral", label: "" } },
          volatile: {
            trackerValues: {},
            conditions: [],
            inventory: [{ id: "i1", name: `a folded note ${LIE}`, description: `it names the mark ${LIE}`, quantity: 1, location: "", type: "" }],
            wallet: [],
            status: `hiding something ${LIE}`,
          },
        },
      ],
    })
    .where(eq(rpgSnapshots.id, src.snapshotId));
  await db
    .update(rpgJournal)
    .set({ title: `The meeting ${LIE}`, label: `Mira ${LIE}` })
    .where(eq(rpgJournal.gameId, src.gameId));
  await db
    .update(rpgCheckpoints)
    .set({ label: `before the betrayal ${LIE}` })
    .where(eq(rpgCheckpoints.gameId, src.gameId));
  await db
    .update(rpgSheets)
    .set({ sheet: { className: "Rogue", attributes: {}, flavor: `raised by the guild ${LIE}`, level: 3, trackerGrants: [], trackerRevokes: [] } })
    .where(eq(rpgSheets.gameId, src.gameId));
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "planes", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const forkGameRow = await findGameByChat(db, forkChatId);
  const forkId = forkGameRow?.id as RpgGameId;
  // ONE assertion over the WHOLE clone: no cloned row, on any plane, carries the secret. Serializing the rows
  // is the point — a per-field list would go stale the day a column lands, and the strip is a property of the
  // copy, so the copy as a whole is what must be clean.
  const cloned = JSON.stringify([
    await listSnapshots(db, forkId),
    await listAllJournal(db, forkId),
    await listCheckpoints(db, forkId),
    await listSheets(db, forkId),
  ]);
  expect(cloned).not.toContain("assassin");
  expect(cloned).not.toContain("<lie");

  // ...and the copy is not GUTTED — the surrounding prose survives on every plane (the strip removes the
  // hidden span, never the field). This is the control: an over-broad "blank the column" fix fails here.
  const forkSnap = (await listSnapshots(db, forkId))[0];
  expect(forkSnap?.location).toBe("the tavern ");
  expect(forkSnap?.quests?.[0]?.name).toBe("Find Mira ");
  expect(forkSnap?.plot?.acts[0]?.summary).toBe("The party gathers ");
  expect(forkSnap?.actorState?.[0]?.volatile.status).toBe("hiding something ");
  expect(forkSnap?.actorState?.[0]?.volatile.inventory[0]?.name).toBe("a folded note ");
  expect(forkSnap?.actorState?.[0]?.identity?.thoughts).toBe("she plans it tonight ");
  expect((await listAllJournal(db, forkId)).map((j) => j.title)).toContain("The meeting ");
  expect((await listCheckpoints(db, forkId))[0]?.label).toBe("before the betrayal ");
  expect((await listSheets(db, forkId))[0]?.sheet.flavor).toBe("raised by the guild ");
  // The keys of the copy are untouched by the walk — the fork's own re-keyed ids still resolve.
  expect(forkSnap?.gameId).toBe(forkId);
  expect(forkSnap?.quests?.[0]?.id).toBe(questId("q1"));

  // The SOURCE is unchanged (the strip is a copy-time projection, never a write-back on the source room).
  expect(JSON.stringify(await listSnapshots(db, src.gameId))).toContain("assassin");
});

// The other half of the same law: a HOST forker (readsHidden) reads every secret already, so their copy is
// byte-identical — the deep walk must be gated, never unconditional.
test("a HOST forker's copy keeps the hidden spans in every plane (the walk is gated on readsHidden)", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "planes_host");
  await db
    .update(rpgSnapshots)
    .set({ location: `the tavern ${LIE}` })
    .where(eq(rpgSnapshots.id, src.snapshotId));
  await db
    .update(rpgJournal)
    .set({ title: `The meeting ${LIE}` })
    .where(eq(rpgJournal.gameId, src.gameId));
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "planes_host", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_gm"), readsHidden: true },
  });

  const forkId = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  expect((await listSnapshots(db, forkId))[0]?.location).toBe(`the tavern ${LIE}`);
  expect((await listAllJournal(db, forkId)).map((j) => j.title)).toContain(`The meeting ${LIE}`);
});

// D124 — the HAND arm through the fork. A hand row is game state, not story: it carries on EVERY lineage
// (the `rpg_journal` NULL-variant hand-entry rule), and its `asOfMessageId` re-keys through the SAME
// `slotIdMap` the turn rows use. On a D106 FLOORED fork the as-of slot maps to nothing and degrades to NULL —
// the row then orders before all visible history, which is exactly the state-as-of-pre-baseline posture.
test("a HAND row rides the fork on every lineage, with its as-of stamp re-keyed through slotIdMap", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm");
  // The host hand-edited between beats: a message-less snapshot stamped at the source's tail slot.
  await writeHandSnapshot(db, { ...emptyState(), location: "the hand-fixed hall" }, null, {
    id: castId<RpgSnapshotId>("rpg_snapshot_hand_src"),
    gameId: src.gameId,
    chatId: src.chatId,
    now: FROZEN_AT_MS,
  });
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "hand", src);

  const h = makeRpgService(db);
  const result = await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_gm"), readsHidden: true },
  });
  expect(result.cloned).toBe(true);

  const forkGame = await findGameByChat(db, forkChatId);
  const forkSnaps = await listSnapshots(db, forkGame?.id as RpgGameId);
  const hand = forkSnaps.find((row) => row.variantId === null);
  expect(hand?.location).toBe("the hand-fixed hall");
  expect(hand?.messageId).toBeNull();
  // The as-of stamp points at the FORK's copy of the source tail slot, never at the source id.
  expect(hand?.asOfMessageId).toBe(slotIdMap.get(src.messageId));
  // …and the turn row still keys the fork's copied variant (the two arms re-key independently).
  expect(forkSnaps.find((row) => row.variantId !== null)?.variantId).toBe(variantIdMap.get(src.variantId));
});

test("a FLOORED fork keeps the hand row and SET-NULLs its as-of (state survives, only the order degrades)", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm");
  await writeHandSnapshot(db, { ...emptyState(), location: "the hand-fixed hall" }, null, {
    id: castId<RpgSnapshotId>("rpg_snapshot_hand_floored"),
    gameId: src.gameId,
    chatId: src.chatId,
    now: FROZEN_AT_MS,
  });
  // A D106 FLOORED fork: the source's early slots collapsed below the floor, so NEITHER map carries them.
  const forkChatId = await seedChat(db, "fork_floored");
  const h = makeRpgService(db);
  const result = await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap: new Map<MessageId, MessageId>(),
    variantIdMap: new Map<MessageVariantId, MessageVariantId>(),
    forker: { userId: castId<UserId>("user_gm"), readsHidden: true },
  });
  expect(result.cloned).toBe(true);

  const forkGame = await findGameByChat(db, forkChatId);
  const forkSnaps = await listSnapshots(db, forkGame?.id as RpgGameId);
  // The TURN row is dropped (its variant is past the horizon); the HAND row survives with a NULL as-of.
  expect(forkSnaps).toHaveLength(1);
  expect(forkSnaps[0]?.variantId).toBeNull();
  expect(forkSnaps[0]?.asOfMessageId).toBeNull();
  expect(forkSnaps[0]?.location).toBe("the hand-fixed hall");
  // It still resolves as the fork's head — pre-baseline state IS the baseline posture, never lost state.
  expect((await resolveSnapshotForTurn(db, { id: forkGame?.id as RpgGameId, chatId: forkChatId }))?.location).toBe("the hand-fixed hall");
});

test("cross-tenant: EVERY fork row keys the new game/chat/variant — never a source id (no dangling FK)", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm");
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "ct", src);
  const forkVar = variantIdMap.get(src.variantId);
  const forkMsg = slotIdMap.get(src.messageId);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const forkGame = await findGameByChat(db, forkChatId);
  const fg = forkGame?.id as RpgGameId;
  // A fresh game id (not the source's), keyed to the fork chat.
  expect(fg).not.toBe(src.gameId);
  expect(forkGame?.chatId).toBe(forkChatId);

  const forkSnaps = await listSnapshots(db, fg);
  // The snapshot re-keys to the FORK's game + variant + message — never the source's.
  expect(forkSnaps[0]?.gameId).toBe(fg);
  expect(forkSnaps[0]?.variantId).toBe(forkVar);
  expect(forkSnaps[0]?.messageId).toBe(forkMsg);
  expect(forkSnaps[0]?.id).not.toBe(src.snapshotId);

  // Sheets/journal/checkpoints all key the fork game (the widget TABLE is gone — tracker defs ride
  // `config.trackers`, so they clone with the game row itself).
  expect((await listSheets(db, fg)).every((r) => r.gameId === fg)).toBe(true);
  expect((await listSheets(db, fg))[0]?.sheet.trackerGrants).toEqual(["bound_will"]);
  expect((await listAllJournal(db, fg)).every((r) => r.gameId === fg)).toBe(true);
  const forkCps = await listCheckpoints(db, fg);
  expect(forkCps).toHaveLength(1);
  expect(forkCps[0]?.gameId).toBe(fg);
  // The checkpoint's snapshotId re-keys to the COPIED snapshot (RESTRICT FK satisfied), not the source's.
  expect(forkCps[0]?.snapshotId).toBe(forkSnaps[0]?.id);
  expect(forkCps[0]?.snapshotId).not.toBe(src.snapshotId);

  // The source game is UNTOUCHED (a fork copies, never mutates the source).
  const srcSnaps = await listSnapshots(db, src.gameId);
  expect(srcSnaps[0]?.recentEvents?.join("")).toContain("assassin");
});

test("swipe remap: a two-variant slot forks each variant's snapshot to ITS copied variant", async () => {
  const db = await freshDb();
  const gm = await seedUser(db, castId<Handle>("gm"));
  const chatId = await seedChat(db, "src_swipe");
  const gameId = castId<RpgGameId>("rpg_game_swipe");
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: gm,
    gmPresetId: null,
    config: liteConfig(),
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  // One slot, two variants A + B — each with its OWN snapshot (the swipe plane).
  const { messageId, variantId: varA } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A" });
  const varB = castId<MessageVariantId>("variant_swipe_B");
  await db.insert(messageVariants).values({ id: varB, messageId, idx: 1, content: "B", createdAt: FROZEN_AT_MS });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_A"),
    gameId,
    messageId,
    variantId: varA,
    ...emptyState(),
    location: "loc A",
    committed: 1,
    createdAt: FROZEN_AT_MS,
  });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_B"),
    gameId,
    messageId,
    variantId: varB,
    ...emptyState(),
    location: "loc B",
    committed: 0,
    createdAt: FROZEN_AT_MS,
  });

  // The fork copies BOTH variants (a fork at the head carries the whole swipe fan).
  const forkChatId = await seedChat(db, "fork_swipe");
  const { messageId: forkMsg, variantId: forkVarA } = await seedMessage(db, forkChatId, 1, { role: "assistant", content: "A (fork)" });
  const forkVarB = castId<MessageVariantId>("variant_fork_swipe_B");
  await db.insert(messageVariants).values({ id: forkVarB, messageId: forkMsg, idx: 1, content: "B (fork)", createdAt: FROZEN_AT_MS });

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: chatId,
    newChatId: forkChatId,
    slotIdMap: new Map<MessageId, MessageId>([[messageId, forkMsg]]),
    variantIdMap: new Map<MessageVariantId, MessageVariantId>([
      [varA, forkVarA],
      [varB, forkVarB],
    ]),
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  const forkSnaps = await listSnapshots(db, fg);
  expect(forkSnaps).toHaveLength(2);
  // Each fork variant resolves ITS copied snapshot (swipe-consistency preserved across the fork).
  const byVar = new Map(forkSnaps.map((s) => [s.variantId, s]));
  expect(byVar.get(forkVarA)?.location).toBe("loc A");
  expect(byVar.get(forkVarB)?.location).toBe("loc B");
  // `committed` carries as-is (A committed, B uncommitted head).
  expect(byVar.get(forkVarA)?.committed).toBe(1);
  expect(byVar.get(forkVarB)?.committed).toBe(0);
});

test("truncated fork: a snapshot/journal whose variant is NOT in the map is DROPPED (horizon respected)", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm");
  // Add a SECOND, LATER slot + snapshot + model-journal that the fork will NOT copy (past its throughSeq).
  const { messageId: laterMsg, variantId: laterVar } = await seedMessage(db, src.chatId, 2, { role: "assistant", content: "beat two (past the horizon)" });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_later"),
    gameId: src.gameId,
    messageId: laterMsg,
    variantId: laterVar,
    ...emptyState(),
    location: "the future",
    committed: 1,
    createdAt: FROZEN_AT_MS,
  });
  await insertJournalEntry(db, {
    id: castId("rpg_journal_later"),
    gameId: src.gameId,
    type: "event",
    title: "Later",
    content: "past the horizon",
    variantId: laterVar,
    sourceMessageId: laterMsg,
    createdAt: FROZEN_AT_MS,
  });

  // The fork copies ONLY the first slot (the maps omit the later variant — exactly what a throughSeq truncation does).
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "trunc", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  const forkSnaps = await listSnapshots(db, fg);
  // ONLY the in-horizon snapshot copied — the later one is dropped (its variant has no map entry).
  expect(forkSnaps).toHaveLength(1);
  expect(forkSnaps.some((s) => s.location === "the future")).toBe(false);
  const forkJournal = await listAllJournal(db, fg);
  expect(forkJournal.some((j) => j.title === "Later")).toBe(false);
  // The hand entry (variantId null) still copies (room truth on every lineage), and the model entry in-horizon carries.
  expect(forkJournal.some((j) => j.title === "Host note")).toBe(true);
  expect(forkJournal.some((j) => j.title === "The meeting")).toBe(true);
});

test("a HOST forker (readsHidden) copies verbatim — no strip (they already read the secrets)", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm", { deception: true });
  const ownPreset = await seedPresetRow(db, castId<PresetId>("preset_owned"), castId<UserId>("user_gm"));
  await updateGame(db, src.gameId, { gmPresetId: ownPreset });
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "host", src);

  const h = makeRpgService(db);
  // The host forker owns the preset (and reads hidden). Everything carries verbatim.
  h.fakes.ownedPresets.add(`${ownPreset}:user_gm`);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_gm"), readsHidden: true },
  });

  const forkGame = await findGameByChat(db, forkChatId);
  expect(forkGame?.config.lite.steeringNote).toBe("GM SECRET: Mira betrays the party in act 3");
  expect(forkGame?.gmPresetId).toBe(ownPreset);
  const forkSnaps = await listSnapshots(db, forkGame?.id as RpgGameId);
  // The host reads the reveal plane — the `<lie>` prose is left intact in their copy.
  expect(forkSnaps[0]?.recentEvents?.join("")).toContain("assassin");
});

test("an OWNED gmPresetId is CARRIED even for a non-host forker (only a FOREIGN one drops)", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm");
  const mallory = await seedUser(db, castId<Handle>("mallory"));
  const forkerPreset = await seedPresetRow(db, castId<PresetId>("preset_mallory_owns"), mallory);
  await updateGame(db, src.gameId, { gmPresetId: forkerPreset });
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "owned", src);

  const h = makeRpgService(db);
  // mallory OWNS this preset → the ownership gate lets it carry (it is not a cross-tenant read for them).
  h.fakes.ownedPresets.add(`${forkerPreset}:user_mallory`);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  expect((await findGameByChat(db, forkChatId))?.gmPresetId).toBe(forkerPreset);
});

test("pointer LAST: the pointer fires AFTER the rows exist, mirroring the cloned engaged state", async () => {
  const db = await freshDb();
  const src = await seedSourceGame(db, "gm");
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "ptr", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  // EXACTLY one pointer fired, for the fork chat, at the NEW game id, engaged (the source config default).
  expect(h.fakes.pointers).toHaveLength(1);
  expect(h.fakes.pointers[0]).toEqual({ chatId: forkChatId, gameId: fg, engaged: true });
});

test("a fork of a DISENGAGED game is born disengaged (the pointer mirrors the cloned config)", async () => {
  const db = await freshDb();
  const gm = await seedUser(db, castId<Handle>("gm"));
  const chatId = await seedChat(db, "src_off");
  const gameId = castId<RpgGameId>("rpg_game_off");
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: gm,
    gmPresetId: null,
    config: { ...liteConfig(), engaged: false },
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_off"),
    gameId,
    messageId,
    variantId,
    ...emptyState(),
    committed: 1,
    createdAt: FROZEN_AT_MS,
  });

  const forkChatId = await seedChat(db, "fork_off");
  const { messageId: forkMsg, variantId: forkVar } = await seedMessage(db, forkChatId, 1, { role: "assistant", content: "beat (fork)" });

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: chatId,
    newChatId: forkChatId,
    slotIdMap: new Map<MessageId, MessageId>([[messageId, forkMsg]]),
    variantIdMap: new Map([[variantId, forkVar]]),
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  expect(h.fakes.pointers[0]?.engaged).toBe(false);
  expect((await findGameByChat(db, forkChatId))?.config.engaged).toBe(false);
});
