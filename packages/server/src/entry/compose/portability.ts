// Composition seam that assembles the injected `PortabilityRegistry` the delivery core iterates. The
// entity-agnostic core knows nothing about any specific entity; adding an entity = append one descriptor
// here. Each `PortableEntity` is `{ kind, dir, ext, exportAll, importFile }`: `exportAll` streams the
// owner's rows as portable files; `importFile` parses one file's bytes into the owner's tables, never
// throwing for a malformed file (returns `{ok:false,error}`). Import order is NOT this array's order — the
// core imports by `PORTABLE_IMPORT_ORDER` (contracts/portability).

import type { Principal } from "@orb/contracts/identity";
import type { PersonaBackupInput } from "@orb/contracts/persona";
import type {
  PortabilityRegistry,
  PortableEntity,
  PortableFile,
  PortableImportOutcome,
} from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { characters, chatParticipants, worldBooks } from "@orb/db";
import type { CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { AssetsContext } from "#domain/assets";
import {
  createExportAssets,
  createExportGallery,
  createImportAsset,
  createImportGallery,
} from "#domain/assets";
import type { BulkImportChats } from "#domain/chat";
import type { ExportService } from "#domain/export";
import type { ImportService } from "#domain/import";
import { createImportService } from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createExportPresets, createImportPresets } from "#domain/preset";
import type { SettingsContext } from "#domain/settings";
import {
  createThemeExport,
  createThemeImport,
  createUserSettingsExport,
  createUserSettingsImport,
} from "#domain/settings";
import type { TagContext } from "#domain/tag";
import { createTagLibraryExport, createTagLibraryImport } from "#domain/tag";
import type { ImportStandaloneLorebook, WorldInfoExportContext } from "#domain/world-info";
import { createExportWorldBook, createImportWorldBook } from "#domain/world-info";
import { sha256Hex } from "#kit/content-hash";
import { parseChatJsonl } from "#kit/serde/chat";
import type {
  ImportAssetPort,
  ImportCharacterPort,
  ImportTagPort,
  ImportWorldInfoPort,
} from "../import";
import { buildImportContext } from "../import";

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
  readonly persona: Pick<PersonaService, "export" | "import" | "list">;
  readonly exportService: Pick<ExportService, "exportCharacter" | "exportChat">;
  readonly character: ImportCharacterPort;
  readonly listOwnedCharacterIds: (ownerId: UserId) => Promise<readonly CharacterId[]>;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook: ImportWorldInfoPort["importLorebook"];
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** Build the per-owner `ImportContext`, shared by both the character card path and the chat path. */
async function buildOwnerImport(deps: PortabilityDeps, ownerId: UserId): Promise<ImportService> {
  const principal = await deps.resolveOwnerPrincipal(ownerId);
  const ctx = buildImportContext({
    principal,
    character: deps.character,
    storeAvatar: deps.storeAvatar,
    attachCardTag: deps.attachCardTag,
    importLorebook: deps.importLorebook,
    profile: {
      now: deps.now,
      personaByUserName: new Map(),
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      enqueueBackfill: deps.enqueueBackfill,
      reconcileStats: deps.reconcileImportStats,
    },
  });
  return createImportService(ctx);
}

/** Wrap a single-file export verb (`() => Promise<{filename,bytes}>`) as the streaming `exportAll`. */
function oneFile(
  produce: (ownerId: UserId) => Promise<{ readonly filename: string; readonly bytes: Uint8Array }>,
): PortableEntity["exportAll"] {
  return async function* exportOne(ownerId: UserId): AsyncIterable<PortableFile> {
    yield await produce(ownerId);
  };
}

/** Map the error thrown by a domain import verb to a `{ok:false}` outcome (the never-throw contract). */
function errorOutcome(err: unknown): PortableImportOutcome {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

// A chat bundles under chats/<host-handle>/<file>.jsonl; export resolves each host chat's primary
// character (first by join order) to its handle, import parses the handle back out of the directory.
interface HostChat {
  readonly chatId: ChatId;
  readonly handle: string;
}

/** Every chat the owner hosts, paired with the handle of its primary seated character. A chat with no
 *  seated character is skipped. */
async function listHostChats(db: Db, ownerId: UserId): Promise<HostChat[]> {
  const hostRows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    );
  const out: HostChat[] = [];
  for (const { chatId } of hostRows) {
    // biome-ignore lint/performance/noAwaitInLoops: enumeration is intentionally sequential (bounded per-owner set); one small keyed read per hosted chat.
    const seat = await db
      .select({ handle: characters.handle })
      .from(chatParticipants)
      .innerJoin(characters, eq(characters.id, chatParticipants.characterId))
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          isNotNull(chatParticipants.characterId),
          isNull(chatParticipants.leftSeq),
        ),
      )
      .orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id))
      .limit(1);
    const handle = seat[0]?.handle;
    if (handle !== undefined) {
      out.push({ chatId, handle });
    }
  }
  return out;
}

/** Every world-info book the owner owns. */
async function listOwnedBookIds(db: Db, ownerId: UserId): Promise<readonly WorldBookId[]> {
  const rows = await db
    .select({ id: worldBooks.id })
    .from(worldBooks)
    .where(eq(worldBooks.ownerId, ownerId));
  return rows.map((r) => r.id);
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

  const exportTheme = createThemeExport(deps.settingsCtx);
  const importTheme = createThemeImport(deps.settingsCtx);
  const theme: PortableEntity = {
    kind: "theme",
    dir: "themes/",
    ext: ".json",
    exportAll: oneFile((ownerId) => exportTheme(ownerId)),
    importFile: (ownerId, file) => importTheme(ownerId, file.bytes),
  };

  const exportUserSettings = createUserSettingsExport(deps.settingsCtx);
  const importUserSettings = createUserSettingsImport(deps.settingsCtx);
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
  const worldInfoExportAll = async function* worldInfoAll(
    ownerId: UserId,
  ): AsyncIterable<PortableFile> {
    for (const bookId of await listOwnedBookIds(deps.worldInfoExportCtx.db, ownerId)) {
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

  const personaExportAll = async function* personaAll(
    ownerId: UserId,
  ): AsyncIterable<PortableFile> {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    for (const detail of await deps.persona.list({ principal })) {
      // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one persona at a time (bounded memory).
      const backup = await deps.persona.export({ principal, personaId: detail.id });
      yield {
        filename: `${slugifyHandle(detail.name)}.json`,
        bytes: ENC.encode(JSON.stringify(backup)),
      };
    }
  };
  const persona: PortableEntity = {
    kind: "persona",
    dir: "personas/",
    ext: ".json",
    exportAll: personaExportAll,
    importFile: async (ownerId, file) => {
      let input: PersonaBackupInput;
      try {
        input = JSON.parse(DEC.decode(file.bytes)) as PersonaBackupInput;
      } catch {
        return { ok: false, error: "not a valid JSON persona backup" };
      }
      try {
        const principal = await deps.resolveOwnerPrincipal(ownerId);
        // Idempotent-merge: a same-name persona merges in place (zero dup rows on re-import).
        await deps.persona.import({ principal, input });
        return { ok: true };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  const characterExportAll = async function* characterAll(
    ownerId: UserId,
  ): AsyncIterable<PortableFile> {
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

  const chatExportAll = async function* chatAll(ownerId: UserId): AsyncIterable<PortableFile> {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    for (const { chatId, handle } of await listHostChats(deps.db, ownerId)) {
      // biome-ignore lint/performance/noAwaitInLoops: enumeration streams one chat transcript at a time (bounded memory).
      const transcript = await deps.exportService.exportChat({
        principal,
        chatId,
        format: "jsonl",
      });
      if (transcript !== null) {
        // Nest under the host handle; the chat id keeps the leaf unique (same-title chats can't collide).
        yield { filename: `${handle}/${chatId}.jsonl`, bytes: ENC.encode(transcript.text) };
      }
    }
  };
  const chat: PortableEntity = {
    kind: "chat",
    dir: "chats/",
    ext: ".jsonl",
    exportAll: chatExportAll,
    importFile: async (ownerId, file) => {
      const slash = file.filename.indexOf("/");
      if (slash === -1) {
        return { ok: false, error: "chat file is not under a character-handle directory" };
      }
      const handle = file.filename.slice(0, slash);
      const leaf = file.filename.slice(slash + 1);
      const ref = await deps.character.findByHandle({ ownerId, handle });
      if (ref === null) {
        return { ok: false, error: `no character with handle "${handle}" on this account` };
      }
      const parsed = parseChatJsonl(DEC.decode(file.bytes), {
        fileName: leaf,
        charDirName: handle,
      });
      if (parsed === null) {
        return { ok: false, error: "not a valid chat .jsonl file" };
      }
      try {
        const service = await buildOwnerImport(deps, ownerId);
        const result = await service.importChats({
          characterId: ref.characterId,
          chats: [{ parsed, importedFrom: file.filename, importHash: sha256Hex(file.bytes) }],
        });
        return { ok: true, created: result.chatsImported > 0 };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };

  return [assets, gallery, tag, theme, userSettings, preset, worldInfo, persona, character, chat];
}
