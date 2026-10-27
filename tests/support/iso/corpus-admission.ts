// Validated fixture intake binds each finite capture to its actual procedure and viewer. Raw corpus
// parsing/publication remains separate; this admission owner is not exposed through a suite door.
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { CorpusChatLifecycleMember, CorpusNotificationInbox, CorpusPlayback, CorpusWire } from "./corpus-data.ts";
import type { CorpusPlaybackView } from "./corpus-playback.ts";
import { admitCorpusCapture } from "./corpus-playback.ts";
import type { CorpusPluginStage } from "./corpus-plugin.ts";
import type { CorpusPlaybackRead, CorpusPlaybackViewerRead, CorpusProcedurePath, CorpusRead, CorpusViewerRead } from "./corpus-read.ts";

type ReadPaths<Key extends PropertyKey = string> = Readonly<Record<Key, CorpusProcedurePath>>;
type RawReads<Paths extends ReadPaths<keyof Paths>> = { readonly [Key in keyof Paths]: CorpusRead<Paths[Key]> };
type PlaybackReads<Paths extends ReadPaths<keyof Paths>> = { [Key in keyof Paths]: CorpusPlaybackRead<Paths[Key]> };
type ReadArrays<Path extends CorpusProcedurePath> = { readonly [Key in Path]: readonly CorpusRead<Key>[] };
type PlaybackArrays<Path extends CorpusProcedurePath> = { [Key in Path]: readonly CorpusPlaybackRead<Key>[] };

const PLUGIN_PATHS = {
  plugins: "plugin.list",
  surfaces: "plugin.listSurfaces",
  commands: "plugin.listCommands",
  displayTransforms: "plugin.listDisplayTransforms",
  assets: "plugin.listBundleAssets",
  log: "plugin.getLog",
  state: "plugin.getSurfaceState",
} as const satisfies ReadPaths;
const SEARCH_PATHS = {
  viewer: "sessions.me",
  entities: "search.search",
  characters: "search.search",
  discover: "search.search",
  digests: "search.search",
  corpus: "search.search",
  documents: "search.search",
  segments: "search.search",
  imagesRaw: "search.search",
  imagesCaptioned: "search.search",
  fields: "search.fields",
  suggest: "search.suggest",
  similarRaw: "search.similarArt",
  similarCaptioned: "search.similarArt",
  status: "search.spaceStatus",
} as const satisfies ReadPaths;
const RELATION_PATHS = {
  tagPending: "tag.listPendingSuggestions",
  tagPendingAfter: "tag.listPendingSuggestions",
  tagBefore: "tag.listTagsWithUsage",
  tagUsage: "tag.listTagsWithUsage",
  tagList: "tag.listTags",
  tagVocabulary: "tag.listTagFilterVocabulary",
  characterReach: "tag.listAttachedEntities",
  chatReach: "tag.listAttachedEntities",
  worldBookReach: "tag.listAttachedEntities",
  personaReach: "tag.listAttachedEntities",
  presetReach: "tag.listAttachedEntities",
  personaConnected: "persona.listConnectedToCharacter",
  personaCharacters: "persona.listConnectedCharacters",
  rosterDetail: "rosterPreset.get",
  rosterList: "rosterPreset.list",
  rosterApplied: "rosterPreset.applyToChat",
  rosterAppliedAgain: "rosterPreset.applyToChat",
  rosterChat: "chat.getChat",
  ruleCatalog: "automation.listRulePresets",
  presetDetail: "preset.get",
  presetList: "preset.list",
  presetInactive: "preset.listUsage",
  presetActive: "preset.listUsage",
  presetRestored: "preset.listUsage",
  presetEffective: "preset.resolveEffective",
  rulesFirst: "automation.listRules",
  rulesRepeated: "automation.listRules",
} as const satisfies ReadPaths;
const SHELL_PATHS = {
  recentChats: "chat.listChats",
  quickPicks: "character.list",
  rosterPreview: "rosterPreset.list",
  recentDocuments: "databank.list",
  inbox: "notifications.list",
  reaped: "chat.reapTemporaryChats",
} as const satisfies ReadPaths;
const FIRST_BOOT_PATHS = {
  viewer: "sessions.me",
  settings: "settings.getUserSettings",
  themes: "settings.listThemes",
  appSettings: "settings.getAppSettingsWithOverrides",
  connections: "connection.list",
  bindings: "connection.listBindings",
  providers: "connection.providersAvailable",
  credentials: "credentials.list",
  users: "admin.listUsers",
  schedules: "workloads.listSchedules",
  signInMode: "share.signInMode",
  shareStatus: "share.status",
  presets: "preset.list",
  spaceStatus: "search.spaceStatus",
} as const satisfies ReadPaths;
const WORLD_PATHS = {
  orderedEntries: "worldInfo.listEntries",
  demoted: "worldInfo.listForCharacter",
  books: "worldInfo.listBooks",
  detail: "worldInfo.getBook",
  usage: "worldInfo.listBooksWithUsage",
  targets: "worldInfo.listAttachmentsForBook",
  entry: "worldInfo.getEntry",
  characterBooks: "worldInfo.listForCharacter",
  personaBooks: "worldInfo.listForPersona",
  globalBooks: "worldInfo.listGlobal",
  chatBooks: "worldInfo.listForChat",
  inheritedBooks: "worldInfo.listForChat",
} as const satisfies ReadPaths;
const REGEX_PATHS = {
  before: "regex.listForChat",
  after: "regex.listForChat",
  displayOff: "regex.listRoomDisplayScripts",
  displayOn: "regex.listRoomDisplayScripts",
  list: "regex.listScripts",
  usage: "regex.listScriptUsage",
  global: "regex.listGlobal",
  character: "regex.listForCharacter",
  preset: "regex.listForPreset",
} as const satisfies ReadPaths;

function admitRead<Path extends CorpusProcedurePath>(path: Path, viewerUserId: UserId, read: CorpusRead<Path>): CorpusPlaybackRead<Path> {
  return admitCorpusCapture(path, viewerUserId, { input: read.input, output: read.output });
}

function admitReads<const Paths extends ReadPaths<keyof Paths>>(paths: Paths, viewerUserId: UserId, reads: RawReads<Paths>): PlaybackReads<Paths> {
  // Every key of this closed map is filled below; the assertion covers incremental object construction.
  const admitted = {} as PlaybackReads<Paths>;
  const admitKey = <Key extends keyof Paths>(key: Key): void => {
    admitted[key] = admitRead<Paths[Key]>(paths[key], viewerUserId, reads[key]);
  };
  for (const key of Object.keys(paths) as (keyof Paths)[]) {
    admitKey(key);
  }
  return admitted;
}

function admitArrays<Path extends CorpusProcedurePath>(viewerUserId: UserId, reads: ReadArrays<Path>): PlaybackArrays<Path> {
  const admitted = {} as PlaybackArrays<Path>;
  for (const path of Object.keys(reads) as Path[]) {
    admitted[path] = reads[path].map((read) => admitRead(path, viewerUserId, read));
  }
  return admitted;
}

function admitSnapshot<Path extends CorpusProcedurePath>(path: Path, snapshot: CorpusViewerRead<Path>): CorpusPlaybackViewerRead<Path> {
  return { viewerUserId: snapshot.viewerUserId, read: admitRead(path, snapshot.viewerUserId, snapshot.read) };
}

function admitInbox(inbox: CorpusNotificationInbox): CorpusPlaybackView<CorpusNotificationInbox> {
  return {
    readerRaised: admitSnapshot("notifications.list", inbox.readerRaised),
    readerRead: admitSnapshot("notifications.list", inbox.readerRead),
    readerSettled: admitSnapshot("notifications.list", inbox.readerSettled),
    readerFinal: admitSnapshot("notifications.list", inbox.readerFinal),
    foreignBefore: admitSnapshot("notifications.list", inbox.foreignBefore),
    foreignAfter: admitSnapshot("notifications.list", inbox.foreignAfter),
    hostAccepted: admitSnapshot("notifications.list", inbox.hostAccepted),
  };
}

function admitMemberMessages(member: CorpusChatLifecycleMember): CorpusPlaybackView<CorpusChatLifecycleMember> {
  return {
    heldDuring: { ...member.heldDuring, ...admitSnapshot("chat.listMessages", member.heldDuring) },
    heldCompleted: { ...member.heldCompleted, ...admitSnapshot("chat.listMessages", member.heldCompleted) },
    abortedDuring: { ...member.abortedDuring, ...admitSnapshot("chat.listMessages", member.abortedDuring) },
    abortedCompleted: { ...member.abortedCompleted, ...admitSnapshot("chat.listMessages", member.abortedCompleted) },
  };
}

function admitPluginStage(stage: CorpusPluginStage): CorpusPlaybackView<CorpusPluginStage> {
  return { ...stage, reads: admitReads(PLUGIN_PATHS, stage.viewerUserId, stage.reads) };
}

function admitPlugins(plugins: NonNullable<CorpusWire["pluginLibrary"]>): NonNullable<CorpusPlayback["pluginLibrary"]> {
  return {
    ownerPending: admitPluginStage(plugins.ownerPending),
    ownerActive: admitPluginStage(plugins.ownerActive),
    recipientActive: admitPluginStage(plugins.recipientActive),
    ownerDisabled: admitPluginStage(plugins.ownerDisabled),
    ownerFinal: admitSnapshot("plugin.list", plugins.ownerFinal),
    distribution: {
      ...plugins.distribution,
      ...admitSnapshot("plugin.listDistributed", plugins.distribution),
    },
  };
}

/** Only the real loader/capsule hands validated raw data to this private hydration boundary. */
export function admitCorpusPlayback(wire: CorpusWire): CorpusPlayback {
  const owner = wire.reads["sessions.me"][0]?.output;
  if (owner === undefined) {
    throw new Error("Corpus playback requires its captured owner");
  }
  const viewerUserId = brandedId("UserId").parse(owner.userId);
  const {
    reads,
    pluginLibrary: plugins,
    searchLibrary: search,
    libraryRelations: relations,
    shellAmbient: shell,
    firstBoot,
    worldInfoLibrary: world,
    regexLibrary: regex,
    notificationInbox: inbox,
    chatLifecycleMember: member,
    ...data
  } = wire;
  return {
    ...data,
    reads: admitArrays(viewerUserId, reads),
    ...(plugins === undefined ? {} : { pluginLibrary: admitPlugins(plugins) }),
    ...(search === undefined
      ? {}
      : {
          searchLibrary: {
            ...search,
            reads: admitReads(SEARCH_PATHS, search.viewerUserId, search.reads),
            rooms: search.rooms.map((room) => admitRead("chat.getChat", search.viewerUserId, room)),
          },
        }),
    ...(relations === undefined ? {} : { libraryRelations: { ...relations, reads: admitReads(RELATION_PATHS, relations.viewerUserId, relations.reads) } }),
    ...(shell === undefined
      ? {}
      : {
          shellAmbient: {
            ...shell,
            reads: admitReads(SHELL_PATHS, shell.viewerUserId, shell.reads),
            recentRooms: shell.recentRooms.map((room) => admitRead("chat.getChat", shell.viewerUserId, room)),
          },
        }),
    ...(firstBoot === undefined ? {} : { firstBoot: admitFirstBoot(firstBoot) }),
    ...(world === undefined ? {} : { worldInfoLibrary: { ...world, reads: admitReads(WORLD_PATHS, world.viewerUserId, world.reads) } }),
    ...(regex === undefined ? {} : { regexLibrary: { ...regex, reads: admitReads(REGEX_PATHS, regex.viewerUserId, regex.reads) } }),
    ...(inbox === undefined ? {} : { notificationInbox: admitInbox(inbox) }),
    ...(member === undefined ? {} : { chatLifecycleMember: admitMemberMessages(member) }),
  };
}

function admitFirstBoot(firstBoot: NonNullable<CorpusWire["firstBoot"]>): NonNullable<CorpusPlayback["firstBoot"]> {
  const viewerUserId = brandedId("UserId").parse(firstBoot.reads.viewer.output.userId);
  return {
    ...firstBoot,
    reads: admitReads(FIRST_BOOT_PATHS, viewerUserId, firstBoot.reads),
    workloadLists: firstBoot.workloadLists.map((read) => admitRead("workloads.list", viewerUserId, read)),
  };
}
