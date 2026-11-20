import type { StoreAvatarAsset } from "@orb/contracts/assets";
import type { ImportedDocumentScopes } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { ImportDirectory, ImportFsPort, ImportKindCounts, ImportPreview } from "@orb/contracts/import";
import { clipImportText, IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import type { ImportCardScriptsResult, ImportGlobalScripts, RegexScriptCard } from "@orb/contracts/regex";
import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { ASSET_UPLOAD_MAX_BYTES, IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { AttachOwnedBooksByName } from "@orb/contracts/world-info";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { SNIFFED_IMAGE_MIMES, sniffMime } from "@orb/kit/image-sniff";
import { inertFieldCounts } from "@orb/kit/world-info";
import type {
  CollectedBackground,
  CollectedCard,
  CollectedChat,
  CollectedDocument,
  CollectedGalleryImage,
  CollectedGroup,
  CollectedPersona,
  CollectedPreset,
  CollectedTheme,
  CollectedWorld,
  CollectResult,
} from "../contract/collection.ts";
import { importFailureReason, ProfileImportLimitError } from "../contract/errors.ts";
import type { ImportPersonaInput } from "../contract/params.ts";
import type { CollectedProfile, ProfileCollected, ProfileCollectRecords, ProfileDirImportDeps, ProfileWaveOutcomes } from "../contract/profile-directory.ts";
import type {
  ImportCardBookNote,
  ImportCharacterResult,
  ImportChatsResult,
  ImportReport,
  ImportSkippedCard,
  ImportSkippedCardTag,
  ImportUnresolvedPinnedPersona,
  ImportWorldNote,
} from "../contract/results.ts";
import { createImportService } from "../service.ts";
import { buildImportContext } from "../substrate/build-context.ts";
import { seatsOf } from "../substrate/group.ts";
import { buildImportPreview, countImportKinds, refusedGroups } from "../substrate/preview.ts";
import { collectBundlesFromDir } from "./collect.ts";
import { findOwnership } from "./profile-ownership.ts";

/** Apply the direct-tree byte belts at the read boundary. `stat` rejects before the allocation, while the
 *  post-read check closes a file-growth race. Repeated reads of one path count only its largest observed
 *  size toward the run-wide budget. */
function withProfileReadLimits(fs: ImportFsPort): ImportFsPort {
  const accountedByPath = new Map<string, number>();
  let totalBytes = 0;
  const limited = (dir: ImportDirectory | null): ImportDirectory | null => {
    if (dir === null) {
      return null;
    }
    return {
      ...dir,
      openDirectory: async (name): Promise<ImportDirectory | null> => limited(await dir.openDirectory(name)),
      readFile: async (name): Promise<Uint8Array> => {
        const path = fs.join(dir.path, name);
        const previousBytes = accountedByPath.get(path) ?? 0;
        const declaredBytes = (await dir.stat(name)).size;
        if (declaredBytes > IMPORT_TREE_MAX_FILE_BYTES) {
          throw new ProfileImportLimitError(
            "profile_file_too_large",
            `profile file ${path} declares ${declaredBytes} bytes, over the ${IMPORT_TREE_MAX_FILE_BYTES} byte cap`,
          );
        }
        const declaredIncrease = Math.max(0, declaredBytes - previousBytes);
        if (totalBytes + declaredIncrease > IMPORT_TREE_MAX_TOTAL_BYTES) {
          throw new ProfileImportLimitError("profile_total_too_large", `profile files exceed the ${IMPORT_TREE_MAX_TOTAL_BYTES} byte aggregate cap`);
        }

        const bytes = await dir.readFile(name);
        if (bytes.length > IMPORT_TREE_MAX_FILE_BYTES) {
          throw new ProfileImportLimitError(
            "profile_file_too_large",
            `profile file ${path} produced ${bytes.length} bytes, over the ${IMPORT_TREE_MAX_FILE_BYTES} byte cap`,
          );
        }
        const observedBytes = Math.max(declaredBytes, bytes.length);
        const observedIncrease = Math.max(0, observedBytes - previousBytes);
        if (totalBytes + observedIncrease > IMPORT_TREE_MAX_TOTAL_BYTES) {
          throw new ProfileImportLimitError("profile_total_too_large", `profile files exceed the ${IMPORT_TREE_MAX_TOTAL_BYTES} byte aggregate cap`);
        }
        accountedByPath.set(path, observedBytes);
        totalBytes += observedIncrease;
        return bytes;
      },
    };
  };
  return { ...fs, openTree: async (): Promise<ImportDirectory | null> => limited(await fs.openTree()) };
}

/** Every collected card with the profile result that holds it, in run order. A card's library tags and extra books
 *  belong to its own profile: two profiles can keep different cards under one filename. */
function cardsWithProfile(profiles: readonly CollectedProfile[]): { readonly bundle: CollectedCard; readonly result: CollectResult }[] {
  return profiles.flatMap(({ result }) => result.bundles.map((bundle) => ({ bundle, result })));
}

/** Append one profile dir's "not imported" records onto the run-wide set. Split out of the collect loop so the
 *  loop reads as "collect, merge, record" — the record list grows with every new plane and inlining it made
 *  the loop the file's most complex function. */
function mergeRecords(into: ProfileCollectRecords, from: Awaited<ReturnType<typeof collectBundlesFromDir>>): void {
  into.unreadableCards.push(...from.unreadableCards);
  into.invalidCards.push(...from.invalidCards);
  into.unreadableWorlds.push(...from.unreadableWorlds);
  into.unreadablePresets.push(...from.unreadablePresets);
  into.refusedThemes.push(...from.refusedThemes);
  into.skippedBackgrounds.push(...from.skippedBackgrounds);
  into.skippedDocuments.push(...from.skippedDocuments);
  into.documentNotes.push(...from.documentNotes);
  into.skippedGalleryImages.push(...from.skippedGalleryImages);
  into.unreadableGroups.push(...from.unreadableGroups);
  for (const g of from.groups) {
    into.missingGroupChats.push(...g.missingChatLeaves);
  }
  into.missingPersonaAvatars.push(...from.missingPersonaAvatars);
  into.skippedChats.push(...from.skippedChats);
  into.orphanChatDirs.push(...from.orphanChatDirs);
  into.skippedCharacters.push(...from.skippedCharacters);
  into.unhandled.push(...from.unhandled);
  into.unhandledSettings.push(...from.unhandledSettings);
  into.truncatedDirs.push(...from.truncatedDirs);
}

/** Collect every user-profile subdirectory under the root, merging the per-dir results into one set. A
 *  non-profile entry (a stray file, a `_cache` dir with no `characters/`) yields an empty collect and adds
 *  nothing — the loader's port returns `[]` for a missing subdir rather than throwing. An `other` entry, such as a link
 *  whose target is gone, may have been a profile, so the report names it. */
async function collectProfileRoot(deps: ProfileDirImportDeps): Promise<ProfileCollected> {
  const { fs, signal } = deps;
  const profiles: CollectedProfile[] = [];
  const rootUnhandled: string[] = [];
  const bundles: CollectedCard[] = [];
  const personas: CollectedPersona[] = [];
  const worlds: CollectedWorld[] = [];
  const presets: CollectedPreset[] = [];
  const themes: CollectedTheme[] = [];
  const backgrounds: CollectedBackground[] = [];
  const groups: CollectedGroup[] = [];
  // FIRST profile dir carrying a `power_user` section wins: an ST snapshot is one box's preferences, and
  // letting a later dir's `fontScale` overwrite an earlier one would make the outcome depend on readdir order.
  let appearance: Record<string, unknown> = {};
  const orphanBundles: CollectResult["orphanBundles"] = [];
  // Global regex scripts CONCAT across dirs (the lift content-dedups repeats).
  const globalRegexScripts: RegexScriptCard[] = [];
  const globalRegexScriptNotes: { readonly field: string; readonly reason: string }[] = [];
  const documents: CollectedDocument[] = [];
  const galleryImages: CollectedGalleryImage[] = [];
  const r: ProfileCollectRecords = {
    unreadableCards: [],
    invalidCards: [],
    unreadableWorlds: [],
    unreadablePresets: [],
    refusedThemes: [],
    skippedBackgrounds: [],
    skippedDocuments: [],
    documentNotes: [],
    skippedGalleryImages: [],
    unreadableGroups: [],
    missingGroupChats: [],
    missingPersonaAvatars: [],
    skippedChats: [],
    orphanChatDirs: [],
    skippedCharacters: [],
    unhandled: [],
    unhandledSettings: [],
    truncatedDirs: [],
  };
  await using root = await fs.openTree();
  for (const ent of ((await root?.list()) ?? []).toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (signal.aborted) {
      break;
    }
    if (ent.kind === "other") {
      r.unhandled.push(ent.name);
      rootUnhandled.push(ent.name);
    }
    await using profile = ent.kind === "directory" ? ((await root?.openDirectory(ent.name)) ?? null) : null;
    if (profile === null) {
      continue;
    }
    const result = await collectBundlesFromDir(fs, profile, []);
    profiles.push({ name: ent.name, result });
    bundles.push(...result.bundles);
    personas.push(...result.personas);
    worlds.push(...result.worlds);
    presets.push(...result.presets);
    themes.push(...result.themes);
    backgrounds.push(...result.backgrounds);
    groups.push(...result.groups);
    if (Object.keys(appearance).length === 0) {
      appearance = result.appearance;
    }
    orphanBundles.push(...result.orphanBundles);
    globalRegexScripts.push(...result.globalRegexScripts);
    globalRegexScriptNotes.push(...result.globalRegexScriptNotes);
    documents.push(...result.documents);
    galleryImages.push(...result.galleryImages);
    mergeRecords(r, result);
  }
  const skipped =
    r.unreadableCards.length +
    r.unreadableWorlds.length +
    r.unreadablePresets.length +
    r.refusedThemes.length +
    r.skippedBackgrounds.length +
    r.skippedDocuments.length +
    r.skippedGalleryImages.length +
    r.unreadableGroups.length +
    r.missingGroupChats.length +
    r.skippedChats.length +
    r.skippedCharacters.length;
  return {
    bundles,
    personas,
    worlds,
    presets,
    themes,
    backgrounds,
    appearance,
    groups,
    orphanBundles,
    globalRegexScripts,
    globalRegexScriptNotes,
    documents,
    galleryImages,
    skipped,
    profiles,
    rootUnhandled,
    ...r,
  };
}

// scanned = every examined ST entity (each kind's count) plus the recorded skips. A refused group (no seat, or no
// transcript) counts once, as the skip the preview lists. Its transcripts are not chats: no room lands for them, so
// they stay out of `found.chats` and out of `scanned`.
function tallyScanned(found: ImportKindCounts, collected: ProfileCollected): number {
  return Object.values(found).reduce((sum, count) => sum + count, collected.skipped + refusedGroups(collected).length);
}

/** Store one persona's avatar (maxBytes-capped) and pair it into the canonical persona-import input. An avatar the
 *  store refuses (not a picture, over the cap) costs only the picture: the persona imports without art and the file is
 *  named with the refusal. Any other failure still fails the run. */
async function toPersonaInput(
  store: StoreAvatarAsset,
  principal: Principal,
  p: CollectedPersona,
): Promise<{ readonly input: ImportPersonaInput; readonly skipped?: ImportSkippedCard }> {
  if (p.avatarBytes === undefined) {
    return { input: { parsed: p.parsed, avatarAssetId: null } };
  }
  try {
    const stored = await store({
      principal,
      bytes: p.avatarBytes,
      kind: "avatar",
      // ST names an avatar file by its persona key, not its format, so the type comes from the bytes.
      mime: sniffMime(p.avatarBytes),
      enforceMagic: true,
      // One single-asset ceiling repo-wide — the profile importer deliberately shares the upload cap.
      maxBytes: ASSET_UPLOAD_MAX_BYTES,
    });
    return { input: { parsed: p.parsed, avatarAssetId: stored.assetId } };
  } catch (err) {
    if (err instanceof DomainOperationError) {
      return { input: { parsed: p.parsed, avatarAssetId: null }, skipped: { file: p.parsed.avatarFile, reason: importFailureReason(err) } };
    }
    throw err;
  }
}

/** The ST BACKGROUND wave: CAS-store each collected image/video under the owner (kind `background`,
 *  maxBytes-capped, magic-verified) and turn it into a ready `BackgroundLibraryEntry`. A picture is stored under the
 *  type its bytes are, as a persona avatar is, so a JPEG named `.png` lands as a JPEG; any other file keeps its
 *  extension's type for the signature check. PER-FILE ISOLATION — a background the store refuses (a `.png` that is
 *  no picture, an over-cap blob) is recorded with its reason and never aborts the batch, exactly like the card wave.
 *
 *  The entries are APPENDED to `appearance.backgroundLibrary` by the settings op below, which is what makes
 *  them (a) GC-rooted — an unreferenced blob is reclaimed an hour after the import — and (b) pickable in the
 *  background picker. The asset itself also shows up in `assets.listOwned`, the pool every character gallery
 *  curates from (owner ruling: "backgrounds is our gallery — a media store for characters and etc"). */
async function storeCollectedBackgrounds(
  deps: ProfileDirImportDeps,
  backgrounds: readonly CollectedBackground[],
): Promise<{ readonly entries: BackgroundLibraryEntry[]; readonly storedFiles: string[]; readonly skipped: ImportSkippedCard[] }> {
  const entries: BackgroundLibraryEntry[] = [];
  /** The source filename of each stored entry, index-aligned to `entries` — what the report names when the
   *  blobs land in the CAS but no applier attaches them. */
  const storedFiles: string[] = [];
  const skipped: ImportSkippedCard[] = [];
  const store = deps.storeBackground;
  const newEntryId = deps.newBackgroundEntryId;
  if (store === undefined || newEntryId === undefined) {
    return { entries, storedFiles, skipped: backgrounds.map((b) => ({ file: b.filename, reason: "background import is not wired into this composition" })) };
  }
  for (const background of backgrounds) {
    if (deps.signal.aborted) {
      break;
    }
    // the catch pushes `{ file, reason }` onto `skipped`, which
    // `storeCollectedBackgrounds` returns and `reportFrom` lists as the report's `skippedBackgrounds`.
    // Ends if `skipped` stops reaching the report.
    const sniffed = sniffMime(background.bytes);
    const mime = SNIFFED_IMAGE_MIMES.some((image) => image === sniffed) ? sniffed : background.mime;
    try {
      const stored = await store({
        principal: deps.principal,
        bytes: background.bytes,
        mime,
        // One single-asset ceiling repo-wide — the profile importer deliberately shares the upload cap.
        maxBytes: ASSET_UPLOAD_MAX_BYTES,
      });
      entries.push({ entryId: newEntryId(), assetId: stored.assetId, assetHash: stored.hash, mime, name: background.name });
      storedFiles.push(background.filename);
    } catch (err) {
      skipped.push({ file: background.filename, reason: importFailureReason(err) });
    }
  }
  return { entries, storedFiles, skipped };
}

/** The BACKGROUND + `appearance` wave: CAS-store the blobs, then land them (and the `power_user` ergonomics
 *  patch) through the settings applier in ONE serialized write. Split out of the driver so the UNWIRED-applier
 *  arm has somewhere to live: with no applier there is no `backgroundLibrary` append, so the stored blobs are
 *  unreferenced — unreachable from the picker and reclaimed by the GC an hour later — which used to be
 *  entirely silent (neither counted nor reported). `storedFiles` is index-aligned to `entries`, so the
 *  report names exactly the files that landed in the CAS and nowhere else. */
async function landBackgroundsAndAppearance(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
): Promise<{
  readonly backgroundsImported: number;
  /** Stored backgrounds the library already carried, or an earlier background of the upload added. */
  readonly backgroundsReused: number;
  readonly appearanceKeysApplied: readonly string[];
  /** The store's own refusals PLUS the stored-but-unattached rows. */
  readonly skippedBackgrounds: readonly ImportSkippedCard[];
}> {
  const stored = await storeCollectedBackgrounds(deps, collected.backgrounds);
  const apply = deps.applyImportedAppearance;
  if (apply === undefined || (stored.entries.length === 0 && Object.keys(collected.appearance).length === 0)) {
    const unattached = stored.storedFiles.map((file) => ({
      file,
      reason: "stored in your media library but NOT attached to the background picker — the appearance applier is not wired into this composition",
    }));
    return { backgroundsImported: 0, backgroundsReused: 0, appearanceKeysApplied: [], skippedBackgrounds: [...stored.skipped, ...unattached] };
  }
  const outcome = await apply(deps.principal.userId, { patch: collected.appearance, backgroundLibrary: stored.entries });
  return {
    backgroundsImported: outcome.backgroundsAdded,
    // The applier appends each stored entry whose image the library does not carry yet; every other one was held.
    backgroundsReused: stored.entries.length - outcome.backgroundsAdded,
    appearanceKeysApplied: outcome.patchedKeys,
    skippedBackgrounds: stored.skipped,
  };
}

/** Import the collected standalone ST worlds as UNATTACHED owner library books, additively: an equal book is
 *  reused and a same-named different one lands under a free name. Returns the net-new count, one note per
 *  book for the report, and the row each world landed as, keyed by the name the profile calls it — the map the
 *  name-link wave binds by, since the landed row may carry another name. Aborts cleanly on signal. */
async function importCollectedWorlds(
  deps: ProfileDirImportDeps,
  worlds: readonly CollectedWorld[],
): Promise<{ readonly created: number; readonly reused: number; readonly notes: ImportWorldNote[]; readonly landed: ReadonlyMap<string, WorldBookId> }> {
  let created = 0;
  let reused = 0;
  const notes: ImportWorldNote[] = [];
  const landed = new Map<string, WorldBookId>();
  const results = await deps.importStandaloneLorebooks({
    ownerId: deps.principal.userId,
    books: worlds.map(({ book }) => book),
    dryRun: false,
    signal: deps.signal,
  });
  for (const [i, world] of worlds.entries()) {
    const bookResult = results[i];
    // An aborted batch stops short; the books after it were never attempted.
    if (bookResult === undefined) {
      break;
    }
    if (bookResult.created) {
      created += 1;
    } else {
      reused += 1;
    }
    // A multi-profile upload can carry one name twice; the first profile's book keeps it, as personas do.
    if (!landed.has(world.book.name)) {
      landed.set(world.book.name, bookResult.worldBookId);
    }
    notes.push({
      name: bookResult.name,
      renamedFrom: bookResult.renamedFrom,
      created: bookResult.created,
      entries: world.book.entries.length,
      inertFields: inertFieldCounts(world.book.entries),
    });
  }
  return { created, reused, notes, landed };
}

/** Assemble the import report from the merged collect results + the run's counts + the per-card skips. The
 *  two structure planes (`unhandled`/`unhandledSettings`) are deduped — a multi-profile upload lists the same
 *  section names per user dir. */
/** The preset + group waves' accounting, threaded into the report. Zero-valued (and empty) on a dryRun and on
 *  a profile carrying neither plane, which is byte-identically the pre-epic report. */

const NO_WAVES: ProfileWaveOutcomes = {
  presetsImported: 0,
  presetsCreated: 0,
  skippedPresets: [],
  presetNotes: [],
  themesImported: 0,
  themesCreated: 0,
  skippedThemes: [],
  themeNotes: [],
  worldNotes: [],
  backgroundsImported: 0,
  skippedBackgrounds: [],
  documentsImported: 0,
  skippedDocuments: [],
  documentNotes: [],
  galleryImagesImported: 0,
  skippedGalleryImages: [],
  skippedPersonaAvatars: [],
  skippedCardTags: [],
  cardNotes: [],
  cardBookNotes: [],
  appearanceKeysApplied: [],
  groupsImported: 0,
  groupChatsImported: 0,
  skippedGroups: [],
  skippedGroupMembers: [],
  ambiguousSpeakerNames: [],
  seatedDisabledMembers: [],
  unresolvedPinnedPersonas: [],
  chatsPersonaHealed: 0,
  skippedChatRows: [],
  personasMergedKeys: [],
  memoryChatIds: [],
  globalRegexScriptsLifted: 0,
  globalRegexScriptsReused: 0,
  globalRegexSkippedReason: null,
  cardRegexScriptsLifted: 0,
  cardRegexScriptsReused: 0,
  worldLinksAttached: 0,
  worldLinksMissing: [],
  worldLinksSkippedReason: null,
  orphanImports: [],
  orphanSkipped: [],
};

interface ReportArgs {
  readonly collected: ProfileCollected;
  readonly scanned: number;
  readonly changed: number;
  readonly dryRun: boolean;
  readonly skippedCards: readonly ImportSkippedCard[];
  readonly waves: ProfileWaveOutcomes;
  /** What the folder holds, so a rehearsal's structural zeroes never read as "this profile carries none of
   *  these planes". */
  readonly found: ImportKindCounts;
  /** Present ONLY on a dryRun — the names behind the counts. */
  readonly preview?: ImportPreview;
  /** Present ONLY on a real run. */
  readonly held?: ImportReport["held"];
}

function reportFrom({ collected, scanned, changed, skippedCards, waves, found, dryRun, preview, held }: ReportArgs): ImportReport {
  return {
    scanned,
    changed,
    dryRun,
    ...(held === undefined ? {} : { held }),
    found,
    preview: preview ?? null,
    skippedCards: [...collected.invalidCards, ...skippedCards],
    unreadableCards: collected.unreadableCards,
    unreadableWorlds: collected.unreadableWorlds,
    unreadablePresets: collected.unreadablePresets,
    unreadableGroups: collected.unreadableGroups,
    missingGroupChats: collected.missingGroupChats,
    missingPersonaAvatars: collected.missingPersonaAvatars,
    ...waves,
    // ONE "did not import" list per plane, whichever stage refused: the CONVERTER's refusals (collect-time —
    // unreadable / colour-less; a non-media background
    // file) joined with the WRITE stage's (the settings domain refused the theme; the CAS refused the blob).
    skippedThemes: [...collected.refusedThemes, ...waves.skippedThemes],
    skippedBackgrounds: [...collected.skippedBackgrounds, ...waves.skippedBackgrounds],
    skippedDocuments: [...collected.skippedDocuments, ...waves.skippedDocuments],
    documentNotes: [...collected.documentNotes, ...waves.documentNotes],
    skippedGalleryImages: [...collected.skippedGalleryImages, ...waves.skippedGalleryImages],
    skippedChats: collected.skippedChats,
    orphanChatDirs: collected.orphanChatDirs,
    skippedCharacters: collected.skippedCharacters,
    unhandled: [...new Set(collected.unhandled)],
    unhandledSettings: [...new Set(collected.unhandledSettings)],
    truncatedDirs: collected.truncatedDirs,
    // The silent-gap sweep's counts: the FOUND halves are collect-time facts (real on a dryRun too); the
    // lifted/attached halves ride `waves` above and are zero on a dryRun, like every other write outcome.
    globalRegexScriptsFound: collected.globalRegexScripts.length,
    globalRegexScriptNotes: collected.globalRegexScriptNotes,
  };
}

/** The mime of a Data Bank file: SillyTavern stores every attachment as converted text. */
const DATABANK_TEXT_MIME = "text/plain";

// The rows a file's scopes resolve to, and whether a card or transcript it named landed no row. A switched-off file
// keeps no scope at all.
function documentScopes(
  document: CollectedDocument,
  characterIdByCard: ReadonlyMap<CollectedCard, CharacterId>,
  chatIdByChat: ReadonlyMap<CollectedChat, ChatId>,
): { readonly scopes: ImportedDocumentScopes; readonly dropped: boolean } {
  if (document.disabled) {
    return { scopes: { global: false, characterIds: [], chatIds: [] }, dropped: false };
  }
  const characterIds = document.cards.flatMap((card) => characterIdByCard.get(card) ?? []);
  const chatIds = document.chats.flatMap((chat) => chatIdByChat.get(chat) ?? []);
  return {
    scopes: { global: document.global, characterIds, chatIds },
    dropped: characterIds.length < document.cards.length || chatIds.length < document.chats.length,
  };
}

/** The Data Bank wave, after every wave whose rows a file's scopes name: each file lands through the databank's own
 *  upload and attach verbs. A scope whose card or transcript did not land is dropped and named; a switched-off file
 *  lands with no scope. One refused file (an extraction failure) costs only itself. */
async function importCollectedDocuments(args: {
  readonly deps: ProfileDirImportDeps;
  readonly documents: readonly CollectedDocument[];
  readonly characterIdByCard: ReadonlyMap<CollectedCard, CharacterId>;
  readonly chatIdByChat: ReadonlyMap<CollectedChat, ChatId>;
}): Promise<{ readonly imported: number; readonly reused: number; readonly skipped: ImportSkippedCard[]; readonly notes: ImportSkippedCard[] }> {
  const { deps, documents, characterIdByCard, chatIdByChat } = args;
  let imported = 0;
  let reused = 0;
  const skipped: ImportSkippedCard[] = [];
  const notes: ImportSkippedCard[] = [];
  for (const document of documents) {
    if (deps.signal.aborted) {
      break;
    }
    const { scopes, dropped } = documentScopes(document, characterIdByCard, chatIdByChat);
    if (dropped) {
      notes.push({ file: document.sourceFile, reason: "a character or chat it was attached to did not import, so that attachment was dropped" });
    }
    // the catch pushes `{ file, reason }` onto `skipped`, which `runProfileDirectory` puts in the report's
    // `skippedDocuments`. Ends if `skipped` stops reaching the report.
    try {
      const { created } = await deps.importDocument({
        principal: deps.principal,
        bytes: document.bytes,
        mime: DATABANK_TEXT_MIME,
        name: document.name,
        scopes,
        signal: deps.signal,
      });
      imported += created ? 1 : 0;
      reused += created ? 0 : 1;
    } catch (err) {
      skipped.push({ file: document.sourceFile, reason: importFailureReason(err) });
    }
  }
  return { imported, reused, skipped, notes };
}

/** The gallery wave, after the character wave: each image lands in the gallery of every character its folder belongs
 *  to. An image whose characters all failed to import has nowhere to show and is named. One refused image (the store's
 *  magic check, the cap) costs only itself. */
async function importCollectedGallery(
  deps: ProfileDirImportDeps,
  images: readonly CollectedGalleryImage[],
  characterIdByCard: ReadonlyMap<CollectedCard, CharacterId>,
): Promise<{ readonly imported: number; readonly reused: number; readonly skipped: ImportSkippedCard[] }> {
  let imported = 0;
  let reused = 0;
  const skipped: ImportSkippedCard[] = [];
  for (const image of images) {
    if (deps.signal.aborted) {
      break;
    }
    const characterIds = image.cards.flatMap((card) => characterIdByCard.get(card) ?? []);
    if (characterIds.length === 0) {
      skipped.push({ file: image.sourceFile, reason: "the character this gallery belongs to did not import" });
      continue;
    }
    const sniffed = sniffMime(image.bytes);
    // the catch pushes `{ file, reason }` onto `skipped`, which `runProfileDirectory` puts in the report's
    // `skippedGalleryImages`. Ends if `skipped` stops reaching the report.
    try {
      const { created } = await deps.importGalleryImage({
        principal: deps.principal,
        bytes: image.bytes,
        mime: SNIFFED_IMAGE_MIMES.some((mime) => mime === sniffed) ? sniffed : image.mime,
        characterIds,
      });
      imported += created > 0 ? 1 : 0;
      reused += created > 0 ? 0 : 1;
    } catch (err) {
      skipped.push({ file: image.sourceFile, reason: importFailureReason(err) });
    }
  }
  return { imported, reused, skipped };
}

/** The ST card PNG extension, stripped to recover the stem `charLore` keys by (ST's `getCharaFilename`). */
const CARD_PNG_EXT = /\.png$/i;

/** The GLOBAL regex lift, one call — isolated so the op arrives as a NARROWED parameter (the same shape
 *  `attachWorldLinksFor` receives `attach` in; awaiting the optional property inline trips biome's
 *  thenable lens even though the op's contract returns a Promise). */
function liftGlobalScripts(lift: ImportGlobalScripts, ownerId: UserId, scripts: readonly RegexScriptCard[]): ReturnType<ImportGlobalScripts> {
  return lift({ ownerId, scripts });
}

/** The report's one line for the global plane's scripts refused at the write door, each named; null when none. */
function refusedScriptsLine(refused: ImportCardScriptsResult["refused"]): string | null {
  return refused.length === 0
    ? null
    : refused.map((refusal) => `script ${JSON.stringify(clipImportText(refusal.name))} not imported: ${refusal.reason}`).join("; ");
}

/** One character's world name-links, attached through the injected world-info op. `primary` is the card's
 *  own `extensions.world`; `extras` are the profile's `charLore` bindings for this card; `landed` is the
 *  worlds wave's name → row map. Missing names come back per character for the report. */
async function attachWorldLinksFor(args: {
  readonly attach: AttachOwnedBooksByName;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly bundle: CollectedCard;
  readonly extras: readonly string[];
  readonly landed: ReadonlyMap<string, WorldBookId>;
}): Promise<{ readonly attached: number; readonly missing: { character: string; book: string }[] }> {
  const { attach, ownerId, characterId, bundle, extras, landed } = args;
  const missing: { character: string; book: string }[] = [];
  let attached = 0;
  if (bundle.worldName !== null) {
    const res = await attach({ ownerId, characterId, names: [bundle.worldName], role: "primary", landed });
    attached += res.linked;
    missing.push(...res.missing.map((book) => ({ character: bundle.cardName, book })));
  }
  if (extras.length > 0) {
    const res = await attach({ ownerId, characterId, names: extras, role: "auxiliary", landed });
    attached += res.linked;
    missing.push(...res.missing.map((book) => ({ character: bundle.cardName, book })));
  }
  return { attached, missing };
}

/** The world NAME-LINK wave over every imported bundle (see the call site's ordering comment). A bundle
 *  whose card was skipped has no character to attach to — its links skip with it (the card's own skip row
 *  already tells the story). An UNWIRED attach op with real links to make is a recorded reason. */
async function attachCollectedWorldLinks(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
  characterIdByCard: ReadonlyMap<CollectedCard, CharacterId>,
  landed: ReadonlyMap<string, WorldBookId>,
): Promise<{ readonly attached: number; readonly missing: { character: string; book: string }[]; readonly skippedReason: string | null }> {
  const attach = deps.attachBooksByName;
  const missing: { character: string; book: string }[] = [];
  let attached = 0;
  let anyLinks = false;
  for (const { bundle, result: profile } of cardsWithProfile(collected.profiles)) {
    if (deps.signal.aborted) {
      break;
    }
    const extras = profile.extraBooksByCardStem.get(bundle.filename.replace(CARD_PNG_EXT, "")) ?? [];
    if (bundle.worldName === null && extras.length === 0) {
      continue;
    }
    anyLinks = true;
    const characterId = characterIdByCard.get(bundle);
    if (attach === undefined || characterId === undefined) {
      continue;
    }
    const result = await attachWorldLinksFor({ attach, ownerId: deps.principal.userId, characterId, bundle, extras, landed });
    attached += result.attached;
    missing.push(...result.missing);
  }
  const skippedReason = attach === undefined && anyLinks ? "world name-link attach is not wired into this composition" : null;
  return { attached, missing, skippedReason };
}

/** The library tag every orphan-dir mint wears (manual/accepted, the library-tag posture) — the owner's
 *  one-filter handle on every husk that needs fleshing out. */
const ORPHAN_IMPORT_TAG = "orphan import";

/** The ORPHAN wave: mint a placeholder per orphan dir (the verb owns the evidence rule + idempotency),
 *  import its transcripts through the ORDINARY chats verb, tag the mint. PER-ORPHAN ISOLATION — one bad
 *  dir is one skip row, never an aborted wave (the card wave's rule). */
async function importOrphanBundles(
  deps: ProfileDirImportDeps,
  service: ReturnType<typeof createImportService>,
  orphans: ProfileCollected["orphanBundles"],
): Promise<{
  readonly changed: number;
  /** Placeholders that already existed or an earlier directory of the upload minted, and the transcripts held. */
  readonly orphansReused: number;
  readonly chatsReused: number;
  readonly orphanImports: { dir: string; characterName: string; created: boolean; chatsImported: number }[];
  readonly orphanSkipped: { dir: string; reason: string }[];
  readonly unresolvedPins: ImportUnresolvedPinnedPersona[];
  readonly chatsPersonaHealed: number;
  readonly memoryChatIds: ChatId[];
  readonly skippedChatRows: ImportSkippedCard[];
  /** The room each orphan transcript landed on or was held under. */
  readonly chatIdByChat: Map<CollectedChat, ChatId>;
}> {
  let changed = 0;
  let orphansReused = 0;
  const chatIdByChat = new Map<CollectedChat, ChatId>();
  let chatsReused = 0;
  let chatsPersonaHealed = 0;
  const memoryChatIds: ChatId[] = [];
  const skippedChatRows: ImportSkippedCard[] = [];
  const orphanImports: { dir: string; characterName: string; created: boolean; chatsImported: number }[] = [];
  const orphanSkipped: { dir: string; reason: string }[] = [];
  const unresolvedPins: ImportUnresolvedPinnedPersona[] = [];
  for (const orphan of orphans) {
    if (deps.signal.aborted) {
      break;
    }
    // the catch pushes `{ dir, reason }` onto `orphanSkipped`, which
    // `importOrphanBundles` returns and `runProfileDirectory` puts in the report's `orphanSkipped`.
    // Ends if `orphanSkipped` stops reaching the report.
    try {
      const mint = await service.importOrphanCharacter({
        dirName: orphan.dirName,
        handle: orphan.handle,
        headerNames: orphan.chats.map((c) => c.parsed.characterName),
      });
      if (mint.created) {
        changed += 1;
        await deps.attachCardTag({
          ownerId: deps.principal.userId,
          characterId: mint.characterId,
          tagName: ORPHAN_IMPORT_TAG,
          source: "manual",
          status: "accepted",
        });
      } else {
        orphansReused += 1;
      }
      const chatResult = await service.importChats({ characterId: mint.characterId, chats: orphan.chats });
      changed += chatResult.chatsImported;
      chatsReused += chatResult.chatsReused;
      chatsPersonaHealed += chatResult.chatsPersonaHealed;
      memoryChatIds.push(...chatResult.memoryChatIds);
      unresolvedPins.push(...chatResult.unresolvedPinnedPersonas);
      skippedChatRows.push(...chatResult.skippedChatRows);
      for (const [chat, chatId] of roomsOf(orphan.chats, chatResult.rooms)) {
        chatIdByChat.set(chat, chatId);
      }
      orphanImports.push({ dir: orphan.dirName, characterName: mint.name, created: mint.created, chatsImported: chatResult.chatsImported });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      orphanSkipped.push({ dir: orphan.dirName, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return {
    changed,
    orphansReused,
    chatsReused,
    orphanImports,
    orphanSkipped,
    unresolvedPins,
    chatsPersonaHealed,
    memoryChatIds,
    skippedChatRows,
    chatIdByChat,
  };
}

/** Import one collected card bundle: the character (idempotent by importHash) then its chats. Returns the
 *  net-new count (created character + imported chats) and the resolved character id (for the tag attach).
 *  Throws are the CALLER's to isolate. */
async function importOneBundle(
  service: ReturnType<typeof createImportService>,
  bundle: CollectedCard,
): Promise<{
  readonly changed: number;
  readonly characterId: CharacterId;
  /** Whether the card reused a held character, and how many of its chats the write found already landed. */
  readonly cardReused: boolean;
  readonly chatsReused: number;
  readonly unresolvedPins: readonly ImportUnresolvedPinnedPersona[];
  /** Already-imported rooms of THIS card whose persona attribution this run back-filled (the dedup-skip HEAL). */
  readonly chatsPersonaHealed: number;
  /** The card's written real conversations (the memory-build offer's scope). */
  readonly memoryChatIds: readonly ChatId[];
  readonly skippedChatRows: readonly ImportSkippedCard[];
  /** The card's regex-script lift counts (D121-E) — summed into the report's card-lift accounting. */
  readonly scriptsLifted: number;
  readonly scriptsReused: number;
  /** What the card did not land, as the Characters dialog names it. */
  readonly notes: readonly string[];
  readonly embeddedBook: ImportCharacterResult["embeddedBook"];
  /** The room each of the card's transcripts landed on or was held under. */
  readonly rooms: readonly (readonly [CollectedChat, ChatId])[];
}> {
  let changed = 0;
  const cardResult = await service.importCharacter({ card: { bytes: bundle.cardBytes, filename: bundle.filename } });
  if (cardResult.created) {
    changed += 1;
  }
  const card = { characterId: cardResult.characterId, cardReused: !cardResult.created };
  const scripts = {
    scriptsLifted: cardResult.regexScriptsLifted,
    scriptsReused: cardResult.regexScriptsReused,
    notes: cardResult.skippedOverlays,
    embeddedBook: cardResult.embeddedBook,
  };
  if (bundle.chats.length === 0) {
    return { changed, ...card, chatsReused: 0, unresolvedPins: [], chatsPersonaHealed: 0, memoryChatIds: [], skippedChatRows: [], rooms: [], ...scripts };
  }
  const chatResult = await service.importChats({ characterId: cardResult.characterId, chats: bundle.chats });
  changed += chatResult.chatsImported;
  return {
    changed,
    ...card,
    chatsReused: chatResult.chatsReused,
    unresolvedPins: chatResult.unresolvedPinnedPersonas,
    chatsPersonaHealed: chatResult.chatsPersonaHealed,
    memoryChatIds: chatResult.memoryChatIds,
    skippedChatRows: chatResult.skippedChatRows,
    rooms: roomsOf(bundle.chats, chatResult.rooms),
    ...scripts,
  };
}

/** Each transcript with the room it landed on or was held under: the chats verb answers its rooms in input order. */
function roomsOf(chats: readonly CollectedChat[], rooms: ImportChatsResult["rooms"]): (readonly [CollectedChat, ChatId])[] {
  return chats.flatMap((chat, i) => {
    const room = rooms[i];
    return room === undefined ? [] : [[chat, room.chatId] as const];
  });
}

/** Attach the ST library tags for a just-imported character (`tag_map[card filename]` → resolve-or-create by
 *  NAME). Source `manual`/status `accepted` — these are the user's own library tags, not a card-shipped
 *  suggestion. The attaches are independent and the verb is race-safe/idempotent (try-insert, fall back on
 *  conflict; never downgrades an accepted row), so they run together; `allSettled` isolates a single tag's
 *  failure so one bad tag never loses the already-imported character. */
async function attachBundleTags(
  deps: ProfileDirImportDeps,
  bundle: CollectedCard,
  characterId: CharacterId,
  tagNames: readonly string[],
): Promise<ImportSkippedCardTag[]> {
  const ownerId = deps.principal.userId;
  const settled = await Promise.allSettled(
    tagNames.map((tagName) => deps.attachCardTag({ ownerId, characterId, tagName, source: "manual", status: "accepted" })),
  );
  // The `allSettled` result used to be DISCARDED into a `Promise<unknown>`, so a rejected attach vanished:
  // the card imported with fewer labels than the profile carried and the report said nothing. The
  // isolation stands — one bad tag still never loses the character; it is now a named row.
  const skipped: ImportSkippedCardTag[] = [];
  settled.forEach((outcome, i) => {
    const tag = tagNames[i];
    if (outcome.status === "rejected" && tag !== undefined) {
      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      skipped.push({ character: bundle.filename, tag, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  });
  return skipped;
}

/** Import every collected card bundle with PER-CARD ISOLATION: a bundle that throws (an oversized field, a
 *  malformed embedded book, any single-card defect) is skipped and counted in `failed` — it NEVER aborts the
 *  batch. Across hundreds of arbitrary ST cards some will always violate some cap; the import must still land
 *  every card that CAN import. Returns net-new `changed` + the `failed` count. */
async function importCollectedBundles(
  deps: ProfileDirImportDeps,
  service: ReturnType<typeof createImportService>,
  profiles: readonly CollectedProfile[],
): Promise<{
  readonly changed: number;
  /** Cards that reused a held character, and their chats the write found already landed. */
  readonly cardsReused: number;
  readonly chatsReused: number;
  readonly skippedCards: ImportSkippedCard[];
  /** Each imported card → the character it resolved to (created OR matched). Keyed by the card itself, not its
   *  filename: two profiles can keep different cards under one filename. */
  readonly characterIdByCard: Map<CollectedCard, CharacterId>;
  /** §5.7 — the solo wave's half of the unresolved chat-bound persona picks. */
  readonly unresolvedPins: ImportUnresolvedPinnedPersona[];
  /** The solo wave's half of the dedup-skip HEAL count. */
  readonly chatsPersonaHealed: number;
  /** The solo wave's written real conversations. */
  readonly memoryChatIds: ChatId[];
  readonly skippedChatRows: ImportSkippedCard[];
  /** The card-lift halves of the regex accounting, summed across every imported card. */
  readonly cardScriptsLifted: number;
  readonly cardScriptsReused: number;
  /** Library tags that did NOT attach to an imported card, with the reason (per-tag isolation, never silent). */
  readonly skippedCardTags: ImportSkippedCardTag[];
  /** What each imported card did not land, by card file. */
  readonly cardNotes: ImportSkippedCard[];
  readonly cardBookNotes: ImportCardBookNote[];
  /** The room each solo transcript landed on or was held under. */
  readonly chatIdByChat: Map<CollectedChat, ChatId>;
}> {
  let changed = 0;
  let cardsReused = 0;
  const chatIdByChat = new Map<CollectedChat, ChatId>();
  let chatsReused = 0;
  let chatsPersonaHealed = 0;
  const memoryChatIds: ChatId[] = [];
  const skippedChatRows: ImportSkippedCard[] = [];
  const skippedCards: ImportSkippedCard[] = [];
  const characterIdByCard = new Map<CollectedCard, CharacterId>();
  const unresolvedPins: ImportUnresolvedPinnedPersona[] = [];
  let cardScriptsLifted = 0;
  const skippedCardTags: ImportSkippedCardTag[] = [];
  const cardNotes: ImportSkippedCard[] = [];
  const cardBookNotes: ImportCardBookNote[] = [];
  let cardScriptsReused = 0;
  for (const { bundle, result: profile } of cardsWithProfile(profiles)) {
    if (deps.signal.aborted) {
      break;
    }
    // the catch pushes `{ file, reason }` onto `skippedCards`, which
    // `importCollectedBundles` returns and `runProfileDirectory` passes to `reportFrom` as `skippedCards`.
    // Ends if `skippedCards` stops reaching the report.
    try {
      const result = await importOneBundle(service, bundle);
      changed += result.changed;
      cardsReused += result.cardReused ? 1 : 0;
      chatsReused += result.chatsReused;
      chatsPersonaHealed += result.chatsPersonaHealed;
      memoryChatIds.push(...result.memoryChatIds);
      skippedChatRows.push(...result.skippedChatRows);
      unresolvedPins.push(...result.unresolvedPins);
      cardScriptsLifted += result.scriptsLifted;
      cardScriptsReused += result.scriptsReused;
      cardNotes.push(...result.notes.map((reason) => ({ file: bundle.filename, reason })));
      if (result.embeddedBook !== null) {
        cardBookNotes.push({ file: bundle.filename, ...result.embeddedBook });
      }
      characterIdByCard.set(bundle, result.characterId);
      for (const [chat, chatId] of result.rooms) {
        chatIdByChat.set(chat, chatId);
      }
      const tagNames = profile.tagsByEntityKey.get(bundle.filename);
      if (tagNames !== undefined && tagNames.length > 0) {
        skippedCardTags.push(...(await attachBundleTags(deps, bundle, result.characterId, tagNames)));
      }
    } catch (err) {
      skippedCards.push({ file: bundle.filename, reason: importFailureReason(err) });
    }
  }
  return {
    changed,
    cardsReused,
    chatsReused,
    skippedCards,
    characterIdByCard,
    unresolvedPins,
    chatsPersonaHealed,
    memoryChatIds,
    skippedChatRows,
    cardScriptsLifted,
    cardScriptsReused,
    skippedCardTags,
    cardNotes,
    cardBookNotes,
    chatIdByChat,
  };
}

/** Assemble the run's ImportContext. The post-import index pass is enqueued ONCE at the very end of the whole
 *  import (gated on `changed > 0`) — NOT per character. Reasons: (1) the per-(kind, owner) admission lock
 *  makes a per-entity enqueue collide, and an unhandled conflict aborts the import mid-loop (the "only 2 of
 *  hundreds imported" bug); (2) the index pass must run AFTER the whole import, never while it is still
 *  writing. So the per-chat `enqueueImportIndex` the importChats verb calls is a NO-OP
 *  here — the driver owns the one enqueue. */
function contextFor(deps: ProfileDirImportDeps, store: StoreAvatarAsset): ReturnType<typeof buildImportContext> {
  return buildImportContext({
    ...deps.contextFor(deps.principal, store),
    principal: deps.principal,
    ...(deps.importLorebook !== undefined ? { importLorebook: deps.importLorebook } : {}),
    ...(deps.hasPrimaryBook !== undefined ? { hasPrimaryBook: deps.hasPrimaryBook } : {}),
    ...(deps.linkCarriedBooks !== undefined ? { linkCarriedBooks: deps.linkCarriedBooks } : {}),
    ...(deps.importCardScripts !== undefined ? { importCardScripts: deps.importCardScripts } : {}),
    profile: {
      now: deps.now,
      personaByUserName: new Map(),
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      // NO-OP (see the header): the driver owns the one enqueue, so this per-chat call enqueues nothing.
      enqueueImportIndex: (): Promise<void> => Promise.resolve(),
      heldChatHashes: deps.heldChatHashes,
      exportCurrentChats: deps.exportCurrentChats,
      ownedChatTitle: deps.ownedChatTitle,
      importPresets: deps.importPresets,
      importThemes: deps.importThemes,
      adoptDefaultPersona: deps.adoptDefaultPersona,
      ...(deps.importPresetScripts !== undefined ? { importPresetScripts: deps.importPresetScripts } : {}),
    },
  });
}

/**
 * Import a staged ST profile-directory snapshot into the target owner. Returns the maintenance-pass counts
 * (scanned + changed). `dryRun` collects + matches with ZERO writes.
 */
export async function runProfileDirectory(deps: ProfileDirImportDeps): Promise<ImportReport> {
  const collected = await collectProfileRoot({ ...deps, fs: withProfileReadLimits(deps.fs) });
  const found = countImportKinds(collected);
  const scanned = tallyScanned(found, collected);

  if (deps.dryRun) {
    const owned = await findOwnership(deps, collected);
    return reportFrom({
      collected,
      scanned,
      changed: [...owned.characters.values()].filter(({ reuse }) => reuse === null).length,
      dryRun: true,
      skippedCards: [],
      // Every WRITE outcome is zero because nothing was written; `found` beside it says what the folder holds,
      // so a rehearsal is never mistaken for an empty profile.
      waves: NO_WAVES,
      found,
      preview: buildImportPreview(collected, owned),
    });
  }

  // The card avatar is CAS-stored inside importCharacter via ctx.storeAsset → this capped store.
  const store: StoreAvatarAsset = (params) => deps.storeAvatar({ ...params, maxBytes: ASSET_UPLOAD_MAX_BYTES });
  const service = createImportService(contextFor(deps, store));

  let changed = 0;
  let personasMergedKeys: readonly string[] = [];
  let personasReused = 0;

  // Personas FIRST — populates personaByUserName so the chat importers can attribute their user_names.
  const personaInputs: ImportPersonaInput[] = [];
  const skippedPersonaAvatars: ImportSkippedCard[] = [];
  for (const p of collected.personas) {
    if (deps.signal.aborted) {
      break;
    }
    const { input, skipped } = await toPersonaInput(store, deps.principal, p);
    personaInputs.push(input);
    if (skipped !== undefined) {
      skippedPersonaAvatars.push(skipped);
    }
  }
  if (personaInputs.length > 0) {
    const personaResult = await service.importPersonas({ personas: personaInputs, collisions: deps.personaCollisions });
    changed += personaResult.personasCreated;
    personasMergedKeys = personaResult.mergedKeys;
    personasReused = personaResult.personasReused;
  }

  // Standalone ST worlds BEFORE characters — imported as UNATTACHED owner library books (additive by content).
  // Ahead of the character wave so a card name-link (`extensions.world`) can resolve an already-imported book.
  const worldResult = await importCollectedWorlds(deps, collected.worlds);
  changed += worldResult.created;

  // ST chat-completion presets — independent of every other plane (a preset references no character), so the
  // wave runs before the characters and its `changed` counts as new canon like a world book does.
  const presetResult = await service.importPresets({ presets: collected.presets, signal: deps.signal });
  // Only CREATES are net-new canon — a merged preset is the idempotent re-run path (see ImportPresetsResult),
  // exactly as `importCollectedWorlds` counts only a book it did not replace.
  changed += presetResult.presetsCreated;

  // ST UI THEMES — independent of every other plane (a palette references nothing), so the wave runs beside
  // the presets. Each was already converted (and safety-gated) by the collector; the settings domain owns the
  // write and the (ownerId, name) merge rule. Only CREATES count as new canon, like every other wave.
  const themeResult = await service.importThemes({ themes: collected.themes, signal: deps.signal });
  changed += themeResult.themesCreated;

  // ST GLOBAL regex scripts (`extension_settings.regex`) → the library + `global_regex_scripts` (orb's
  // identical "runs on every chat you host" semantic). Independent of every other plane. Found-but-unwired
  // is a RECORDED reason, never silence — this exact plane vanished without a line before this wave existed.
  let globalRegexScriptsLifted = 0;
  let globalRegexScriptsReused = 0;
  let globalRegexSkippedReason: string | null = null;
  if (collected.globalRegexScripts.length > 0) {
    if (deps.importGlobalScripts !== undefined) {
      const lift = await liftGlobalScripts(deps.importGlobalScripts, deps.principal.userId, collected.globalRegexScripts);
      globalRegexScriptsLifted = lift.created;
      globalRegexScriptsReused = lift.reused;
      changed += lift.created;
      globalRegexSkippedReason = refusedScriptsLine(lift.refused);
    } else {
      globalRegexSkippedReason = "global regex-script import is not wired into this composition";
    }
  }

  // ST BACKGROUNDS — CAS-stored, then appended to `appearance.backgroundLibrary` together with the
  // `power_user` ergonomics patch in ONE serialized settings write (the array append needs a
  // read-modify-write that must sit INSIDE the per-user serializer). A re-run stores byte-identical blobs
  // that dedup in the CAS and appends nothing (the entry dedup is by assetId), so `changed` stays honest.
  const appearanceWave = await landBackgroundsAndAppearance(deps, collected);
  const backgroundsImported = appearanceWave.backgroundsImported;
  const appearanceKeysApplied = appearanceWave.appearanceKeysApplied;
  changed += backgroundsImported;

  const bundleResult = await importCollectedBundles(deps, service, collected.profiles);
  changed += bundleResult.changed;

  // The ST world NAME-LINKS, strictly AFTER both the standalone-world wave (the books the names resolve
  // against) and the character wave (the characters they attach to): a card's `extensions.world` names its
  // PRIMARY book (demoted by the attach op when the embedded `character_book` already took the seat) and
  // `charLore` names per-character EXTRA books (`auxiliary`). A name the worlds wave landed binds the row it
  // landed or was reused as (an import is additive, so changed lore sits beside the stale book under a
  // numbered name); any other name resolves by exact name. A dangling name is a report row, never a near-match.
  const worldLinks = await attachCollectedWorldLinks(deps, collected, bundleResult.characterIdByCard, worldResult.landed);

  // The ORPHAN wave — transcripts whose card is absent get a minted placeholder (evidence-only, tagged
  // `orphan import`) and then ride the ORDINARY chats verb. Runs after the card wave so a same-slug card
  // character can never be shadowed by a mint.
  const orphanResult = await importOrphanBundles(deps, service, collected.orphanBundles);
  changed += orphanResult.changed;

  // ST GROUPS strictly AFTER the character wave: a group's members are card FILENAMES, and the filename →
  // characterId map only exists once every card has been imported (or matched). Each profile's groups seat from its
  // own cards. A member card its profile does not carry is skipped WITH a report note — the room still forms around
  // the members that resolved.
  const groupResult = await service.importGroupChats({
    profiles: deps.signal.aborted
      ? []
      : collected.profiles.map(({ result }) => ({
          groups: result.groups,
          characterIdByCardFilename: seatsOf(result.bundles, bundleResult.characterIdByCard),
          characterNameByCardFilename: new Map(result.bundles.map((bundle) => [bundle.filename, bundle.cardName])),
        })),
  });
  changed += groupResult.groupChatsImported;

  // ST GALLERIES after the character wave (a folder belongs to its cards), and the DATA BANK after every chat wave
  // (a file's scopes name the cards and the rooms it was attached to).
  const galleryResult = await importCollectedGallery(deps, collected.galleryImages, bundleResult.characterIdByCard);
  changed += galleryResult.imported;
  const documentResult = await importCollectedDocuments({
    deps,
    documents: collected.documents,
    characterIdByCard: bundleResult.characterIdByCard,
    chatIdByChat: new Map([...bundleResult.chatIdByChat, ...orphanResult.chatIdByChat, ...groupResult.chatIdByChat]),
  });
  changed += documentResult.imported;

  // ONE post-import index enqueue for the whole run, gated on new canon (characters/personas/chats/worlds/
  // presets/group rooms). Triggered on ANY new canon, not just a chat, so a characters-only import still embeds
  // its cards. Skipped on abort (retry re-runs).
  if (changed > 0 && !deps.signal.aborted) {
    await deps.enqueueImportIndex({ ownerId: deps.principal.userId });
  }

  // What each wave reused, in `found`'s units: the run's own record of the entries it wrote nothing for.
  const reused: ImportKindCounts = {
    characters: bundleResult.cardsReused,
    chats: bundleResult.chatsReused + orphanResult.chatsReused + groupResult.groupChatsReused,
    personas: personasReused,
    worlds: worldResult.reused,
    presets: presetResult.presetsImported - presetResult.presetsCreated,
    themes: themeResult.themesImported - themeResult.themesCreated,
    backgrounds: appearanceWave.backgroundsReused,
    groups: groupResult.groupsReused,
    orphans: orphanResult.orphansReused,
    documents: documentResult.reused,
    gallery: galleryResult.reused,
  };
  const heldEntries = IMPORT_PREVIEW_KINDS.reduce((sum, kind) => sum + reused[kind], 0);
  return reportFrom({
    collected,
    scanned,
    changed,
    dryRun: false,
    found,
    held: { inLibrary: heldEntries, skipped: collected.skipped + refusedGroups(collected).length },
    skippedCards: bundleResult.skippedCards,
    waves: {
      presetsImported: presetResult.presetsImported,
      presetsCreated: presetResult.presetsCreated,
      skippedPresets: presetResult.skippedPresets,
      presetNotes: presetResult.notes,
      themesImported: themeResult.themesImported,
      themesCreated: themeResult.themesCreated,
      skippedThemes: themeResult.skippedThemes,
      themeNotes: themeResult.notes,
      worldNotes: worldResult.notes,
      backgroundsImported,
      skippedBackgrounds: appearanceWave.skippedBackgrounds,
      documentsImported: documentResult.imported,
      skippedDocuments: documentResult.skipped,
      documentNotes: documentResult.notes,
      galleryImagesImported: galleryResult.imported,
      skippedGalleryImages: galleryResult.skipped,
      skippedPersonaAvatars,
      appearanceKeysApplied,
      groupsImported: groupResult.groupsImported,
      groupChatsImported: groupResult.groupChatsImported,
      skippedGroups: groupResult.skippedGroups,
      skippedGroupMembers: groupResult.skippedMembers,
      skippedCardTags: bundleResult.skippedCardTags,
      cardNotes: bundleResult.cardNotes,
      cardBookNotes: bundleResult.cardBookNotes,
      ambiguousSpeakerNames: groupResult.ambiguousSpeakerNames,
      seatedDisabledMembers: groupResult.seatedDisabledMembers,
      // Every wave's unresolved chat-bound persona picks, in run order: solo bundles, group rooms, orphans.
      unresolvedPinnedPersonas: [...bundleResult.unresolvedPins, ...groupResult.unresolvedPinnedPersonas, ...orphanResult.unresolvedPins],
      // Every wave's dedup-skip HEALS, summed: this is the number the operator reads to see an existing
      // corpus gain the persona attribution its first import could not resolve.
      chatsPersonaHealed: bundleResult.chatsPersonaHealed + groupResult.chatsPersonaHealed + orphanResult.chatsPersonaHealed,
      skippedChatRows: [...bundleResult.skippedChatRows, ...groupResult.skippedChatRows, ...orphanResult.skippedChatRows],
      personasMergedKeys,
      memoryChatIds: [...bundleResult.memoryChatIds, ...groupResult.memoryChatIds, ...orphanResult.memoryChatIds],
      globalRegexScriptsLifted,
      globalRegexScriptsReused,
      globalRegexSkippedReason,
      cardRegexScriptsLifted: bundleResult.cardScriptsLifted,
      cardRegexScriptsReused: bundleResult.cardScriptsReused,
      worldLinksAttached: worldLinks.attached,
      worldLinksMissing: worldLinks.missing,
      worldLinksSkippedReason: worldLinks.skippedReason,
      orphanImports: orphanResult.orphanImports,
      orphanSkipped: orphanResult.orphanSkipped,
    },
  });
}
