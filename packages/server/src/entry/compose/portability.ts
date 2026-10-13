import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
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

/** What the registry builder needs from the composition root to compose each descriptor. */
// @orb-waive no-inline-package-interface(PortabilityDeps): baselined when the gate landed; burn-down item 952.
export interface PortabilityDeps {
  readonly db: Db;
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
