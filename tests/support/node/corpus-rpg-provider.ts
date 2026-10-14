// Provider-backed captures use admitted owner connections; only raw external replies are scripted.
import { createCharacterSchema } from "@orb/contracts/character";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type { UserConnectionId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { eq } from "drizzle-orm";
import { CORPUS_RPG_CARD_NAME, CORPUS_RPG_FOLDED_INPUT, CORPUS_RPG_REBUILT_BEAT } from "./corpus-rpg-wire.ts";
import { captureRpgSnapshot, captureRpgTurnToolCalls, seedRpgCheckpoint, seedRpgGame } from "./factories/rpg.ts";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Tracker = Awaited<ReturnType<CorpusCaller["rpg"]["getTrackerView"]>>;
interface CorpusRpgRows {
  readonly sheets: readonly (typeof rpgSheets.$inferSelect)[];
  readonly snapshots: readonly (typeof rpgSnapshots.$inferSelect)[];
  readonly journal: readonly (typeof rpgJournal.$inferSelect)[];
}
interface SeededCorpusRpgProvider {
  readonly character: Awaited<ReturnType<CorpusCaller["character"]["create"]>>;
  readonly game: Awaited<ReturnType<typeof seedRpgGame>>;
  readonly populate: Awaited<ReturnType<CorpusCaller["rpg"]["populateFromCharacter"]>>;
  readonly populated: Tracker;
  readonly populatedRows: CorpusRpgRows;
  readonly absorbed: Awaited<ReturnType<CorpusCaller["rpg"]["populateFromCharacter"]>>;
  readonly absorbedRows: CorpusRpgRows;
  readonly firstResync: Awaited<ReturnType<CorpusCaller["rpg"]["resyncFromStory"]>>;
  readonly firstRebuilt: Tracker;
  readonly secondResync: Awaited<ReturnType<CorpusCaller["rpg"]["resyncFromStory"]>>;
  readonly secondRebuilt: Tracker;
  readonly toolResync: Awaited<ReturnType<CorpusCaller["rpg"]["resyncFromStory"]>>;
  readonly toolRebuilt: Tracker;
  readonly quietResync: Awaited<ReturnType<CorpusCaller["rpg"]["resyncFromStory"]>>;
  readonly beforeQuietRows: CorpusRpgRows;
  readonly quietRows: CorpusRpgRows;
  readonly beforeFoldRows: CorpusRpgRows;
  readonly turn: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
  readonly folded: Tracker;
  readonly foldedRows: CorpusRpgRows;
  readonly calls: Awaited<ReturnType<typeof captureRpgTurnToolCalls>>;
  readonly checkpoint: Awaited<ReturnType<typeof seedRpgCheckpoint>>;
  readonly snapshot: Awaited<ReturnType<typeof captureRpgSnapshot>>;
  readonly journal: Awaited<ReturnType<CorpusCaller["rpg"]["listJournal"]>>;
}

async function captureRows(root: ServerTestHarness, gameId: SeededCorpusRpgProvider["game"]["id"]): Promise<CorpusRpgRows> {
  const [sheets, snapshots, journal] = await Promise.all([
    root.db.select().from(rpgSheets).where(eq(rpgSheets.gameId, gameId)).orderBy(rpgSheets.id),
    root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId)).orderBy(rpgSnapshots.id),
    root.db.select().from(rpgJournal).where(eq(rpgJournal.gameId, gameId)).orderBy(rpgJournal.id),
  ]);
  return { sheets, snapshots, journal };
}

/** Resolve, populate, reconcile and fold through the actual root; no writer or execution actor is replaced. */
export async function seedCorpusRpgProvider(root: ServerTestHarness, connectionId: UserConnectionId): Promise<SeededCorpusRpgProvider> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Provider RPG corpus", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  await caller.connection.setBinding({ task: "chat", connectionId });
  const connection = await root.services.connection.get({ principal, connectionId });
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "corpus-rpg-provider",
      name: CORPUS_RPG_CARD_NAME,
      description: "An artificer carrying a loom shuttle and seven credits repairs the orbital loom.",
    }),
  });
  const { chat } = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const chatId = chat.id;
  const params = { principal, chatId };
  const game = await seedRpgGame(root.db, root.services.rpg.createGame, { ...params, mode: "lite" });
  const actorRef = { kind: "character", characterId: character.id } as const;
  const populate = await caller.rpg.populateFromCharacter({ chatId, actorRef });
  const populated = await caller.rpg.getTrackerView({ chatId });
  const populatedRows = await captureRows(root, game.id);
  await caller.rpg.patchSheet({ chatId, actorRef, patch: { className: "Host-tuned artificer", level: 4 } });
  const absorbed = await caller.rpg.populateFromCharacter({ chatId, actorRef });
  const absorbedRows = await captureRows(root, game.id);
  await caller.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: CORPUS_RPG_REBUILT_BEAT });
  await caller.rpg.editSnapshot({ chatId, patch: { location: "Hand-pinned loom" } });
  const firstResync = await caller.rpg.resyncFromStory({ chatId });
  const firstRebuilt = await caller.rpg.getTrackerView({ chatId });
  const secondResync = await caller.rpg.resyncFromStory({ chatId });
  const secondRebuilt = await caller.rpg.getTrackerView({ chatId });
  await caller.rpg.editSnapshot({ chatId, patch: {}, releaseLocks: ["location"] });
  await root.services.connection.update({
    principal,
    connectionId,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...connection.declared,
        generation: { ...connection.declared?.generation, tools: { parallel: true, silencesProse: false, requiredChoice: true } },
      }),
    },
  });
  const toolResync = await caller.rpg.resyncFromStory({ chatId });
  const toolRebuilt = await caller.rpg.getTrackerView({ chatId });
  const beforeQuietRows = await captureRows(root, game.id);
  const quietResync = await caller.rpg.resyncFromStory({ chatId });
  const quietRows = await captureRows(root, game.id);
  if (quietRows.snapshots.length !== beforeQuietRows.snapshots.length) {
    throw new Error("native no_changes resync unexpectedly wrote another snapshot");
  }
  await caller.rpg.editSnapshot({ chatId, patch: { weather: { type: "rain", label: "Hand-pinned rain" } } });
  const beforeFoldRows = await captureRows(root, game.id);
  const turn = await root.services.chat.send({
    principal,
    chatId,
    content: CORPUS_RPG_FOLDED_INPUT,
    intent: { maxContextTokens: 32_000, maxOutputTokens: 128 },
  });
  if (turn.aborted || turn.messages.length === 0) {
    throw new Error("native folded corpus turn produced no completed assistant variant");
  }
  await root.settleBackground();
  const folded = await caller.rpg.getTrackerView({ chatId });
  const foldedRows = await captureRows(root, game.id);
  const variants = turn.messages.filter((message) => message.role === "assistant").map((message) => message.selectedVariantId);
  const calls = await captureRpgTurnToolCalls(root.db, game.id, variants);
  const checkpoint = await seedRpgCheckpoint(root.db, root.services.rpg.createCheckpoint, { ...params, label: "Folded loom" });
  const snapshot = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  const journal = await caller.rpg.listJournal({ chatId });
  return {
    character,
    game,
    populate,
    populated,
    populatedRows,
    absorbed,
    absorbedRows,
    firstResync,
    firstRebuilt,
    secondResync,
    secondRebuilt,
    toolResync,
    toolRebuilt,
    quietResync,
    beforeQuietRows,
    quietRows,
    beforeFoldRows,
    turn,
    folded,
    foldedRows,
    calls,
    checkpoint,
    snapshot,
    journal,
  };
}
