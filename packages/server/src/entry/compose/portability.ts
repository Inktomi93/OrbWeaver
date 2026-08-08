// Composition seam that assembles the injected `PortabilityRegistry` the delivery core iterates. The
// entity-agnostic core knows nothing about any specific entity; adding an entity = append one descriptor
// here. Each `PortableEntity` is `{ kind, dir, ext, exportAll, importFile }`: `exportAll` streams the
// owner's rows as portable files; `importFile` parses one file's bytes into the owner's tables, never
// throwing for a malformed file (returns `{ok:false,error}`). Import order is NOT this array's order — the
// core imports by `PORTABLE_IMPORT_ORDER` (contracts/portability).

import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry, PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { AssetsContext } from "#domain/assets";
import { createExportAssets, createExportGallery, createImportAsset, createImportGallery } from "#domain/assets";
import type { BulkImportChats } from "#domain/chat";
import type { DatabankPortabilityContext } from "#domain/databank";
import { createExportDocument, createImportDocument, createListOwnedDocumentIds } from "#domain/databank";
import type { ExportService } from "#domain/export";
import type { ImportProfileDeps, ImportService } from "#domain/import";
import { createImportService } from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createExportPresets, createImportPresets } from "#domain/preset";
import type { ExportRegexScripts, ImportCardScripts, ImportRegexScript } from "#domain/regex";
import type { SettingsContext } from "#domain/settings";
import { createExportTheme, createExportUserSettings, createImportTheme, createImportUserSettings } from "#domain/settings";
import type { TagContext } from "#domain/tag";
import { createTagLibraryExport, createTagLibraryImport } from "#domain/tag";
import type { ImportStandaloneLorebook, WorldInfoExportContext } from "#domain/world-info";
import { createExportWorldBook, createImportWorldBook, createListOwnedBookIds } from "#domain/world-info";
import { CHAT_BUNDLE_EXT } from "#kit/serde/chat-bundle";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "../import/index.ts";
import { buildImportContext } from "../import/index.ts";

/** What the registry builder needs from the composition root to compose each descriptor. */
export interface PortabilityDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly tagCtx: TagContext;
  readonly settingsCtx: SettingsContext;
  readonly presetCtx: PresetContext;
  readonly worldInfoExportCtx: WorldInfoExportContext;
  readonly importStandaloneLorebook: ImportStandaloneLorebook;
  readonly assetsCtx: AssetsContext;
  readonly databankCtx: DatabankPortabilityContext;
  readonly persona: Pick<PersonaService, "export" | "import" | "list">;
  readonly exportService: Pick<ExportService, "exportCharacter" | "exportChatBundle" | "listHostChats">;
  readonly character: ImportCharacterPort;
  readonly listOwnedCharacterIds: (ownerId: UserId) => Promise<readonly CharacterId[]>;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook: ImportWorldInfoPort["importLorebook"];
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
  readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}

/** Build the per-owner `ImportContext`, shared by both the character card path and the chat path. */
async function buildOwnerImport(deps: PortabilityDeps, ownerId: UserId): Promise<ImportService> {
  const principal = await deps.resolveOwnerPrincipal(ownerId);
  const ctx = buildImportContext({
    principal,
    character: deps.character,
    storeAvatar: deps.storeAvatar,
    attachCardTag: deps.attachCardTag,
    importLorebook: deps.importLorebook,
    linkCarriedBooks: deps.linkCarriedBooks,
    importCardScripts: deps.importCardScripts,
    profile: {
      now: deps.now,
      personaByUserName: new Map(),
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      enqueueBackfill: deps.enqueueBackfill,
      reconcileStats: deps.reconcileImportStats,
      findPersonaByName: deps.findPersonaByName,
      attachChatTagByName: deps.attachChatTagByName,
      importRpgGame: deps.importRpgGame,
    },
  });
  return createImportService(ctx);
}

/** Wrap a single-file export verb (`() => Promise<{filename,bytes}>`) as the streaming `exportAll`. */
function oneFile(produce: (ownerId: UserId) => Promise<{ readonly filename: string; readonly bytes: Uint8Array }>): PortableEntity["exportAll"] {
  return async function* exportOne(ownerId: UserId): AsyncIterable<PortableFile> {
    yield await produce(ownerId);
  };
}

/** Map the error thrown by a domain import verb to a `{ok:false}` outcome (the never-throw contract). */
function errorOutcome(err: unknown): PortableImportOutcome {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/**
 * Assemble the portability registry from the built domain verbs. Owner-scoped throughout — `ownerId` is
 * the only owner any exportAll/importFile ever sees.
 */
export function buildPortabilityRegistry(deps: PortabilityDeps): PortabilityRegistry {
  const assets: PortableEntity = {
    kind: "assets",
    dir: "assets/",
    ext: "",
    exportAll: createExportAssets(deps.assetsCtx),
    importFile: createImportAsset(deps.assetsCtx),
  };

  const exportGallery = createExportGallery(deps.assetsCtx);
  const importGallery = createImportGallery(deps.assetsCtx);
  const gallery: PortableEntity = {
    kind: "gallery",
    dir: "gallery/",
    ext: ".json",
    exportAll: oneFile((ownerId) => exportGallery(ownerId)),
    importFile: (ownerId, file) => importGallery(ownerId, file),
  };

  const exportTags = createTagLibraryExport(deps.tagCtx);
  const importTags = createTagLibraryImport(deps.tagCtx);
  const tagExportAll = oneFile(async (ownerId) => ({
    filename: "tags.json",
    bytes: await exportTags(ownerId),
  }));
  const tag: PortableEntity = {
    kind: "tag",
    dir: "tags/",
    ext: ".json",
    exportAll: tagExportAll,
    importFile: async (ownerId, file) => {
      try {
        const { created } = await importTags(ownerId, file.bytes);
        return { ok: true, created: created > 0 };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  const exportTheme = createExportTheme(deps.settingsCtx);
  const importTheme = createImportTheme(deps.settingsCtx);
  const theme: PortableEntity = {
    kind: "theme",
    dir: "themes/",
    ext: ".json",
    exportAll: oneFile((ownerId) => exportTheme(ownerId)),
    importFile: (ownerId, file) => importTheme(ownerId, file.bytes),
  };

  const exportUserSettings = createExportUserSettings(deps.settingsCtx);
  const importUserSettings = createImportUserSettings(deps.settingsCtx);
  const userSettings: PortableEntity = {
    kind: "user-settings",
    dir: "user-settings/",
    ext: ".json",
    exportAll: oneFile((ownerId) => exportUserSettings(ownerId)),
    importFile: (ownerId, file) => importUserSettings(ownerId, file.bytes),
  };

  const exportPresets = createExportPresets(deps.presetCtx);
  const importPreset = createImportPresets(deps.presetCtx);
  const presetExportAll = async function* presetAll(ownerId: UserId): AsyncIterable<PortableFile> {
    for (const file of await exportPresets({ ownerId })) {
      yield file;
    }
  };
  const preset: PortableEntity = {
    kind: "preset",
    dir: "presets/",
    ext: ".json",
    exportAll: presetExportAll,
    importFile: (ownerId, file) => importPreset({ ownerId, bytes: file.bytes }),
  };

  const exportWorldBook = createExportWorldBook(deps.worldInfoExportCtx);
  const importWorldBook = createImportWorldBook({
    importStandalone: deps.importStandaloneLorebook,
  });
  const listOwnedBookIds = createListOwnedBookIds(deps.worldInfoExportCtx);
  const worldInfoExportAll = async function* worldInfoAll(ownerId: UserId): AsyncIterable<PortableFile> {
    for (const bookId of await listOwnedBookIds({ ownerId })) {
      // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one book at a time (bounded memory — the descriptor contract).
      const book = await exportWorldBook({ ownerId, bookId });
      if (book !== null) {
        yield book;
      }
    }
  };
  const worldInfo: PortableEntity = {
    kind: "world-info",
    dir: "world-info/",
    ext: ".json",
    exportAll: worldInfoExportAll,
    importFile: (ownerId, file) => importWorldBook({ ownerId, bytes: file.bytes }),
  };

  // D121-E: the script library rides the backup bundle as its own entity, so a restore brings the scripts
  // back even though no character/preset/chat in the bundle references them by junction. `global` is the one
  // attachment carried (it is a property of the script itself); the other three scopes point at rows the
  // bundle cannot guarantee, so they are re-attached by hand — the same posture world-info takes.
  const regex: PortableEntity = {
    kind: "regex",
    dir: "regex/",
    ext: ".json",
    async *exportAll(ownerId: UserId): AsyncIterable<PortableFile> {
      for (const file of await deps.exportRegexScripts({ ownerId })) {
        yield file;
      }
    },
    importFile: async (ownerId, file) => {
      try {
        const { created } = await deps.importRegexScript({ ownerId, bytes: file.bytes });
        return { ok: true, created };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  // F1 (P1): databank was born AFTER the portability spec froze its kind list, so a full-account backup
  // silently lost the whole document library. One file per document — `extractedText` IS the canon and can be
  // megabytes, so the stream pulls one body at a time.
  const listOwnedDocumentIds = createListOwnedDocumentIds(deps.databankCtx);
  const exportDocument = createExportDocument(deps.databankCtx);
  const importDocument = createImportDocument(deps.databankCtx);
  const databank: PortableEntity = {
    kind: "databank",
    dir: "databank/",
    ext: ".json",
    async *exportAll(ownerId: UserId): AsyncIterable<PortableFile> {
      for (const documentId of await listOwnedDocumentIds({ ownerId })) {
        // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one document (+ its canon text) at a time (bounded memory — the descriptor contract).
        const file = await exportDocument({ ownerId, documentId });
        if (file !== null) {
          yield file;
        }
      }
    },
    importFile: async (ownerId, file) => {
      try {
        const outcome = await importDocument({ ownerId, bytes: file.bytes });
        return outcome.ok ? { ok: true, created: outcome.created } : { ok: false, error: outcome.error };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  const personaExportAll = async function* personaAll(ownerId: UserId): AsyncIterable<PortableFile> {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    for (const detail of await deps.persona.list({ principal })) {
      // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one persona at a time (bounded memory).
      yield await deps.persona.export({ principal, personaId: detail.id });
    }
  };
  const persona: PortableEntity = {
    kind: "persona",
    dir: "personas/",
    ext: ".json",
    exportAll: personaExportAll,
    // Pure wiring: the parse, the refusal copy and the idempotent-merge all live in `persona/verbs/import`
    // (the ONE import path the single-entity door also calls).
    importFile: async (ownerId, file) => {
      try {
        const principal = await deps.resolveOwnerPrincipal(ownerId);
        const outcome = await deps.persona.import({ principal, bytes: file.bytes });
        return outcome.ok ? { ok: true, created: outcome.created } : { ok: false, error: outcome.error };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  const characterExportAll = async function* characterAll(ownerId: UserId): AsyncIterable<PortableFile> {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    for (const characterId of await deps.listOwnedCharacterIds(ownerId)) {
      // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one card (+ its avatar blob) at a time (bounded memory).
      const card = await deps.exportService.exportCharacter({ principal, characterId });
      if (card !== null) {
        yield { filename: card.filename, bytes: card.bytes };
      }
    }
  };
  const character: PortableEntity = {
    kind: "character",
    dir: "characters/",
    ext: ".png",
    exportAll: characterExportAll,
    importFile: async (ownerId, file) => {
      try {
        const service = await buildOwnerImport(deps, ownerId);
        const result = await service.importCharacter({
          card: { bytes: file.bytes, filename: file.filename },
        });
        return { ok: true, created: result.created };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  // R6 — an ACCOUNT BACKUP carries the ORB-NATIVE bundle, not the ST interchange. The jsonl arm was the
  // spec's ruled shape (G-3) and is correct for ST parity, but it carries messages and nothing else: every
  // chat-anchored plane born after the spec froze (rpg campaigns, `chat_injections`, room overrides, the
  // `chat_tags` overlay, the per-chat variable/macro picks) was unportable BY CONSTRUCTION, so "backup
  // everything" quietly excluded whole planes (F9). It is NOT a second `PORTABLE_KINDS` member: that would
  // put every transcript in every backup TWICE and hand the import router two answers per chat. The jsonl arm
  // lives on where it belongs — the single-chat share door (`GET /api/export/chat/:id?format=jsonl|txt`) and
  // the ST import, which the descriptor's import half still accepts by extension.
  const chatExportAll = async function* chatAll(ownerId: UserId): AsyncIterable<PortableFile> {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    for (const { chatId, handle } of await deps.exportService.listHostChats({ principal })) {
      // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one chat at a time (bounded memory — the descriptor contract).
      const bundle = await deps.exportService.exportChatBundle({ principal, chatId });
      if (bundle !== null) {
        // Nest under the host handle, chat id as the leaf (same-title chats can't collide) — the jsonl arm's
        // layout, unchanged, so the DIRECTORY stays a usable re-link fallback for a file whose carried seat
        // list did not survive. The verb's own flat slug is the single-chat DOWNLOAD name, not this.
        yield { filename: `${handle}/${chatId}${CHAT_BUNDLE_EXT}`, bytes: bundle.bytes };
      }
    }
  };
  const chat: PortableEntity = {
    kind: "chat",
    dir: "chats/",
    // The extension an EXPORT writes. The import half accepts BOTH formats under this dir (an ST `.jsonl`
    // routes to the interchange verb, anything else to the orb-native one, which refuses by envelope).
    ext: CHAT_BUNDLE_EXT,
    exportAll: chatExportAll,
    // Pure wiring: the format routing, the handle derivation, both parses and every refusal copy live in
    // `import/verbs/import-chat-file` + `import-chat-bundle` (the ONE path `POST /api/import/chat` also calls).
    importFile: async (ownerId, file) => {
      try {
        const service = await buildOwnerImport(deps, ownerId);
        const outcome = await service.importChatFile({ filename: file.filename, bytes: file.bytes });
        return outcome.ok ? { ok: true, created: outcome.created } : { ok: false, error: outcome.error };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  return [assets, gallery, tag, theme, userSettings, preset, worldInfo, regex, databank, persona, character, chat];
}
