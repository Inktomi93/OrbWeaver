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

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { isDeceptionActive } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messageVariants, presets } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, PresetId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { insertCheckpoint, listCheckpoints } from "../../../../../packages/server/src/domain/rpg/persistence/checkpoints";
import { findGameByChat, insertGame, updateGame } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { insertJournalEntry, listAllJournal } from "../../../../../packages/server/src/domain/rpg/persistence/journal";
import { listSheets, upsertSheet } from "../../../../../packages/server/src/domain/rpg/persistence/sheets";
import { insertSnapshot, listSnapshots } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { insertWidget, listWidgets } from "../../../../../packages/server/src/domain/rpg/persistence/widgets";
import { freshDb } from "../../../../support/db";
import { emptyState, expect, FROZEN_AT, liteConfig, makeRpgService, seedChat, seedMessage, seedUser, test } from "../_support";

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
  const gm = await seedUser(db, gmHandle);
  const chatId = await seedChat(db, `src_${gmHandle}`);
  const gameId = castId<RpgGameId>(`rpg_game_src_${gmHandle}`);
  const config = {
    ...liteConfig(),
    lite: { steeringNote: "GM SECRET: Mara betrays the party in act 3" },
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
    sheet: { className: "Rogue", attributes: {}, poolDefs: [], maxHp: 10, flavor: "", level: 3 },
    now: FROZEN_AT,
  });
  await insertWidget(db, {
    id: castId(`rpg_widget_src_${gmHandle}`),
    gameId,
    def: { type: "counter", label: "Torches", icon: null, position: "sidebar", accent: null, sort: 0, binding: { source: "custom", subjectName: "torches" } },
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

  // Sheets/widgets/journal/checkpoints all key the fork game.
  expect((await listSheets(db, fg)).every((r) => r.gameId === fg)).toBe(true);
  expect((await listWidgets(db, fg)).every((r) => r.gameId === fg)).toBe(true);
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
  const gm = await seedUser(db, "gm");
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
  const mallory = await seedUser(db, "mallory");
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
  const gm = await seedUser(db, "gm");
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
