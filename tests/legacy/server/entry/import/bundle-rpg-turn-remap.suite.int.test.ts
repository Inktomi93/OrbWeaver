// entry/import: a full-library bundle round-trip with two rpg-anchored turns, each remapping to its own restored (message, variant).

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import "@orb/testkit/node/composed-real.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import {
  chatParticipants,
  chats as chatsTable,
  messages as messagesTable,
  messageVariants,
  rpgGames,
  rpgJournal,
  rpgSnapshots,
  rpgTurnToolCalls,
} from "@orb/db";
import type {
  CharacterHandle,
  ChatId,
  ChatParticipantId,
  Handle,
  MessageId,
  MessageVariantId,
  RpgGameId,
  RpgJournalId,
  RpgSnapshotId,
  RpgTurnToolCallsId,
  UserId,
  WorkloadId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { loadWorkload, runWorkload } from "#server/domain/workloads/index.ts";
import { loadRunnableWorkload, makeRunnerDeps } from "../../domain/workloads/_support.ts";
import { bundleHandler, libraryHandler, makeCtx, principalOf } from "./_bundle-support.ts";

// This suite builds TWO full service graphs (source `app` fixture + a fresh target box) and drives a real
// workload — it passes warm in ~2-3 s but exceeds vitest's 5 s default under parallel CPU contention. A
// generous per-suite timeout keeps CI from flaking on scheduling, not on real work.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe("P-8: the full-library bundle remaps rpg-anchored turns per turn, never cross-linked", () => {
  // The single-turn P-8 test above proves the remap resolves to SOME variant of the restored chat, but with
  // only one turn in the fixture a bug that mapped every plane onto "the chat's one variant" (ignoring the
  // per-turn position entirely) would pass it too. Two rpg-anchored turns, each with its own snapshot /
  // journal / turn-tool-call refs, is the only way to catch a CROSS-LINK regression — turn A's planes landing
  // on turn B's restored (message, variant) id, or vice versa — rather than reading the positional-index
  // logic and trusting it.
  test("two rpg-anchored turns each remap to their OWN restored (message, variant) — never cross-linked", async ({ db, app, clock, importStagingDir }) => {
    const sourceOwnerId = castId<UserId>("user_r6_2turn_source_owner");
    await seedUser(db, { id: sourceOwnerId, handle: castId<Handle>("r6-2turn-source-owner") });
    const owner = principalOf(sourceOwnerId);

    // NB: the character's HANDLE does not travel through the card format (a card carries only the NAME) — the
    // import verb re-derives it via `slugifyHandle(name)` (`substrate/card.ts`). The name is chosen so its
    // slug is exactly "hero-2t", matching the seeded handle below (both source-side reads and the round trip
    // rely on the SAME handle, never on the display name).
    const character = await seedCharacter(db, {
      ownerId: sourceOwnerId,
      handle: castId<CharacterHandle>("hero-2t"),
      name: "Hero 2T",
    });

    const chatId = castId<ChatId>("chat_r6_2turn");
    await db.insert(chatsTable).values({
      id: chatId,
      title: "R6 Two-Turn Chat",
      starred: false,
      archived: false,
      temporary: false,
      pendingHostUserId: null,
      anchorPersonaId: null,
      parentChatId: null,
      forkedAt: null,
      compactSummary: null,
      compactedAtSeq: null,
      metadata: {},
      variableValues: {},
      runtimeVariables: {},
      importedFrom: null,
      importHash: null,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(chatParticipants).values([
      {
        id: castId<ChatParticipantId>("chatpart_r6_2turn_host"),
        chatId,
        kind: "human",
        userId: sourceOwnerId,
        role: "host",
        joinedAt: clock.now(),
        joinSeq: 0,
      },
      {
        id: castId<ChatParticipantId>("chatpart_r6_2turn_char"),
        chatId,
        kind: "character",
        characterId: character.id,
        role: "member",
        joinedAt: clock.now(),
        joinSeq: 1,
      },
    ]);

    // Two turns, each its own message + variant, distinguished by CONTENT (which travels verbatim, D51) so
    // the fresh box's per-turn ids can be resolved back to "which turn" without relying on the remap itself.
    const msgAId = castId<MessageId>("msg_r6_2turn_a");
    const msgBId = castId<MessageId>("msg_r6_2turn_b");
    const varAId = castId<MessageVariantId>("msgvar_r6_2turn_a");
    const varBId = castId<MessageVariantId>("msgvar_r6_2turn_b");
    await db.insert(messagesTable).values([
      {
        id: msgAId,
        chatId,
        seq: 1,
        role: "assistant",
        authorUserId: null,
        characterId: character.id,
        personaId: null,
        selectedVariantId: null,
        excludedFromPrompt: false,
        createdAt: clock.now(),
        editedAt: null,
      },
      {
        id: msgBId,
        chatId,
        seq: 2,
        role: "assistant",
        authorUserId: null,
        characterId: character.id,
        personaId: null,
        selectedVariantId: null,
        excludedFromPrompt: false,
        createdAt: clock.now(),
        editedAt: null,
      },
    ]);
    await db.insert(messageVariants).values([
      { id: varAId, messageId: msgAId, idx: 0, content: "Turn one begins.", createdAt: clock.now() },
      { id: varBId, messageId: msgBId, idx: 0, content: "Turn two continues.", createdAt: clock.now() },
    ]);
    await db.update(messagesTable).set({ selectedVariantId: varAId }).where(eq(messagesTable.id, msgAId));
    await db.update(messagesTable).set({ selectedVariantId: varBId }).where(eq(messagesTable.id, msgBId));

    const gameId = castId<RpgGameId>("rpg_game_r6_2turn");
    const snapAId = castId<RpgSnapshotId>("rpg_snapshot_r6_2turn_a");
    const snapBId = castId<RpgSnapshotId>("rpg_snapshot_r6_2turn_b");
    await db.insert(rpgGames).values({
      id: gameId,
      chatId,
      mode: "lite",
      status: "active",
      sessionNumber: 1,
      config: rpgGameConfigSchema.parse({}),
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(rpgSnapshots).values([
      { id: snapAId, gameId, messageId: msgAId, variantId: varAId, asOfMessageId: null, location: "loc-turn-a", committed: 1, createdAt: clock.now() },
      { id: snapBId, gameId, messageId: msgBId, variantId: varBId, asOfMessageId: null, location: "loc-turn-b", committed: 1, createdAt: clock.now() },
    ]);
    await db.insert(rpgJournal).values([
      {
        id: castId<RpgJournalId>("rpg_journal_r6_2turn_a"),
        gameId,
        type: "event",
        label: "",
        title: "Journal Turn A",
        content: "First turn's event.",
        variantId: varAId,
        sourceMessageId: msgAId,
        createdAt: clock.now(),
      },
      {
        id: castId<RpgJournalId>("rpg_journal_r6_2turn_b"),
        gameId,
        type: "event",
        label: "",
        title: "Journal Turn B",
        content: "Second turn's event.",
        variantId: varBId,
        sourceMessageId: msgBId,
        createdAt: clock.now(),
      },
    ]);
    await db.insert(rpgTurnToolCalls).values([
      {
        id: castId<RpgTurnToolCallsId>("rpg_ttc_r6_2turn_a"),
        gameId,
        messageId: msgAId,
        variantId: varAId,
        calls: [{ name: "action_a", args: "{}", verdict: "applied", issues: [] }],
        createdAt: clock.now(),
      },
      {
        id: castId<RpgTurnToolCallsId>("rpg_ttc_r6_2turn_b"),
        gameId,
        messageId: msgBId,
        variantId: varBId,
        calls: [{ name: "action_b", args: "{}", verdict: "applied", issues: [] }],
        createdAt: clock.now(),
      },
    ]);

    // ── EXPORT the full library through the real route ─────────────────────────────────────────────────
    const exportH = libraryHandler({ export: app.exportService, registry: app.portability });
    const zip = new Uint8Array(await (await exportH(makeCtx(owner))).arrayBuffer());
    expect(zip.byteLength).toBeGreaterThan(0);

    // ── IMPORT into a FRESH box (new db + new CAS + new owner) ─────────────────────────────────────────
    const { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } = await import("@orb/server/entry/compose");
    const freshDatabase = await freshDb();
    const casDir = await mkdtemp(join(tmpdir(), "orb-r6-2turn-cas-"));
    const variantDir = await mkdtemp(join(tmpdir(), "orb-r6-2turn-var-"));
    const targetId = castId<UserId>("user_r6_2turn_target_owner");
    await seedUser(freshDatabase, { id: targetId, handle: castId<Handle>("r6-2turn-target-owner") });
    const target = principalOf(targetId);
    try {
      const fresh = await createServices({
        serverRestart: UNSUPERVISED_RESTART,
        share: NO_SHARE_RELAY,
        db: freshDatabase,
        now: (): number => clock.now(),
        ownerId: targetId,
        secretBoxKey: null,
        casDir,
        variantDir,
        importStagingDir,
        sessionSecret: "test-session-secret-at-least-32-chars",
      });

      const importH = bundleHandler({ workloads: fresh.services.workloads, stagingDir: importStagingDir });
      const req = new Request("http://t/api/import/bundle", { method: "POST", body: zip });
      const res = await importH(makeCtx(target, req));
      expect(res.status).toBe(202);
      // @orb-waive no-test-fabrication({ workloadId: WorkloadId }): baselined when the gate widened to value casts; burn-down item 906.
      const { workloadId } = (await res.json()) as { workloadId: WorkloadId };
      const row = await loadRunnableWorkload(freshDatabase, fresh.workloadContributions, workloadId);
      await runWorkload(makeRunnerDeps(freshDatabase, fresh.workloadContributions), row, new AbortController().signal);
      const done = await loadWorkload(freshDatabase, fresh.workloadContributions, workloadId);
      expect(done?.status).toBe("succeeded");
      // @orb-waive no-test-fabrication({ imported: number; skipped: number; failed: number }): baselined when the gate widened to value casts; burn-down item 906.
      const report = done?.result as { imported: number; skipped: number; failed: number };
      expect(report.failed).toBe(0);

      // ── Resolve "which restored turn is which" INDEPENDENTLY of the remap under test, via the CONTENT ──
      const freshHostSeat = await freshDatabase
        .select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.userId, targetId), eq(chatParticipants.role, "host")));
      expect(freshHostSeat).toHaveLength(1);
      const freshChatId = freshHostSeat[0]?.chatId ?? castId<ChatId>("none");

      const freshVariants = await freshDatabase
        .select({ id: messageVariants.id, messageId: messageVariants.messageId, content: messageVariants.content })
        .from(messageVariants)
        .innerJoin(messagesTable, eq(messagesTable.id, messageVariants.messageId))
        .where(eq(messagesTable.chatId, freshChatId));
      expect(freshVariants).toHaveLength(2);
      const turnA = freshVariants.find((v) => v.content === "Turn one begins.");
      const turnB = freshVariants.find((v) => v.content === "Turn two continues.");
      expect(turnA).toBeDefined();
      expect(turnB).toBeDefined();
      const freshVarAId = turnA?.id;
      const freshVarBId = turnB?.id;
      const freshMsgAId = turnA?.messageId;
      const freshMsgBId = turnB?.messageId;
      // Genuinely new + genuinely distinct ids — otherwise the assertions below could pass trivially.
      expect(freshVarAId).not.toBe(varAId);
      expect(freshVarBId).not.toBe(varBId);
      expect(freshVarAId).not.toBe(freshVarBId);
      expect(freshMsgAId).not.toBe(freshMsgBId);

      const freshGames = await freshDatabase.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, freshChatId));
      expect(freshGames).toHaveLength(1);
      const freshGameId = freshGames[0]?.id ?? castId<RpgGameId>("none");

      // THE CROSS-LINK PROOF. Each plane must anchor to its OWN restored turn — snapshot/journal/tool-call
      // "A" (identified by its distinct value) must point at turn A's restored ids and explicitly NOT at
      // turn B's, and vice versa. A positional-index bug that swapped or collapsed the two turns fails these.
      const freshSnapshots = await freshDatabase
        .select({ location: rpgSnapshots.location, messageId: rpgSnapshots.messageId, variantId: rpgSnapshots.variantId })
        .from(rpgSnapshots)
        .where(eq(rpgSnapshots.gameId, freshGameId));
      expect(freshSnapshots).toHaveLength(2);
      const snapA = freshSnapshots.find((s) => s.location === "loc-turn-a");
      const snapB = freshSnapshots.find((s) => s.location === "loc-turn-b");
      expect(snapA?.messageId).toBe(freshMsgAId);
      expect(snapA?.variantId).toBe(freshVarAId);
      expect(snapA?.messageId).not.toBe(freshMsgBId);
      expect(snapA?.variantId).not.toBe(freshVarBId);
      expect(snapB?.messageId).toBe(freshMsgBId);
      expect(snapB?.variantId).toBe(freshVarBId);
      expect(snapB?.messageId).not.toBe(freshMsgAId);
      expect(snapB?.variantId).not.toBe(freshVarAId);

      const freshJournal = await freshDatabase
        .select({ title: rpgJournal.title, variantId: rpgJournal.variantId, sourceMessageId: rpgJournal.sourceMessageId })
        .from(rpgJournal)
        .where(eq(rpgJournal.gameId, freshGameId));
      expect(freshJournal).toHaveLength(2);
      const journalA = freshJournal.find((j) => j.title === "Journal Turn A");
      const journalB = freshJournal.find((j) => j.title === "Journal Turn B");
      expect(journalA?.sourceMessageId).toBe(freshMsgAId);
      expect(journalA?.variantId).toBe(freshVarAId);
      expect(journalA?.sourceMessageId).not.toBe(freshMsgBId);
      expect(journalA?.variantId).not.toBe(freshVarBId);
      expect(journalB?.sourceMessageId).toBe(freshMsgBId);
      expect(journalB?.variantId).toBe(freshVarBId);
      expect(journalB?.sourceMessageId).not.toBe(freshMsgAId);
      expect(journalB?.variantId).not.toBe(freshVarAId);

      const freshToolCalls = await freshDatabase
        .select({ messageId: rpgTurnToolCalls.messageId, variantId: rpgTurnToolCalls.variantId, calls: rpgTurnToolCalls.calls })
        .from(rpgTurnToolCalls)
        .where(eq(rpgTurnToolCalls.gameId, freshGameId));
      expect(freshToolCalls).toHaveLength(2);
      const ttcA = freshToolCalls.find((t) => t.calls[0]?.name === "action_a");
      const ttcB = freshToolCalls.find((t) => t.calls[0]?.name === "action_b");
      expect(ttcA?.messageId).toBe(freshMsgAId);
      expect(ttcA?.variantId).toBe(freshVarAId);
      expect(ttcA?.messageId).not.toBe(freshMsgBId);
      expect(ttcA?.variantId).not.toBe(freshVarBId);
      expect(ttcB?.messageId).toBe(freshMsgBId);
      expect(ttcB?.variantId).toBe(freshVarBId);
      expect(ttcB?.messageId).not.toBe(freshMsgAId);
      expect(ttcB?.variantId).not.toBe(freshVarAId);
    } finally {
      await rm(casDir, { recursive: true, force: true });
      await rm(variantDir, { recursive: true, force: true });
    }
  });
});
