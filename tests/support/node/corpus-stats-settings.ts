// Native analytics and settings captures reuse retained canon; none of these private rows are portable data.

import { createCharacterSchema } from "@orb/contracts/character";
import type { PortableFile } from "@orb/contracts/portability";
import { STATS_LIST_MAX_LIMIT } from "@orb/contracts/stats";
import { auditLogs, themes, userSettings } from "@orb/db";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { CorpusRead } from "../iso/corpus.ts";
import { seedStats } from "./factories/stats.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "./route-trpc.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

interface HistoryReferences {
  readonly characterId: CharacterId;
  readonly personaId: PersonaId;
  readonly foreignUserId: UserId;
}

interface StatsReads {
  readonly overview: CorpusRead<"stats.overview">;
  readonly character: CorpusRead<"stats.character">;
  readonly leaderboard: CorpusRead<"stats.leaderboard">;
  readonly capped: CorpusRead<"stats.leaderboard">;
  readonly searched: CorpusRead<"stats.leaderboard">;
  readonly missingSearch: CorpusRead<"stats.leaderboard">;
  readonly timeseries: CorpusRead<"stats.timeseries">;
  readonly boundary: CorpusRead<"stats.timeseries">;
  readonly outside: CorpusRead<"stats.timeseries">;
  readonly byModel: CorpusRead<"stats.byModel">;
  readonly modelCapped: CorpusRead<"stats.byModel">;
  readonly freshness: CorpusRead<"stats.freshness">;
  readonly personas: CorpusRead<"stats.personaUsage">;
  readonly characterPersonas: CorpusRead<"stats.personaUsage">;
  readonly wrapped: CorpusRead<"stats.wrapped">;
  readonly momentum: CorpusRead<"stats.momentum">;
  readonly sorts: readonly CorpusRead<"stats.leaderboard">[];
  readonly latency: Record<"owner" | "character" | "model" | "missing", CorpusRead<"stats.latency">>;
}

interface Effects {
  readonly themes: readonly (typeof themes.$inferSelect)[];
  readonly settings: readonly (typeof userSettings.$inferSelect)[];
  readonly audit: readonly (typeof auditLogs.$inferSelect)[];
}

interface SettingsCaptures {
  readonly before: CorpusRead<"settings.getUserSettings">;
  readonly initialThemes: CorpusRead<"settings.listThemes">;
  readonly source: CorpusRead<"settings.createTheme">;
  readonly sourceRead: CorpusRead<"settings.getTheme">;
  readonly duplicate: CorpusRead<"settings.duplicateTheme">;
  readonly duplicateAgain: CorpusRead<"settings.duplicateTheme">;
  readonly updated: CorpusRead<"settings.updateTheme">;
  readonly clearedCss: CorpusRead<"settings.updateTheme">;
  readonly selected: CorpusRead<"settings.updateUserSettingsSection">;
  readonly appearance: CorpusRead<"settings.updateUserSettingsSection">;
  readonly echo: CorpusRead<"settings.updateUserSettingsSection">;
  readonly cleared: CorpusRead<"settings.updateUserSettingsSection">;
  readonly restored: CorpusRead<"settings.getUserSettings">;
  readonly imported: CorpusRead<"settings.importThemeFile">;
  readonly importedAgain: CorpusRead<"settings.importThemeFile">;
  readonly importedThemes: CorpusRead<"settings.listThemes">;
  readonly collision: CorpusRead<"settings.importThemeFile">;
  readonly collisionAgain: CorpusRead<"settings.importThemeFile">;
  readonly removed: CorpusRead<"settings.removeTheme">;
  readonly reset: CorpusRead<"settings.resetUserConfig">;
  readonly resetRead: CorpusRead<"settings.getUserSettings">;
  readonly seedRead: CorpusRead<"settings.getTheme"> | undefined;
  readonly seedCopy: CorpusRead<"settings.duplicateTheme"> | undefined;
  readonly loaded: Awaited<ReturnType<ServerTestHarness["services"]["settings"]["loadUserSettings"]>>;
  readonly exported: readonly PortableFile[];
  readonly stImported: CorpusRead<"settings.importThemeFile">;
  readonly stRepeated: CorpusRead<"settings.importThemeFile">;
  readonly resetBefore: CorpusRead<"settings.updateUserSettingsSection">;
}

interface StatsSettingsCaptures {
  readonly history: HistoryReferences;
  readonly absent: {
    readonly overview: CorpusRead<"stats.overview">;
    readonly wrapped: CorpusRead<"stats.wrapped">;
    readonly freshness: CorpusRead<"stats.freshness">;
    readonly settings: CorpusRead<"settings.getUserSettings">;
    readonly row: typeof userSettings.$inferSelect | undefined;
  };
  readonly computedEmpty: CorpusRead<"stats.reconcile">;
  readonly emptyAfter: Pick<StatsReads, "overview" | "freshness" | "timeseries" | "byModel" | "momentum">;
  readonly reconciled: CorpusRead<"stats.reconcile">;
  readonly repeated: CorpusRead<"stats.reconcile">;
  readonly rows: Awaited<ReturnType<typeof seedStats>>;
  readonly stats: StatsReads;
  readonly afterRepeat: Pick<StatsReads, "overview" | "character" | "byModel" | "timeseries">;
  readonly foreign: {
    readonly userId: UserId;
    readonly character: Awaited<ReturnType<Caller["character"]["create"]>>;
    readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
    readonly rows: Awaited<ReturnType<typeof seedStats>>;
    readonly turn: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
    readonly latency: CorpusRead<"stats.latency">;
    readonly projection: {
      readonly ownerCharacter: CorpusRead<"stats.character">;
      readonly foreignCharacter: CorpusRead<"stats.character">;
      readonly personas: CorpusRead<"stats.personaUsage">;
      readonly latency: CorpusRead<"stats.latency">;
      readonly rowsAfter: Awaited<ReturnType<typeof seedStats>>;
    };
  };
  readonly settings: SettingsCaptures;
  readonly failures: Record<
    | "foreignGet"
    | "foreignDuplicate"
    | "foreignUpdate"
    | "foreignDelete"
    | "deletedGet"
    | "deletedAgain"
    | "nameConflict"
    | "malformedImport"
    | "unsafeCss"
    | "overLimit"
    | "seedUpdate",
    Error | undefined
  >;
  readonly beforeRefusals: Effects;
  readonly afterRefusals: Effects;
  readonly persisted: { readonly source: typeof themes.$inferSelect | undefined; readonly settings: typeof userSettings.$inferSelect | undefined };
}

async function read<P extends TrpcProcedurePath>(input: TrpcInput<P>, invoke: (input: TrpcInput<P>) => Promise<TrpcWireOutput<P>>): Promise<CorpusRead<P>> {
  return { input, output: await invoke(input) };
}

async function refused(operation: Promise<object | void>): Promise<Error | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return error;
  }
}

async function statsReads(caller: Caller, characterId: CharacterId): Promise<StatsReads> {
  const overview = await read<"stats.overview">(undefined, caller.stats.overview);
  const character = await read<"stats.character">({ characterId }, caller.stats.character);
  const leaderboard = await read<"stats.leaderboard">({ limit: STATS_LIST_MAX_LIMIT }, caller.stats.leaderboard);
  const capped = await read<"stats.leaderboard">({ limit: 1 }, caller.stats.leaderboard);
  const sorts = await Promise.all(
    (["assistantTurns", "totalGenTimeMs", "swipes", "lastActivityAt"] as const).map((sort) => read<"stats.leaderboard">({ sort }, caller.stats.leaderboard)),
  );
  const searched = await read<"stats.leaderboard">({ search: character.output?.name, limit: 1 }, caller.stats.leaderboard);
  const missingSearch = await read<"stats.leaderboard">({ search: "no corpus character has this exact phrase" }, caller.stats.leaderboard);
  const timeseries = await read<"stats.timeseries">(undefined, caller.stats.timeseries);
  const firstBucket = timeseries.output[0];
  if (firstBucket === undefined) {
    throw new Error("native stats cohort requires existing retained activity");
  }
  const boundary = await read<"stats.timeseries">({ from: firstBucket.bucketStart, to: firstBucket.bucketStart }, caller.stats.timeseries);
  const outside = await read<"stats.timeseries">({ to: firstBucket.bucketStart - 1 }, caller.stats.timeseries);
  const byModel = await read<"stats.byModel">(undefined, caller.stats.byModel);
  const model = byModel.output.find((row) => row.generations > 0 && row.charactersUsedWith > 0);
  if (model === undefined) {
    throw new Error("native stats cohort requires a retained attributed model generation");
  }
  return {
    overview,
    character,
    leaderboard,
    capped,
    sorts,
    searched,
    missingSearch,
    timeseries,
    boundary,
    outside,
    byModel,
    modelCapped: await read<"stats.byModel">({ limit: 1 }, caller.stats.byModel),
    freshness: await read<"stats.freshness">(undefined, caller.stats.freshness),
    personas: await read<"stats.personaUsage">(undefined, caller.stats.personaUsage),
    characterPersonas: await read<"stats.personaUsage">({ characterId }, caller.stats.personaUsage),
    wrapped: await read<"stats.wrapped">(undefined, caller.stats.wrapped),
    momentum: await read<"stats.momentum">(undefined, caller.stats.momentum),
    latency: {
      owner: await read<"stats.latency">({ kind: "owner" }, caller.stats.latency),
      character: await read<"stats.latency">({ kind: "character", characterId }, caller.stats.latency),
      model: await read<"stats.latency">({ kind: "model", model: model.model, provider: model.provider }, caller.stats.latency),
      missing: await read<"stats.latency">({ kind: "model", model: "unrecorded-corpus-model", provider: null }, caller.stats.latency),
    },
  };
}

/** Capture caller-scoped statistics and user preferences after the existing graph has authored its history. */
export async function seedCorpusStatsSettings(root: ServerTestHarness, history: HistoryReferences): Promise<StatsSettingsCaptures> {
  await root.settleBackground();
  const caller = await root.internalCallerFor(root.ownerId);
  const emptyActor = await root.actor();
  const empty = await root.internalCallerFor(emptyActor.id);
  const absent = {
    overview: await read<"stats.overview">(undefined, empty.stats.overview),
    wrapped: await read<"stats.wrapped">(undefined, empty.stats.wrapped),
    freshness: await read<"stats.freshness">(undefined, empty.stats.freshness),
    settings: await read<"settings.getUserSettings">(undefined, empty.settings.getUserSettings),
    row: await root.db.select().from(userSettings).where(eq(userSettings.userId, emptyActor.id)).get(),
  };
  const computedEmpty = await read<"stats.reconcile">(undefined, empty.stats.reconcile);
  const emptyAfter = {
    overview: await read<"stats.overview">(undefined, empty.stats.overview),
    freshness: await read<"stats.freshness">(undefined, empty.stats.freshness),
    timeseries: await read<"stats.timeseries">(undefined, empty.stats.timeseries),
    byModel: await read<"stats.byModel">(undefined, empty.stats.byModel),
    momentum: await read<"stats.momentum">(undefined, empty.stats.momentum),
  };
  const foreignUserId = history.foreignUserId;
  const foreign = await root.internalCallerFor(foreignUserId);
  const foreignCharacter = await foreign.character.create({
    input: createCharacterSchema.parse({
      handle: "stats-settings-foreign",
      name: "Foreign stats witness",
      description: "An independently owned native witness.",
    }),
  });
  const foreignRoom = await foreign.chat.startChat({ characterIds: [foreignCharacter.id], opening: "none" });
  const foreignTurn = await root.services.chat.send({
    principal: await root.principalFor(foreignUserId),
    chatId: foreignRoom.chat.id,
    content: "A foreign owner keeps this distinct native history.",
  });
  const foreignLatency = await read<"stats.latency">({ kind: "character", characterId: foreignCharacter.id }, foreign.stats.latency);
  const foreignStats = await seedStats(root.db, root.services.stats.reconcile, foreignUserId);
  const reconciled = await read<"stats.reconcile">(undefined, caller.stats.reconcile);
  const rows = await seedStats(root.db, root.services.stats.reconcile, root.ownerId);
  const stats = await statsReads(caller, history.characterId);
  const repeated = await read<"stats.reconcile">(undefined, caller.stats.reconcile);
  const afterRepeat = {
    overview: await read<"stats.overview">(undefined, caller.stats.overview),
    character: await read<"stats.character">({ characterId: history.characterId }, caller.stats.character),
    byModel: await read<"stats.byModel">(undefined, caller.stats.byModel),
    timeseries: await read<"stats.timeseries">(undefined, caller.stats.timeseries),
  };
  const foreignProjection = {
    ownerCharacter: await read<"stats.character">({ characterId: foreignCharacter.id }, caller.stats.character),
    foreignCharacter: await read<"stats.character">({ characterId: history.characterId }, foreign.stats.character),
    personas: await read<"stats.personaUsage">({ characterId: foreignCharacter.id }, caller.stats.personaUsage),
    latency: await read<"stats.latency">({ kind: "character", characterId: foreignCharacter.id }, caller.stats.latency),
    rowsAfter: await seedStats(root.db, root.services.stats.reconcile, foreignUserId),
  };
  const settingsBefore = await read<"settings.getUserSettings">(undefined, caller.settings.getUserSettings);
  const initialThemes = await read<"settings.listThemes">(undefined, caller.settings.listThemes);
  const source = await read<"settings.createTheme">(
    { name: "Corpus settings palette", override: { accent: "#aabbcc", background: "#202830", density: "compact" }, css: ".corpus-witness { color: #aabbcc; }" },
    caller.settings.createTheme,
  );
  const duplicate = await read<"settings.duplicateTheme">({ id: source.output.id }, caller.settings.duplicateTheme);
  const duplicateAgain = await read<"settings.duplicateTheme">({ id: source.output.id }, caller.settings.duplicateTheme);
  const updated = await read<"settings.updateTheme">(
    { id: duplicate.output.id, input: { name: "Corpus edited palette", override: { accent: "#bbccdd" } } },
    caller.settings.updateTheme,
  );
  const clearedCss = await read<"settings.updateTheme">({ id: duplicate.output.id, input: { css: null } }, caller.settings.updateTheme);
  const sourceRead = await read<"settings.getTheme">({ id: source.output.id }, caller.settings.getTheme);
  const seed = initialThemes.output.find((theme) => theme.isDefault);
  const seedRead = seed === undefined ? undefined : await read<"settings.getTheme">({ id: seed.id }, caller.settings.getTheme);
  const seedCopy =
    seed === undefined
      ? undefined
      : await read<"settings.duplicateTheme">({ id: seed.id, name: "Corpus default palette copy" }, caller.settings.duplicateTheme);
  let selected: CorpusRead<"settings.updateUserSettingsSection">;
  let appearance: CorpusRead<"settings.updateUserSettingsSection">;
  let echo: CorpusRead<"settings.updateUserSettingsSection">;
  let cleared: CorpusRead<"settings.updateUserSettingsSection">;
  let loaded: Awaited<ReturnType<ServerTestHarness["services"]["settings"]["loadUserSettings"]>>;
  try {
    selected = await read<"settings.updateUserSettingsSection">(
      { section: "theme", patch: { selectedThemeId: source.output.id } },
      caller.settings.updateUserSettingsSection,
    );
    appearance = await read<"settings.updateUserSettingsSection">(
      { section: "appearance", patch: { fontScale: 1.2 } },
      caller.settings.updateUserSettingsSection,
    );
    echo = await read<"settings.updateUserSettingsSection">(
      { section: "appearance", patch: appearance.output.config.appearance },
      caller.settings.updateUserSettingsSection,
    );
    loaded = await root.services.settings.loadUserSettings(root.ownerId);
    cleared = await read<"settings.updateUserSettingsSection">(
      { section: "theme", patch: { selectedThemeId: null } },
      caller.settings.updateUserSettingsSection,
    );
  } finally {
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: settingsBefore.output.config.theme });
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: settingsBefore.output.config.appearance });
  }
  const restored = await read<"settings.getUserSettings">(undefined, caller.settings.getUserSettings);
  const themeDescriptor = root.app.portability.find((entry) => entry.kind === "theme");
  if (themeDescriptor === undefined) {
    throw new Error("native portability graph has no theme exporter");
  }
  const exported: PortableFile[] = [];
  for await (const file of themeDescriptor.exportAll(root.ownerId)) {
    exported.push(file);
  }
  const file = exported[0];
  if (file === undefined || exported.length !== 1) {
    throw new Error("native theme exporter did not produce its single library file");
  }
  const importInput = { fileText: new TextDecoder().decode(file.bytes), filename: file.filename };
  const imported = await read<"settings.importThemeFile">(importInput, foreign.settings.importThemeFile);
  const importedAgain = await read<"settings.importThemeFile">(importInput, foreign.settings.importThemeFile);
  const importedThemes = await read<"settings.listThemes">(undefined, foreign.settings.listThemes);
  const collisionInput = { fileText: JSON.stringify({ name: source.output.name, override: { accent: "#112233" }, css: null }) };
  const collision = await read<"settings.importThemeFile">(collisionInput, caller.settings.importThemeFile);
  const collisionAgain = await read<"settings.importThemeFile">(collisionInput, caller.settings.importThemeFile);
  const removed = await read<"settings.removeTheme">({ id: duplicateAgain.output.id }, caller.settings.removeTheme);
  const ownerIds = [root.ownerId, foreignUserId];
  const effects = async (): Promise<Effects> => ({
    themes: await root.db.select().from(themes).where(inArray(themes.ownerId, ownerIds)).orderBy(themes.id),
    settings: await root.db.select().from(userSettings).where(inArray(userSettings.userId, ownerIds)).orderBy(userSettings.userId),
    audit: await root.db.select().from(auditLogs).where(inArray(auditLogs.actorUserId, ownerIds)).orderBy(auditLogs.id),
  });
  const beforeRefusals = await effects();
  const failures = {
    foreignGet: await refused(foreign.settings.getTheme({ id: source.output.id })),
    foreignDuplicate: await refused(foreign.settings.duplicateTheme({ id: source.output.id })),
    foreignUpdate: await refused(foreign.settings.updateTheme({ id: source.output.id, input: { name: "Not mine" } })),
    foreignDelete: await refused(foreign.settings.removeTheme({ id: source.output.id })),
    deletedGet: await refused(caller.settings.getTheme({ id: duplicateAgain.output.id })),
    deletedAgain: await refused(caller.settings.removeTheme({ id: duplicateAgain.output.id })),
    nameConflict: await refused(caller.settings.createTheme(source.input)),
    malformedImport: await refused(caller.settings.importThemeFile({ fileText: "not JSON" })),
    unsafeCss: await refused(caller.settings.createTheme({ name: "Refused corpus palette", override: {}, css: ".corpus-witness { position: fixed; }" })),
    overLimit: await refused(caller.stats.leaderboard({ limit: STATS_LIST_MAX_LIMIT + 1 })),
    seedUpdate: seed === undefined ? undefined : await refused(caller.settings.updateTheme({ id: seed.id, input: { name: "Not editable" } })),
  };
  const afterRefusals = await effects();
  const stInput = {
    fileText: '{"blur_tint_color":"rgba(20, 24, 30, 1)","main_text_color":"rgba(230, 230, 230, 1)"}',
    filename: "Corpus ST palette.json",
  };
  const stImported = await read<"settings.importThemeFile">(stInput, caller.settings.importThemeFile);
  const stRepeated = await read<"settings.importThemeFile">(stInput, caller.settings.importThemeFile);
  const resetBefore = await read<"settings.updateUserSettingsSection">(
    { section: "appearance", patch: { fontScale: 1.3 } },
    empty.settings.updateUserSettingsSection,
  );
  const reset = await read<"settings.resetUserConfig">(undefined, empty.settings.resetUserConfig);
  const resetRead = await read<"settings.getUserSettings">(undefined, empty.settings.getUserSettings);
  await root.settleBackground();
  return {
    history,
    absent,
    computedEmpty,
    emptyAfter,
    reconciled,
    repeated,
    rows,
    stats,
    afterRepeat,
    foreign: {
      userId: foreignUserId,
      character: foreignCharacter,
      room: foreignRoom,
      rows: foreignStats,
      turn: foreignTurn,
      latency: foreignLatency,
      projection: foreignProjection,
    },
    settings: {
      before: settingsBefore,
      initialThemes,
      source,
      sourceRead,
      duplicate,
      duplicateAgain,
      updated,
      clearedCss,
      seedRead,
      seedCopy,
      selected,
      appearance,
      echo,
      loaded,
      cleared,
      restored,
      exported,
      imported,
      importedAgain,
      importedThemes,
      collision,
      collisionAgain,
      removed,
      stImported,
      stRepeated,
      resetBefore,
      reset,
      resetRead,
    },
    failures,
    beforeRefusals,
    afterRefusals,
    persisted: {
      source: await root.db
        .select()
        .from(themes)
        .where(and(eq(themes.id, typeIdSchema(ID_PREFIX.theme).parse(source.output.id)), eq(themes.ownerId, root.ownerId)))
        .get(),
      settings: await root.db.select().from(userSettings).where(eq(userSettings.userId, root.ownerId)).get(),
    },
  };
}
