// tests/server/domain/rpg/chat-ops/fork-game — `ChatRpgOps.forkGame` (fork-clones-the-game §3.2). The
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
//   • host forker copies verbatim (they already read the secrets — no strip);
//   • non-game source ⇒ cloned:false, no pointer (the fork stays plain).

import type { UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RpgGameConfig } from "@orb/contracts/rpg";
import { isDeceptionActive, rpgGameConfigSchema, rpgGameFeaturesSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messageVariants, presets, rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, PresetId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getTableColumns } from "drizzle-orm";
import { insertCheckpoint, listCheckpoints } from "../../../../../packages/server/src/domain/rpg/persistence/checkpoints.ts";
import { findGameByChat, insertGame, updateGame } from "../../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { insertJournalEntry, listAllJournal } from "../../../../../packages/server/src/domain/rpg/persistence/journal.ts";
import { listSheets, upsertSheet } from "../../../../../packages/server/src/domain/rpg/persistence/sheets.ts";
import {
  insertSnapshot,
  listSnapshots,
  resolveSnapshotForTurn,
  writeHandSnapshot,
} from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { actorWithWallet, emptyState, expect, FROZEN_AT, liteConfig, makeRpgService, quest, seedChat, seedMessage, seedUser, test } from "../_support.ts";

/** A hidden-span `<lie …/>` the strip must remove. `stripHiddenSpans` deletes the whole self-closing tag, so
 *  the `truth` attr's secret never survives into a non-host forker's copy. */
const LIE = '<lie character="Mara" truth="she is the assassin"/>';

/** Seed a preset row for an ALREADY-seeded owner (no user re-seed — the FK owner exists). The `gmPresetId` FK
 *  references `presets.id`, so a game's preset knob must point at a real row. */
async function seedPresetRow(db: Db, id: PresetId, ownerId: UserId): Promise<PresetId> {
  await db.insert(presets).values({ id, ownerId, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
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
    lite: { steeringNote: "GM SECRET: Mara betrays the party in act 3" },
    features: { ...liteConfig().features, deception: opts.deception ?? false },
    // PROSE-1 — a host's re-authored teach: the steeringNote class (host-plane prose, prompt-only consumer),
    // so a non-host fork blanks it to {} exactly as it blanks the steeringNote.
    prose: { "rpg.reminder.steeringLicense": { text: "GM SECRET IN THE LICENSE", baseVersion: 1 } },
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
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
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
    recentEvents: [`Mara smiles warmly ${LIE}`],
    committed: 1,
    createdAt: FROZEN_AT,
  });
  await insertJournalEntry(db, {
    id: castId(`rpg_journal_model_${gmHandle}`),
    gameId,
    type: "event",
    title: "The meeting",
    content: `They met at the ford. ${LIE}`,
    variantId,
    sourceMessageId: messageId,
    createdAt: FROZEN_AT,
  });
  await insertJournalEntry(db, {
    id: castId(`rpg_journal_hand_${gmHandle}`),
    gameId,
    type: "note",
    title: "Host note",
    content: "a hand entry (every lineage)",
    variantId: null,
    sourceMessageId: null,
    createdAt: FROZEN_AT,
  });
  await upsertSheet(db, {
    id: castId(`rpg_sheet_src_${gmHandle}`),
    gameId,
    characterId: null,
    userId: gm,
    sheet: { className: "Rogue", attributes: {}, flavor: "", level: 3, trackerGrants: ["bound_will"], trackerRevokes: [] },
    now: FROZEN_AT,
  });
  await insertCheckpoint(db, { id: castId(`rpg_checkpoint_src_${gmHandle}`), gameId, snapshotId, label: "start", trigger: "manual", createdAt: FROZEN_AT });
  return { chatId, gameId, messageId, variantId, snapshotId };
}

/** Seed the FORK's copied chat + one assistant slot (the target of the remap). Returns the fork's id maps
 *  (source id → fork id) that `forkGame` re-keys through. */
async function seedForkTarget(
  db: Db,
  key: string,
  src: { messageId: MessageId; variantId: MessageVariantId },
): Promise<{ forkChatId: ChatId; slotIdMap: Map<MessageId, MessageId>; variantIdMap: Map<MessageVariantId, MessageVariantId> }> {
  const forkChatId = await seedChat(db, `fork_${key}`);
  const { messageId: forkMsg, variantId: forkVar } = await seedMessage(db, forkChatId, 1, { role: "assistant", content: "beat one (fork)" });
  return {
    forkChatId,
    slotIdMap: new Map<MessageId, MessageId>([[src.messageId, forkMsg]]),
    variantIdMap: new Map<MessageVariantId, MessageVariantId>([[src.variantId, forkVar]]),
  };
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
  // STRIP 1b — the host's re-authored prose (PROSE-1, the steeringNote class) is blanked to {} for the same
  // reason: it is host-plane, prompt-only-consumed copy the forker never read the bytes of.
  expect(forkGame?.config.prose).toEqual({});
  // STRIP 2 — the FOREIGN gmPresetId nulled (a preset the forker can't read never rides into their turns).
  expect(forkGame?.gmPresetId).toBeNull();
  // Non-secret play-style carries (deception feature bit survives — it is member-visible mechanics).
  expect(forkGame !== undefined && isDeceptionActive(forkGame.config.features)).toBe(true);

  // STRIP 3 — the hidden-span BELT: snapshot recentEvents + journal content lose the `<lie>` truth.
  const forkSnaps = await listSnapshots(db, forkGame?.id as RpgGameId);
  expect(forkSnaps).toHaveLength(1);
  expect(forkSnaps[0]?.recentEvents).toEqual(["Mara smiles warmly "]);
  expect(forkSnaps[0]?.recentEvents?.join("")).not.toContain("assassin");

  const forkJournal = await listAllJournal(db, forkGame?.id as RpgGameId);
  const forkModel = forkJournal.find((j) => j.title === "The meeting");
  expect(forkModel?.content).toBe("They met at the ford. ");
  expect(forkJournal.map((j) => j.content).join("")).not.toContain("assassin");
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
    now: FROZEN_AT,
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
    now: FROZEN_AT,
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
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  // One slot, two variants A + B — each with its OWN snapshot (the swipe plane).
  const { messageId, variantId: varA } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A" });
  const varB = castId<MessageVariantId>("variant_swipe_B");
  await db.insert(messageVariants).values({ id: varB, messageId, idx: 1, content: "B", createdAt: FROZEN_AT });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_A"),
    gameId,
    messageId,
    variantId: varA,
    ...emptyState(),
    location: "loc A",
    committed: 1,
    createdAt: FROZEN_AT,
  });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_B"),
    gameId,
    messageId,
    variantId: varB,
    ...emptyState(),
    location: "loc B",
    committed: 0,
    createdAt: FROZEN_AT,
  });

  // The fork copies BOTH variants (a fork at the head carries the whole swipe fan).
  const forkChatId = await seedChat(db, "fork_swipe");
  const { messageId: forkMsg, variantId: forkVarA } = await seedMessage(db, forkChatId, 1, { role: "assistant", content: "A (fork)" });
  const forkVarB = castId<MessageVariantId>("variant_fork_swipe_B");
  await db.insert(messageVariants).values({ id: forkVarB, messageId: forkMsg, idx: 1, content: "B (fork)", createdAt: FROZEN_AT });

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
    createdAt: FROZEN_AT,
  });
  await insertJournalEntry(db, {
    id: castId("rpg_journal_later"),
    gameId: src.gameId,
    type: "event",
    title: "Later",
    content: "past the horizon",
    variantId: laterVar,
    sourceMessageId: laterMsg,
    createdAt: FROZEN_AT,
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
  expect(forkGame?.config.lite.steeringNote).toBe("GM SECRET: Mara betrays the party in act 3");
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
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat" });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>("rpg_snapshot_off"),
    gameId,
    messageId,
    variantId,
    ...emptyState(),
    committed: 1,
    createdAt: FROZEN_AT,
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

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PER-COLUMN / PER-CONFIG-FIELD CLASSIFICATION + THE UNCLASSIFIED-FIELD TRIPWIRES (lane RPGFORK,
// 2026-08-07 — the rpg twin of `chat/verbs/fork.ts`'s inversion).
//
// THE LAW (fork-game.ts): a column readable ONLY through a HOST-GATED surface does not survive the member→host
// fork. rpg's host-only READ surface is exactly `getConfigView` + `revealHidden`; `getGame`/`getTrackerView`/
// `listJournal`/`listCheckpoints`/`listTurnToolCalls` are all `resolveMember`, so every column those five serve
// is already member-readable and copies verbatim.
//
// TWO RATCHETS, because the leak lived at two granularities. The five `fork*Values` builders are typed
// `Required<…$inferInsert>` so a new COLUMN fails `tsc`; but `rpg_games.config` is ONE column holding a dozen
// independently-gated FIELDS, and a table-level allow-list is structurally blind inside it — which is exactly
// how three host-plane config fields rode the copy (`userMacros` bodies + the two hint maps, added after the
// `steeringNote` strip list was written and never re-swept). `stripConfigForForker` is therefore an exhaustive
// literal, and the two shape censuses below are its behavioral twin.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

/** A game macro whose BODY is a GM secret. The member-gated picks pane (`chat.getUserMacroPicks`) projects
 *  name+description+inputs and deliberately WITHHOLDS body/args as prompt content, so a member never reads
 *  this string in the source room — `rpg.getConfigView` (host) is its only caller-facing reader. */
const SECRET_MACRO: UserMacroSpec = {
  name: "gm_twist",
  description: "the act-3 turn",
  args: [],
  body: "GM SECRET: the innkeeper is the assassin's brother",
  inputs: [],
  strict: false,
};

/** The two host-authored steering GLOSS maps — `getConfigView`-only, consumed only into the assembled prompt. */
const RELATIONSHIP_HINTS = { vassal: "GM SECRET: she obeys but will betray him" };
const JOURNAL_TYPE_HINTS = { omen: "GM SECRET: every omen names the traitor" };

/** Every HOST-PLANE field of `rpg_games.config`, paired with the value that proves it did NOT survive a
 *  non-host fork. Accumulated (never a per-field `expect`) so one run names the WHOLE leak set — a per-field
 *  assertion stops at the first and hides the rest of a multi-field regression. */
function configLeaks(config: RpgGameConfig): string[] {
  const leaked: string[] = [];
  if (config.lite.steeringNote !== "") {
    leaked.push("lite.steeringNote");
  }
  if (config.userMacros.length > 0) {
    leaked.push("userMacros");
  }
  if (Object.keys(config.features.relationshipHints).length > 0) {
    leaked.push("features.relationshipHints");
  }
  if (Object.keys(config.features.journalTypeHints).length > 0) {
    leaked.push("features.journalTypeHints");
  }
  return leaked;
}

/** Seed a source game whose config carries EVERY host-plane field populated with a distinctive secret. */
async function seedHostPlaneConfigGame(db: Db, key: string): Promise<{ chatId: ChatId; gameId: RpgGameId; messageId: MessageId; variantId: MessageVariantId }> {
  const gm = await seedUser(db, castId<Handle>(key));
  const chatId = await seedChat(db, `src_cfg_${key}`);
  const gameId = castId<RpgGameId>(`rpg_game_cfg_${key}`);
  const base = liteConfig();
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: gm,
    gmPresetId: null,
    config: {
      ...base,
      lite: { steeringNote: "GM SECRET: Mara betrays the party in act 3" },
      userMacros: [SECRET_MACRO],
      features: { ...base.features, relationshipHints: RELATIONSHIP_HINTS, journalTypeHints: JOURNAL_TYPE_HINTS },
    },
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat one" });
  return { chatId, gameId, messageId, variantId };
}

test("§3.6 config: EVERY host-plane config field is stripped for a NON-HOST forker (the leak set is empty)", async () => {
  const db = await freshDb();
  const src = await seedHostPlaneConfigGame(db, "cfggm");
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "cfg", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const forkConfig = (await findGameByChat(db, forkChatId))?.config as RpgGameConfig;
  // ONE assertion names EVERY field that crossed the member→host boundary. Before the strips landed this read
  // `[ 'userMacros', 'features.relationshipHints', 'features.journalTypeHints' ]`.
  expect(configLeaks(forkConfig)).toEqual([]);
  // …and the secret BYTES are gone, not merely the containers (a shape-only assertion would pass on a
  // half-strip that kept the macro and blanked its name).
  expect(JSON.stringify(forkConfig)).not.toContain("GM SECRET");

  // The SOURCE is untouched — a fork copies, never mutates (and never "fixes" the host's own room).
  const srcConfig = (await findGameByChat(db, src.chatId))?.config as RpgGameConfig;
  expect(configLeaks(srcConfig)).toEqual(["lite.steeringNote", "userMacros", "features.relationshipHints", "features.journalTypeHints"]);
});

test("§3.6 config: a HOST forker carries every host-plane config field verbatim (they already read it all)", async () => {
  const db = await freshDb();
  const src = await seedHostPlaneConfigGame(db, "cfghost");
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "cfgh", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_cfghost"), readsHidden: true },
  });

  const forkConfig = (await findGameByChat(db, forkChatId))?.config as RpgGameConfig;
  expect(forkConfig.lite.steeringNote).toBe("GM SECRET: Mara betrays the party in act 3");
  expect(forkConfig.userMacros).toEqual([SECRET_MACRO]);
  expect(forkConfig.features.relationshipHints).toEqual(RELATIONSHIP_HINTS);
  expect(forkConfig.features.journalTypeHints).toEqual(JOURNAL_TYPE_HINTS);
});

test("§3.6 config: the MEMBER-readable config fields survive the strip (it is a strip, not a reset)", async () => {
  const db = await freshDb();
  const src = await seedHostPlaneConfigGame(db, "cfgkeep");
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "cfgk", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const srcConfig = (await findGameByChat(db, src.chatId))?.config as RpgGameConfig;
  const forkConfig = (await findGameByChat(db, forkChatId))?.config as RpgGameConfig;
  // Everything a member reads through `getGame`/`getTrackerView` — plus the prose-free host-only scalars,
  // whose strip would silently re-tune the fork's own game for zero secrecy gain.
  const carried = {
    ...srcConfig,
    lite: { steeringNote: "" },
    userMacros: [],
    features: { ...srcConfig.features, relationshipHints: {}, journalTypeHints: {} },
  };
  expect(forkConfig).toEqual(carried);
});

/** Seed a source game whose head snapshot holds FIVE beats under a host-set `recentBeatsKeepLast` window. The
 *  member-gated `buildTrackerView` slices to the last `keepLast` (`tracker-view.ts::keepLastBeats`), and
 *  `keepLast` is writable ONLY through the host-gated `updateConfig` — so every beat OUTSIDE the window has no
 *  member-gated reader in the source room at all. */
async function seedBeatWindowGame(
  db: Db,
  key: string,
  keepLast: number,
): Promise<{ chatId: ChatId; gameId: RpgGameId; messageId: MessageId; variantId: MessageVariantId }> {
  const gm = await seedUser(db, castId<Handle>(key));
  const chatId = await seedChat(db, `src_beats_${key}`);
  const gameId = castId<RpgGameId>(`rpg_game_beats_${key}`);
  const base = liteConfig();
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: gm,
    gmPresetId: null,
    config: { ...base, features: { ...base.features, recentBeatsKeepLast: keepLast } },
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat one" });
  await insertSnapshot(db, {
    id: castId<RpgSnapshotId>(`rpg_snapshot_beats_${key}`),
    gameId,
    messageId,
    variantId,
    ...emptyState(),
    // The append-only durable log spans the WHOLE game: the first three beats are distilled from turns that a
    // late-joining, D16-clamped member never read, and the window never showed them either.
    recentEvents: ["beat-1", "beat-2", "beat-3", "beat-4", "beat-5"],
    committed: 1,
    createdAt: FROZEN_AT,
  });
  return { chatId, gameId, messageId, variantId };
}

test("§3.6 beats: a NON-HOST forker carries ONLY the source's member-visible beat window, not the whole log", async () => {
  const db = await freshDb();
  const src = await seedBeatWindowGame(db, "win2", 2);
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "win2", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  // EXACTLY the window `buildTrackerView` served that member in the source. The forker is HOST of the copy and
  // may widen `recentBeatsKeepLast` at will — so anything carried beyond the window IS the leak.
  expect((await listSnapshots(db, fg))[0]?.recentEvents).toEqual(["beat-4", "beat-5"]);
  // The SOURCE keeps its whole durable log (a fork copies, never truncates the room it forked from).
  expect((await listSnapshots(db, src.gameId))[0]?.recentEvents).toHaveLength(5);
});

test("§3.6 beats: `recentBeatsKeepLast: 0` means the member read NO beats — the fork carries none", async () => {
  const db = await freshDb();
  const src = await seedBeatWindowGame(db, "win0", 0);
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "win0", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  // The sharp arm: keepLast 0 drops the whole "Recent beats" block for every member, so the ENTIRE log is
  // host-plane and none of it may cross.
  expect((await listSnapshots(db, fg))[0]?.recentEvents).toEqual([]);
});

test("§3.6 beats: a HOST forker carries the WHOLE durable log (the window never gated them)", async () => {
  const db = await freshDb();
  const src = await seedBeatWindowGame(db, "winhost", 2);
  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "winhost", src);

  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: src.chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_winhost"), readsHidden: true },
  });

  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  expect((await listSnapshots(db, fg))[0]?.recentEvents).toEqual(["beat-1", "beat-2", "beat-3", "beat-4", "beat-5"]);
});

test("EVERY rpg column is classified — a new column lands in its fork*Values or the copy takes it blind", () => {
  // Read off the LIVE drizzle tables, so a schema addition reds here even if the `tsc` ratchet in fork-game.ts
  // were worked around (a cast, a widened type). Two-sided: a dropped column reds too.
  expect(Object.keys(getTableColumns(rpgGames)).sort()).toEqual(
    ["id", "chatId", "mode", "status", "sessionNumber", "gmUserId", "gmPresetId", "config", "createdAt", "updatedAt"].sort(),
  );
  expect(Object.keys(getTableColumns(rpgSheets)).sort()).toEqual(["id", "gameId", "characterId", "userId", "sheet", "createdAt", "updatedAt"].sort());
  expect(Object.keys(getTableColumns(rpgSnapshots)).sort()).toEqual(
    [
      "id",
      "gameId",
      "messageId",
      "variantId",
      "asOfMessageId",
      "clock",
      "calendarDate",
      "location",
      "weather",
      "presentCharacters",
      "recentEvents",
      "actorState",
      "trackerValues",
      "quests",
      "plot",
      "fieldLocks",
      "committed",
      "createdAt",
    ].sort(),
  );
  expect(Object.keys(getTableColumns(rpgJournal)).sort()).toEqual(
    ["id", "gameId", "type", "label", "title", "content", "variantId", "sourceMessageId", "createdAt"].sort(),
  );
  expect(Object.keys(getTableColumns(rpgCheckpoints)).sort()).toEqual(["id", "gameId", "snapshotId", "label", "trigger", "createdAt"].sort());
});

/** The DROPPED arm of the allow-list's own failure mode (the class that lost `chats.userMacroValues` on the
 *  chat fork): a builder that simply omits a COPIED column type-checks fine and silently nulls real data. This
 *  census populates EVERY nullable column of the four row planes with a distinctive value and compares the copy
 *  field-by-field, ACCUMULATING offenders so one run names the whole regression. */
function droppedColumns(src: Record<string, unknown>, copy: Record<string, unknown>, copied: readonly string[]): string[] {
  return copied.filter((column) => JSON.stringify(copy[column]) !== JSON.stringify(src[column]));
}

test("no COPIED column is silently dropped — every populated row-plane column survives the fork", async () => {
  const db = await freshDb();
  const gm = await seedUser(db, castId<Handle>("censusgm"));
  const chatId = await seedChat(db, "src_census");
  const gameId = castId<RpgGameId>("rpg_game_census");
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 7, // NOT the born default — a dropped counter would read 1 and look plausible.
    gmUserId: gm,
    gmPresetId: null,
    config: liteConfig(),
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat one" });
  // EVERY nullable snapshot column populated distinctively (a null-vs-value copy bug is otherwise invisible).
  const snapshotId = castId<RpgSnapshotId>("rpg_snapshot_census");
  await insertSnapshot(db, {
    id: snapshotId,
    gameId,
    messageId,
    variantId,
    asOfMessageId: null,
    clock: { day: 4, hour: 21, minute: 30 },
    calendarDate: "3rd of Frostmoon",
    location: "the drowned chapel",
    weather: { type: "rain", label: "torrential sleet" },
    presentCharacters: ["cast:mara"],
    recentEvents: ["the bell rang twice"],
    actorState: [actorWithWallet("mara", 12, 3)],
    trackerValues: { morale: { value: 4, items: null, max: 10 } },
    quests: [quest("ford", { name: "Cross the ford" })],
    plot: { act: 2, title: "The reckoning", acts: [{ title: "Arrival", summary: "s1" }] },
    fieldLocks: { "ambient.location": true },
    committed: 1,
    createdAt: FROZEN_AT,
  });
  await insertJournalEntry(db, {
    id: castId("rpg_journal_census"),
    gameId,
    type: "custom",
    label: "omen", // the R4c free gloss — born "" on the built-ins, so a drop hides behind the default
    title: "The bell",
    content: "It rang twice.",
    variantId,
    sourceMessageId: messageId,
    createdAt: FROZEN_AT,
  });
  await upsertSheet(db, {
    id: castId("rpg_sheet_census"),
    gameId,
    characterId: null,
    userId: gm,
    sheet: { className: "Warden", attributes: { grit: 3 }, flavor: "scarred", level: 5, trackerGrants: ["bound_will"], trackerRevokes: ["morale"] },
    now: FROZEN_AT,
  });
  await insertCheckpoint(db, { id: castId("rpg_checkpoint_census"), gameId, snapshotId, label: "the ford", trigger: "manual", createdAt: FROZEN_AT });

  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "census", { messageId, variantId });
  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const srcGame = await findGameByChat(db, chatId);
  const forkGame = await findGameByChat(db, forkChatId);
  const fg = forkGame?.id as RpgGameId;
  // rpg_games — `gmUserId` is deliberately nulled (lite is seatless) and `gmPresetId`/`config` have their own
  // gates, so the COPIED set is what is left.
  expect(droppedColumns({ ...srcGame }, { ...forkGame }, ["mode", "status", "sessionNumber"])).toEqual([]);
  // rpg_snapshots — every state column but the hidden-span-belted `recentEvents` (proven by its own test).
  const srcSnap = (await listSnapshots(db, gameId))[0];
  const forkSnap = (await listSnapshots(db, fg))[0];
  expect(
    droppedColumns({ ...srcSnap }, { ...forkSnap }, [
      "clock",
      "calendarDate",
      "location",
      "weather",
      "presentCharacters",
      "actorState",
      "trackerValues",
      "quests",
      "plot",
      "fieldLocks",
      "committed",
    ]),
  ).toEqual([]);
  // rpg_journal — `content` runs the belt (its own test); the other three are member-readable via listJournal.
  const srcJournal = (await listAllJournal(db, gameId))[0];
  const forkJournal = (await listAllJournal(db, fg))[0];
  expect(droppedColumns({ ...srcJournal }, { ...forkJournal }, ["type", "label", "title"])).toEqual([]);
  // rpg_sheets — the whole sheet blob is member-projected by getTrackerView, so it copies whole.
  const srcSheet = (await listSheets(db, gameId))[0];
  const forkSheet = (await listSheets(db, fg))[0];
  expect(droppedColumns({ ...srcSheet }, { ...forkSheet }, ["characterId", "userId", "sheet"])).toEqual([]);
  // rpg_checkpoints — label + trigger are on the member-gated listCheckpoints row.
  const srcCp = (await listCheckpoints(db, gameId))[0];
  const forkCp = (await listCheckpoints(db, fg))[0];
  expect(droppedColumns({ ...srcCp }, { ...forkCp }, ["label", "trigger"])).toEqual([]);
});

test("EVERY rpg_games.config FIELD is classified — the ratchet the table-level allow-list cannot see", () => {
  // `config` is ONE column: `Required<typeof rpgGames.$inferInsert>` proves the column is named and proves
  // NOTHING about what is inside it. This census is the blob's own tripwire, read off the LIVE zod shapes, so
  // a new field must be classified in `stripConfigForForker`/`stripFeaturesForForker` before it can ship.
  expect(Object.keys(rpgGameConfigSchema.shape).sort()).toEqual(
    [
      "engaged",
      "statProfile",
      "trackers",
      "lite",
      "extractionMode",
      "extractionContext",
      "extractionWindowTokens",
      "reconcileEveryBeats",
      "dateMode",
      "features",
      "userMacros",
      "prose",
    ].sort(),
  );
  expect(Object.keys(rpgGameFeaturesSchema.shape).sort()).toEqual(
    [
      "relationshipHints",
      "journalTypeHints",
      "deception",
      "omniscience",
      "hiddenContentReveal",
      "recentBeatsKeepLast",
      "immersiveHtml",
      "immersiveHtmlInteractive",
      "cardKeepLastX",
      "cyoa",
      "cyoaChoiceBehavior",
      "plotProgression",
    ].sort(),
  );
});

test("a NON-GAME source is a no-op (cloned:false), no pointer — the fork stays plain", async () => {
  const db = await freshDb();
  const plain = await seedChat(db, "plain_src");
  const forkChatId = await seedChat(db, "fork_plain");

  const h = makeRpgService(db);
  const result = await h.chatOps.forkGame({
    sourceChatId: plain,
    newChatId: forkChatId,
    slotIdMap: new Map<MessageId, MessageId>(),
    variantIdMap: new Map<MessageVariantId, MessageVariantId>(),
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  expect(result.cloned).toBe(false);
  expect(await findGameByChat(db, forkChatId)).toBeUndefined();
  expect(h.fakes.pointers).toHaveLength(0);
});
