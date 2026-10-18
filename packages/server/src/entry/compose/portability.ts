import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry, PortableKind } from "@orb/contracts/portability";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { hostTimeZone } from "@orb/kit/time";
import type { AssetsContext, ImportAssetPort } from "#domain/assets";
import { createExportAssets, createExportGallery, createImportAsset, createImportAvatarStore, createImportGallery } from "#domain/assets";
import type { ImportCharacterPort } from "#domain/character";
import { createCharacterImportOps } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import type { DatabankPortabilityContext } from "#domain/databank";
import { createExportDocument, createImportDocument, createListOwnedDocumentIds } from "#domain/databank";
import type { ExportService } from "#domain/export";
import { createPortableExports } from "#domain/export";
import type { ImageryPortabilityService } from "#domain/imagery";
import type { ImportProfileDeps } from "#domain/import";
import { createPortableImports } from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createExportPresets, createImportPresets } from "#domain/preset";
import type { ExportRegexScripts, ImportCardScripts, ImportRegexScript } from "#domain/regex";
import type { SettingsContext } from "#domain/settings";
import { createExportTheme, createExportUserSettings, createImportTheme, createImportUserSettings } from "#domain/settings";
import type { ImportTagPort, TagContext } from "#domain/tag";
import { createImportedCardTag, createTagLibraryExport, createTagLibraryImport } from "#domain/tag";
import type { ImportStandaloneLorebook, ImportWorldInfoPort, WorldInfoExportContext } from "#domain/world-info";
import { createExportWorldBook, createImportWorldBook, createListOwnedBookIds } from "#domain/world-info";
import { CHAT_BUNDLE_EXT } from "#primitives/serde/chat-bundle";
import type { LifecycleDoors, NonPortableCanon, PortabilityTableName } from "../contract/portability.ts";

/** What the registry builder needs from the composition root to compose each descriptor. */
export interface PortabilityDeps {
  readonly now: () => number;
  readonly tagCtx: TagContext;
  readonly settingsCtx: SettingsContext;
  readonly presetCtx: PresetContext;
  readonly worldInfoExportCtx: WorldInfoExportContext;
  readonly importStandaloneLorebook: ImportStandaloneLorebook;
  readonly assetsCtx: AssetsContext;
  readonly imagery: ImageryPortabilityService;
  readonly databankCtx: DatabankPortabilityContext;
  readonly persona: Pick<PersonaService, "export" | "import" | "list">;
  readonly exportService: Pick<ExportService, "exportCharacter" | "exportChatBundle" | "listHostChats">;
  readonly character: ImportCharacterPort;
  readonly listOwnedCharacterIds: (ownerId: UserId) => Promise<readonly CharacterId[]>;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook: ImportWorldInfoPort["importLorebook"];
  /** #1598 — the seat oracle that keeps a re-uploaded card from replacing an edited primary book. */
  readonly hasPrimaryBook: ImportWorldInfoPort["hasPrimaryBook"];
  /** D121-E: the card LIFT — threaded into every per-owner `ImportContext` so a bundled character card's
   *  scripts land as library rows + a junction attachment (never a by-value copy on the character row). */
  readonly importCardScripts: ImportCardScripts;
  /** The `regex` descriptor's two halves (the `regex/` bundle dir, one `*.json` per library script). */
  readonly exportRegexScripts: ExportRegexScripts;
  readonly importRegexScript: ImportRegexScript;
  readonly linkCarriedBooks: ImportWorldInfoPort["linkCarriedBooks"];
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  // R6 — the orb-native chat arm's three cross-domain re-links, threaded into every per-owner ImportContext.
  readonly findPersonaByName: NonNullable<ImportProfileDeps["findPersonaByName"]>;
  readonly attachChatTagByName: NonNullable<ImportProfileDeps["attachChatTagByName"]>;
  readonly importRpgGame: NonNullable<ImportProfileDeps["importRpgGame"]>;
  readonly enqueueImportIndex: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}

export function buildPortabilityRegistry(deps: PortabilityDeps): PortabilityRegistry {
  const exports = createPortableExports({
    gallery: createExportGallery(deps.assetsCtx),
    tags: createTagLibraryExport(deps.tagCtx),
    theme: createExportTheme(deps.settingsCtx),
    userSettings: createExportUserSettings(deps.settingsCtx),
    presets: createExportPresets(deps.presetCtx),
    worldBook: createExportWorldBook(deps.worldInfoExportCtx),
    listBookIds: createListOwnedBookIds(deps.worldInfoExportCtx),
    regex: deps.exportRegexScripts,
    document: createExportDocument(deps.databankCtx),
    listDocumentIds: createListOwnedDocumentIds(deps.databankCtx),
    persona: deps.persona,
    exportService: deps.exportService,
    listCharacterIds: deps.listOwnedCharacterIds,
    resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
  });
  const imports = createPortableImports({
    tags: createTagLibraryImport(deps.tagCtx),
    regex: deps.importRegexScript,
    document: createImportDocument(deps.databankCtx),
    persona: deps.persona,
    resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
    wallClockZone: hostTimeZone,
    contextFor: (principal) => ({
      principal,
      characterOps: createCharacterImportOps(principal, deps.character),
      storeAsset: createImportAvatarStore(principal, deps.storeAvatar),
      attachCardTag: createImportedCardTag(principal.userId, deps.attachCardTag),
      importLorebook: deps.importLorebook,
      hasPrimaryBook: deps.hasPrimaryBook,
      linkCarriedBooks: deps.linkCarriedBooks,
      importCardScripts: deps.importCardScripts,
    }),
    profile: {
      now: deps.now,
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      enqueueImportIndex: deps.enqueueImportIndex,
      reconcileStats: deps.reconcileImportStats,
      findPersonaByName: deps.findPersonaByName,
      attachChatTagByName: deps.attachChatTagByName,
      importRpgGame: deps.importRpgGame,
    },
  });
  const importGallery = createImportGallery(deps.assetsCtx);
  const importTheme = createImportTheme(deps.settingsCtx);
  const importUserSettings = createImportUserSettings(deps.settingsCtx);
  const importPreset = createImportPresets(deps.presetCtx);
  const importWorldBook = createImportWorldBook({ importStandalone: deps.importStandaloneLorebook });
  return [
    { kind: "assets", dir: "assets/", ext: "", exportAll: createExportAssets(deps.assetsCtx), importFile: createImportAsset(deps.assetsCtx) },
    { kind: "gallery", dir: "gallery/", ext: ".json", exportAll: exports.gallery, importFile: (ownerId, file) => importGallery(ownerId, file) },
    { kind: "tag", dir: "tags/", ext: ".json", exportAll: exports.tag, importFile: imports.tag },
    { kind: "theme", dir: "themes/", ext: ".json", exportAll: exports.theme, importFile: (ownerId, file) => importTheme(ownerId, file.bytes) },
    {
      kind: "user-settings",
      dir: "user-settings/",
      ext: ".json",
      exportAll: exports.userSettings,
      importFile: (ownerId, file) => importUserSettings(ownerId, file.bytes),
    },
    { kind: "preset", dir: "presets/", ext: ".json", exportAll: exports.preset, importFile: (ownerId, file) => importPreset({ ownerId, bytes: file.bytes }) },
    {
      kind: "world-info",
      dir: "world-info/",
      ext: ".json",
      exportAll: exports.worldInfo,
      importFile: (ownerId, file) => importWorldBook({ ownerId, bytes: file.bytes }),
    },
    { kind: "regex", dir: "regex/", ext: ".json", exportAll: exports.regex, importFile: imports.regex },
    { kind: "databank", dir: "databank/", ext: ".json", exportAll: exports.databank, importFile: imports.databank },
    { kind: "persona", dir: "personas/", ext: ".json", exportAll: exports.persona, importFile: imports.persona },
    { kind: "character", dir: "characters/", ext: ".png", exportAll: exports.character, importFile: imports.character },
    { kind: "chat", dir: "chats/", ext: CHAT_BUNDLE_EXT, exportAll: exports.chat, importFile: imports.chat },
    { kind: "imagery", dir: "imagery/", ext: ".json", exportAll: deps.imagery.exportAll, importFile: deps.imagery.importFile },
  ];
}

/** Canon tables carried by each production descriptor; inherited FK children travel with their root. */
export const PORTABLE_CANON_TABLES = {
  character: ["characters"],
  chat: ["chats", "chatTags"],
  persona: ["personas"],
  "world-info": ["worldBooks"],
  regex: ["regexScripts"],
  databank: ["documents", "globalDocuments"],
  preset: ["presets"],
  theme: ["themes"],
  "user-settings": ["userSettings"],
  tag: ["tags"],
  gallery: ["galleryItems"],
  assets: ["assets"],
  imagery: ["imageryGenerations", "imageryImportCalls"],
} as const satisfies Record<PortableKind, readonly PortabilityTableName[]>;

/** Explicit omissions retain their portability reason and end condition. */
export const NON_PORTABLE_CANON = {
  userConnections: {
    classification: "DEFERRED",
    why: "a connection is provider + model + a `credentialId` into RULED-OUT `user_credentials` + a box-local `baseUrl` (inference program §5.3); the credential half can never travel and the URL half is per-box, so today the restore posture is re-create from the picker (the local-light floor re-seeds at boot, §7.2). Ends when the Connections pane ships an export arm that carries the credential-FREE half (provider, model, declared, extras, transport, bindings) and the import re-links keys.",
  },
  userCredentials: {
    classification: "RULED-OUT",
    why: "spec R10 — secrets never leave the box; the restore posture is re-enter your keys. Ends never (a portable credential IS the defect).",
  },
  plugins: {
    classification: "RULED-OUT",
    why: "O-4: installed CODE is not user data. Ends if plugins ever become declarative config rather than executables.",
  },
  pluginProviderClaims: {
    classification: "RULED-OUT",
    why: "D265 — each claim binds a provider id to the definition a RULED-OUT `plugins` install shipped on this box; the owner's next activation re-creates it. Ends with the `plugins` row.",
  },
  pluginKv: {
    classification: "RULED-OUT",
    why: "the KV store of RULED-OUT `plugins` — restoring a plugin's state without the plugin is worse than not restoring it. Ends with the `plugins` row.",
  },
  rosterPresets: {
    classification: "DEFERRED",
    why:
      "#26 (D61 B6) — saved parties are owner-authored library artifacts (the tag/theme class, so PORTABLE in spirit), but v1 shipped " +
      "without a portable kind by the program doc's own scope (saved-rosters-design.md §7 names no portability; D170). " +
      "A party is a name + FKs into the owner's character library, so a portable kind must " +
      "resolve members by the characters the bundle also carries. Ends when `roster-preset` registers a PORTABLE_KINDS member " +
      "(serde + verbs + descriptor + import-order slot AFTER characters + round-trip pin).",
  },
  refinerySchemas: {
    classification: "DEFERRED",
    why:
      "R3/SF0 — owner-authored custom payload schemas (the tag/theme artifact class, so PORTABLE in spirit). Whether schema rows ride " +
      "the portability bundle is an OPEN OWNER FORK recorded in the NL design (2026-08-08-card-refinery-nl-schema-design.md §8, the same " +
      "question flagged for prose overrides — one lane, same answer for both). Ends when that fork is ruled: portable ⇒ register the kind " +
      "(serde + verbs + descriptor + order slot + round-trip pin); not ⇒ reclassify RULED-OUT with the ruling cite.",
  },
  automationRules: {
    classification: "DEFERRED",
    why:
      "O-4 RULED these portable (owner-authored artifacts, the tag/theme class). TRUTH-REPAIRED 2026-08-07 (R6): this row used to " +
      "say 'the descriptor is R6's named work', which R6 could not deliver and did not — R6 is the orb-native CHAT BUNDLE, and " +
      "automation rules are not chat-anchored. They need their OWN portable family (serde + verbs + descriptor + import-order " +
      "slot + doors), which is a separate wave. Ends when `automation` registers a PORTABLE_KINDS member.",
  },
  automationOwnerBudgets: {
    classification: "RULED-OUT",
    why:
      "C5's owner-GLOBAL fire-rate ceiling — a LOOP-SAFETY BELT, not user data. An ABSENT row is dispatched " +
      "as the DDL default, so a " +
      "restored account is bounded by the shipped ceiling rather than by nothing: dropping it loses a tuned " +
      "number, never a capability or a piece of authored work. Carrying it would also restore a ceiling that " +
      "was tuned against a library the restore may not reproduce. Ends if the ceiling ever becomes an " +
      "AUTHORED artifact (a per-rule schedule, a spend plan) rather than a single defaulted belt.",
  },
  globalVariables: {
    classification: "DEFERRED",
    why: "O-4 RULED these portable, same wave and same corrected end condition as `automationRules` (NOT R6 — see that row). Ends when the automation descriptor lands.",
  },
  workloads: {
    classification: "RUNTIME",
    why: "queue rows — a job that ran on the old box has no meaning on the new one. Ends never.",
  },
  workloadSchedules: {
    classification: "RUNTIME",
    why: "recurring-job wiring bound to workload rows + this box's clock. Ends if schedules become user-authored artifacts in their own right.",
  },
  characterSummaries: {
    classification: "DERIVED",
    why: "re-computed from the character canon that DOES travel. Carrying it would ship a cache that a restore immediately invalidates. Ends never.",
  },
  dailyStats: {
    classification: "DERIVED",
    why: "turn economics rolled up from messages. Re-derivable by the stats reconcile the import already runs. Ends never.",
  },
  modelStats: { classification: "DERIVED", why: "same rollup plane as `dailyStats`. Ends never." },
  ownerStats: { classification: "DERIVED", why: "same rollup plane as `dailyStats`. Ends never." },
  compactionSpend: {
    classification: "DEFERRED",
    why: "Compaction spend history does not travel, so restored compaction spend starts at zero. Imagery execution history travels through its own descriptor. Ends when the bundle carries compaction spend history.",
  },
  embeddingCalls: {
    classification: "DEFERRED",
    why:
      "Physical embedding execution history is canon, retained locally independently of vector lifetime; the alpha backup does not carry it, " +
      "so a cross-box rebuild cannot recover those historical prices, partial failures or private connection attribution from restored vectors. " +
      "The broader portability work remains parked under 0488. Ends when a portable physical-embedding descriptor carries the complete observed facts " +
      "and restores importer-scoped attribution with live/rebuild parity. This classification neither permits local deletion nor calls the history derived.",
  },
  statsCanonVersions: {
    classification: "DERIVED",
    why: "monotonic coordination token for rebuilding the stats rollup plane; restore rebuilds the rollups and starts a fresh token. Ends never.",
  },
  embedGenerations: {
    classification: "DERIVED",
    why:
      "immutable provenance for vector rows, derived from the owner's box-local connection configuration and rebuilt with the vector substrate. " +
      "A restore must re-index against its own connections rather than carry another box's generation identities. Ends never.",
  },
  embedGenerationTargets: {
    classification: "RUNTIME",
    why:
      "the in-flight per-owner generation and epoch that coordinate local re-index workers. It has no portable meaning without this box's connections, " +
      "candidate rows, and workload state; restore starts a fresh target. Ends never.",
  },
  keywordCooccurrence: { classification: "DERIVED", why: "a discovery analytics index over library canon; rebuilt by reindex. Ends never." },
  themeClusters: { classification: "DERIVED", why: "discovery clustering over embeddings, themselves derived. Ends never." },
  embedSpaceState: {
    classification: "DERIVED",
    why:
      "the last COMPLETE embed space per (owner, vector scope) — a statement ABOUT the vector substrate, which is " +
      "itself DERIVED and does not travel (inference program §10-5). Carrying it would be worse than dropping it: it " +
      "would tell the new box that a corpus it has not embedded yet is settled, which is precisely the false-settled " +
      "state the table exists to prevent. Absent, the restored box reads as `unrecorded` and serves its live space " +
      "until its first sweep records one. Ends never.",
  },
} as const satisfies Partial<Record<PortabilityTableName, NonPortableCanon>>;

/** Single-entity doors or the explicit decision that the family has none. */
export const LIFECYCLE_DOORS = {
  character: {
    singleExport: { transport: "http", method: "GET", cite: "/api/export/character/:characterId" },
    singleImport: { transport: "http", method: "POST", cite: "/api/import" },
    chrome: "band+kebab",
  },
  chat: {
    singleExport: { transport: "http", method: "GET", cite: "/api/export/chat/:chatId" },
    singleImport: { transport: "http", method: "POST", cite: "/api/import/chat" },
    chrome: "band+kebab",
  },
  persona: {
    singleExport: { transport: "trpc", cite: "persona.export" },
    singleImport: { transport: "trpc", cite: "persona.import" },
    chrome: "band+kebab",
  },
  "world-info": {
    singleExport: { transport: "trpc", cite: "worldInfo.exportBook" },
    singleImport: { transport: "trpc", cite: "worldInfo.importFile" },
    chrome: "band+kebab",
  },
  regex: {
    singleExport: { transport: "trpc", cite: "regex.exportScript" },
    singleImport: { transport: "trpc", cite: "regex.importScriptFile" },
    chrome: "band+kebab",
  },
  databank: {
    singleExport: {
      ruled: "a document's SOURCE file is what people share, and they already have it — the portable file exists to move a whole bank between boxes.",
    },
    singleImport: {
      ruled: "the single-document import door already exists as UPLOAD (`databank.upload`), which re-extracts rather than trusting a carried canon.",
    },
    chrome: "backup-pane",
  },
  preset: {
    singleExport: {
      ruled: "client-side: the cached row → `buildPresetFile` → browser download (O-16 one-home, the contracts-homed codec). No server door to cite.",
    },
    singleImport: { transport: "trpc", cite: "preset.importFile" },
    chrome: "band+kebab",
  },
  theme: {
    singleExport: {
      ruled:
        "O-2 recommends a per-theme pair once the serde spine exists; the spine landed with this wave, so the door is the next S lane. Ends when `settings.exportTheme` exists.",
    },
    singleImport: { ruled: "same wave as the export half." },
    chrome: "backup-pane",
  },
  "user-settings": {
    singleExport: { ruled: "a namespace blob is not a shareable artifact — the backup pane's checkbox IS its granularity (spec R7)." },
    singleImport: { ruled: "same — per-namespace merge only, through the bundle." },
    chrome: "backup-pane",
  },
  tag: {
    singleExport: {
      ruled:
        "O-2 RULED bundle-only: tags are a small library and the backup pane's per-family checkbox already exports them. No evidenced demand for sharing one tag.",
    },
    singleImport: { ruled: "O-2 bundle-only, same reason." },
    chrome: "backup-pane",
  },
  gallery: {
    singleExport: { ruled: "media CURATION, not an artifact — the blobs themselves already have `/blob/:hash` (D21)." },
    singleImport: { ruled: "same — curation restores with the library it curates." },
    chrome: "backup-pane",
  },
  assets: {
    singleExport: { ruled: "the CAS blob plane. Per-blob download is `/blob/:hash` (D21); the bundle arm is always-on, never a user checkbox." },
    singleImport: { ruled: "blobs arrive with the entity that references them." },
    chrome: "backup-pane",
  },
  imagery: {
    singleExport: { ruled: "Execution history travels with its retained output assets through the backup bundle, not a generation request." },
    singleImport: { ruled: "History restores through the same bundle without resolving connections or executing paid calls." },
    chrome: "backup-pane",
  },
} as const satisfies Record<PortableKind, LifecycleDoors>;
