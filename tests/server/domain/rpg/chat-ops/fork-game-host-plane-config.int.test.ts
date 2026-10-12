// chat-ops/fork-game — §3.6: every host-plane config field and every beyond-window beat is stripped for a NON-HOST forker, and a HOST forker carries them verbatim.

import type { UserMacroSpec } from "@orb/contracts/preset";
import type { RpgGameConfig } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { emptyState, expect, liteConfig, makeRpgService, seedChat, seedMessage, seedUser, test } from "../_support.ts";
import { findGameByChat, insertGame, insertSnapshot, listSnapshots, seedForkTarget } from "./_fork-game-support.ts";

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
      lite: { steeringNote: "GM SECRET: Mira betrays the party in act 3" },
      userMacros: [SECRET_MACRO],
      features: { ...base.features, relationshipHints: RELATIONSHIP_HINTS, journalTypeHints: JOURNAL_TYPE_HINTS },
    },
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
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

  // @orb-waive no-test-fabrication(RpgGameConfig): baselined when the gate widened to value casts; burn-down item 906.
  const forkConfig = (await findGameByChat(db, forkChatId))?.config as RpgGameConfig;
  // ONE assertion names EVERY field that crossed the member→host boundary. Before the strips landed this read
  // `[ 'userMacros', 'features.relationshipHints', 'features.journalTypeHints' ]`.
  expect(configLeaks(forkConfig)).toEqual([]);
  // …and the secret BYTES are gone, not merely the containers (a shape-only assertion would pass on a
  // half-strip that kept the macro and blanked its name).
  expect(JSON.stringify(forkConfig)).not.toContain("GM SECRET");

  // The SOURCE is untouched — a fork copies, never mutates (and never "fixes" the host's own room).
  // @orb-waive no-test-fabrication(RpgGameConfig): baselined when the gate widened to value casts; burn-down item 906.
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

  // @orb-waive no-test-fabrication(RpgGameConfig): baselined when the gate widened to value casts; burn-down item 906.
  const forkConfig = (await findGameByChat(db, forkChatId))?.config as RpgGameConfig;
  expect(forkConfig.lite.steeringNote).toBe("GM SECRET: Mira betrays the party in act 3");
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

  // @orb-waive no-test-fabrication(RpgGameConfig): baselined when the gate widened to value casts; burn-down item 906.
  const srcConfig = (await findGameByChat(db, src.chatId))?.config as RpgGameConfig;
  // @orb-waive no-test-fabrication(RpgGameConfig): baselined when the gate widened to value casts; burn-down item 906.
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
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
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
    createdAt: FROZEN_AT_MS,
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

  // @orb-waive no-test-fabrication(RpgGameId): baselined when the gate widened to value casts; burn-down item 906.
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

  // @orb-waive no-test-fabrication(RpgGameId): baselined when the gate widened to value casts; burn-down item 906.
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

  // @orb-waive no-test-fabrication(RpgGameId): baselined when the gate widened to value casts; burn-down item 906.
  const fg = (await findGameByChat(db, forkChatId))?.id as RpgGameId;
  expect((await listSnapshots(db, fg))[0]?.recentEvents).toEqual(["beat-1", "beat-2", "beat-3", "beat-4", "beat-5"]);
});
