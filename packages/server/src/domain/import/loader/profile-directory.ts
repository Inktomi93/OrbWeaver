import type { Principal } from "@orb/contracts/identity";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { ASSET_UPLOAD_MAX_BYTES, IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { AssetId, CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { hostTimeZone } from "@orb/kit/time";
import { inertActivationFields } from "@orb/kit/world-info";
import type { ImportAssetPort } from "#domain/assets";
import type { ImportGlobalScripts } from "#domain/regex";
import type { AttachOwnedBooksByName } from "#domain/world-info";
import { ProfileImportLimitError } from "../contract/errors.ts";
import type { ProfileCollected, ProfileCollectRecords, ProfileDirImportDeps, ProfileWaveOutcomes } from "../contract/profile-directory.ts";
import type {
  CollectedBackground,
  CollectedCard,
  CollectedGroup,
  CollectedPersona,
  CollectedPreset,
  CollectedTheme,
  CollectedWorld,
  CollectResult,
  ImportDryRunCensus,
  ImportFsPort,
  ImportPersonaInput,
  ImportReport,
  ImportSkippedCard,
  ImportSkippedCardTag,
  ImportUnresolvedPinnedPersona,
  ImportWorldNote,
} from "../contract/views.ts";
import { createImportService } from "../service.ts";
import { buildImportContext } from "../substrate/build-context.ts";
import { findImportedCharacter } from "../substrate/card.ts";
import { collectBundlesFromDir } from "./collect.ts";

const AVATAR_MIME = "image/png";

/** The ST wall-clock zone for this run: the caller's pin, else the host's. ONE resolver so the collect pass
 *  and the per-file import verbs can never disagree about which clock a snapshot's dates were written on. */
function stWallClockZone(deps: ProfileDirImportDeps): string {
  return deps.stWallClockZone ?? hostTimeZone();
}

/** Apply the direct-tree byte belts at the read boundary. `stat` rejects before the allocation, while the
 *  post-read check closes a file-growth race. Repeated reads of one path count only its largest observed
 *  size toward the run-wide budget. */
function withProfileReadLimits(fs: ImportFsPort): ImportFsPort {
  const accountedByPath = new Map<string, number>();
  let totalBytes = 0;
  return {
    ...fs,
    readFile: async (path): Promise<Uint8Array> => {
      const previousBytes = accountedByPath.get(path) ?? 0;
      const declaredBytes = (await fs.stat(path)).size;
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

      const bytes = await fs.readFile(path);
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
}

/** Union one profile dir's ST library tags into the run-wide map: a card/avatar FILENAME can recur across user
 *  dirs, so the tag lists merge rather than overwrite. */
function mergeTags(into: Map<string, string[]>, from: ReadonlyMap<string, readonly string[]>): void {
  for (const [key, names] of from) {
    const merged = into.get(key) ?? [];
    for (const name of names) {
      if (!merged.includes(name)) {
        merged.push(name);
      }
    }
    into.set(key, merged);
  }
}

/** Append one profile dir's "not imported" records onto the run-wide set. Split out of the collect loop so the
 *  loop reads as "collect, merge, record" — the record list grows with every new plane and inlining it made
 *  the loop the file's most complex function. */
function mergeRecords(into: ProfileCollectRecords, from: Awaited<ReturnType<typeof collectBundlesFromDir>>): void {
  into.unreadableCards.push(...from.unreadableCards);
  into.unreadableWorlds.push(...from.unreadableWorlds);
  into.unreadablePresets.push(...from.unreadablePresets);
  into.refusedThemes.push(...from.refusedThemes);
  into.skippedBackgrounds.push(...from.skippedBackgrounds);
  into.unreadableGroups.push(...from.unreadableGroups);
  for (const g of from.groups) {
    into.missingGroupChats.push(...g.missingChatLeaves);
  }
  into.skippedChats.push(...from.skippedChats);
  into.orphanChatDirs.push(...from.orphanChatDirs);
  into.skippedCharacters.push(...from.skippedCharacters);
  into.unhandled.push(...from.unhandled);
  into.unhandledSettings.push(...from.unhandledSettings);
  into.truncatedDirs.push(...from.truncatedDirs);
}

/** Collect every user-profile subdirectory under the root, merging the per-dir results into one set. A
 *  non-profile entry (a stray file, a `_cache` dir with no `characters/`) yields an empty collect and adds
 *  nothing — the loader's port returns `[]` for a missing subdir rather than throwing. */
async function collectProfileRoot(deps: ProfileDirImportDeps): Promise<ProfileCollected> {
  const { fs, profileRoot, signal } = deps;
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
  // card/avatar filename → tag names, unioned across dirs (a filename can recur across profiles).
  const tagsByEntityKey = new Map<string, string[]>();
  const orphanBundles: CollectResult["orphanBundles"] = [];
  // Global regex scripts CONCAT across dirs (the lift content-dedups repeats); charLore bindings union
  // through the same mergeTags rule (a card filename stem can recur across profiles).
  const globalRegexScripts: RegexScriptCard[] = [];
  let malformedGlobalRegexScripts = 0;
  const extraBooksByCardStem = new Map<string, string[]>();
  let databankFileCount = 0;
  let galleryImageCount = 0;
  const r: ProfileCollectRecords = {
    unreadableCards: [],
    unreadableWorlds: [],
    unreadablePresets: [],
    refusedThemes: [],
    skippedBackgrounds: [],
    unreadableGroups: [],
    missingGroupChats: [],
    skippedChats: [],
    orphanChatDirs: [],
    skippedCharacters: [],
    unhandled: [],
    unhandledSettings: [],
    truncatedDirs: [],
  };
  for (const ent of (await fs.readdir(profileRoot)).toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (signal.aborted) {
      break;
    }
    if (ent.kind !== "directory") {
      continue;
    }
    const result = await collectBundlesFromDir(fs, fs.join(profileRoot, ent.name), [], stWallClockZone(deps));
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
    mergeTags(tagsByEntityKey, result.tagsByEntityKey);
    orphanBundles.push(...result.orphanBundles);
    globalRegexScripts.push(...result.globalRegexScripts);
    malformedGlobalRegexScripts += result.malformedGlobalRegexScripts;
    mergeTags(extraBooksByCardStem, result.extraBooksByCardStem);
    databankFileCount += result.databankFileCount;
    galleryImageCount += result.galleryImageCount;
    mergeRecords(r, result);
  }
  const skipped =
    r.unreadableCards.length +
    r.unreadableWorlds.length +
    r.unreadablePresets.length +
    r.refusedThemes.length +
    r.skippedBackgrounds.length +
    r.unreadableGroups.length +
    r.missingGroupChats.length +
    r.skippedChats.length +
    r.skippedCharacters.length +
    r.orphanChatDirs.length;
  return {
    bundles,
    personas,
    worlds,
    presets,
    themes,
    backgrounds,
    appearance,
    groups,
    tagsByEntityKey,
    orphanBundles,
    globalRegexScripts,
    malformedGlobalRegexScripts,
    extraBooksByCardStem,
    databankFileCount,
    galleryImageCount,
    skipped,
    ...r,
  };
}

/** scanned = every examined ST entity: happy-path bundles + personas + worlds + presets + groups (and their
 *  transcripts) + chat files, plus the recorded skips. */
function tallyScanned(collected: ProfileCollected): number {
  let scanned =
    collected.bundles.length +
    collected.personas.length +
    collected.worlds.length +
    collected.presets.length +
    collected.themes.length +
    collected.backgrounds.length +
    collected.groups.length +
    collected.skipped;
  for (const b of collected.bundles) {
    scanned += b.chats.length;
  }
  for (const g of collected.groups) {
    scanned += g.chats.length;
  }
  return scanned;
}

/** dryRun prediction: a card writes iff neither the import-identity lookup (the one order every door uses)
 *  nor the handle oracle matches (a create). Every lookup is a read — zero writes. A text-only match counts as
 *  found: whether that row may take the PNG's art is decided by the write, not predicted here. Personas/chats
 *  can't be predicted without their write op, so they are examined (counted in scanned) but never in the
 *  dryRun `changed`. */
async function countWouldCreate(deps: ProfileDirImportDeps, bundles: readonly CollectedCard[]): Promise<number> {
  const ownerId = deps.principal.userId;
  let changed = 0;
  for (const b of bundles) {
    if (deps.signal.aborted) {
      break;
    }
    const found = await findImportedCharacter(
      async (importHash) => await deps.contextFor(deps.principal, deps.storeAvatar).characterOps.findByImportHash({ ownerId, importHash }),
      {
        importHash: b.contentHash,
        textHash: b.textHash,
        bytes: b.cardBytes,
      },
    );
    if (found !== null) {
      continue;
    }
    const byHandle = await deps.contextFor(deps.principal, deps.storeAvatar).characterOps.findByHandle({ ownerId, handle: b.handle });
    if (byHandle === null) {
      changed += 1;
    }
  }
  return changed;
}

/** Store one persona's avatar (maxBytes-capped) and pair it into the canonical persona-import input. */
async function toPersonaInput(store: ImportAssetPort["store"], principal: Principal, p: CollectedPersona): Promise<ImportPersonaInput> {
  let avatarAssetId: AssetId | null = null;
  if (p.avatarBytes !== undefined) {
    const stored = await store({
      principal,
      bytes: p.avatarBytes,
      kind: "avatar",
      mime: AVATAR_MIME,
      // One single-asset ceiling repo-wide — the profile importer deliberately shares the upload cap.
      maxBytes: ASSET_UPLOAD_MAX_BYTES,
    });
    avatarAssetId = stored.assetId;
  }
  return { parsed: p.parsed, avatarAssetId };
}

/** The ST BACKGROUND wave: CAS-store each collected image/video under the owner (kind `background`,
 *  maxBytes-capped, magic-verified because the mime is only extension-derived) and turn it into a ready
 *  `BackgroundLibraryEntry`. PER-FILE ISOLATION — a background the store refuses (a `.jpg` that is not a JPEG,
 *  an over-cap blob) is recorded with its reason and never aborts the batch, exactly like the card wave.
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
    // @orb-waive caught-failure-ownership(err): the catch pushes `{ file, reason }` onto `skipped`, which
    // `storeCollectedBackgrounds` returns and `reportFrom` lists as the report's `skippedBackgrounds`.
    // Ends if `skipped` stops reaching the report.
    try {
      const stored = await store({
        principal: deps.principal,
        bytes: background.bytes,
        mime: background.mime,
        // One single-asset ceiling repo-wide — the profile importer deliberately shares the upload cap.
        maxBytes: ASSET_UPLOAD_MAX_BYTES,
      });
      entries.push({ entryId: newEntryId(), assetId: stored.assetId, assetHash: stored.hash, mime: background.mime, name: background.name });
      storedFiles.push(background.filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ file: background.filename, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return { entries, storedFiles, skipped };
}

/** The BACKGROUND + `appearance` wave: CAS-store the blobs, then land them (and the `power_user` ergonomics
 *  patch) through the settings applier in ONE serialized write. Split out of the driver so the UNWIRED-applier
 *  arm has somewhere to live: with no applier there is no `backgroundLibrary` append, so the stored blobs are
 *  unreferenced — unreachable from the picker and reclaimed by the GC an hour later — which used to be
 *  entirely silent (neither counted nor reported, #1469). `storedFiles` is index-aligned to `entries`, so the
 *  report names exactly the files that landed in the CAS and nowhere else. */
async function landBackgroundsAndAppearance(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
): Promise<{
  readonly backgroundsImported: number;
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
    return { backgroundsImported: 0, appearanceKeysApplied: [], skippedBackgrounds: [...stored.skipped, ...unattached] };
  }
  const outcome = await apply(deps.principal.userId, { patch: collected.appearance, backgroundLibrary: stored.entries });
  return { backgroundsImported: outcome.backgroundsAdded, appearanceKeysApplied: outcome.patchedKeys, skippedBackgrounds: stored.skipped };
}

/** The inert SillyTavern activation fields a book's entries carry, each with the count of entries carrying
 *  it — the report's "kept but not active yet" line per book (owner ruling). */
function inertFieldCounts(book: CollectedWorld["book"]): ImportWorldNote["inertFields"] {
  const counts = new Map<string, number>();
  for (const entry of book.entries) {
    for (const { field } of inertActivationFields(entry.metadata)) {
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }
  return [...counts].map(([field, entries]) => ({ field, entries }));
}

/** Import the collected standalone ST worlds as UNATTACHED owner library books, additively: an equal book is
 *  reused and a same-named different one lands under a free name. Returns the net-new count, one note per
 *  book for the report, and the row each world landed as, keyed by the name the profile calls it — the map the
 *  name-link wave binds by, since the landed row may carry another name. Aborts cleanly on signal. */
async function importCollectedWorlds(
  deps: ProfileDirImportDeps,
  worlds: readonly CollectedWorld[],
): Promise<{ readonly created: number; readonly notes: ImportWorldNote[]; readonly landed: ReadonlyMap<string, WorldBookId> }> {
  let created = 0;
  const notes: ImportWorldNote[] = [];
  const landed = new Map<string, WorldBookId>();
  for (const world of worlds) {
    if (deps.signal.aborted) {
      break;
    }
    const bookResult = await deps.importStandaloneLorebook({ ownerId: deps.principal.userId, book: world.book });
    if (bookResult.created) {
      created += 1;
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
      inertFields: inertFieldCounts(world.book),
    });
  }
  return { created, notes, landed };
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
  skippedCardTags: [],
  appearanceKeysApplied: [],
  groupsImported: 0,
  groupChatsImported: 0,
  skippedGroups: [],
  skippedGroupMembers: [],
  ambiguousSpeakerNames: [],
  seatedDisabledMembers: [],
  unresolvedPinnedPersonas: [],
  chatsPersonaHealed: 0,
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
  readonly skippedCards: readonly ImportSkippedCard[];
  readonly waves: ProfileWaveOutcomes;
  /** Present ONLY on a dryRun — the census that keeps a rehearsal's structural zeroes from reading as "this
   *  profile carries none of these planes" (#1469). */
  readonly dryRunWouldImport?: ImportDryRunCensus;
}

/** What each wave WOULD attempt, straight off the collect result: the counts a real run's wave outcomes
 *  report after writing. `characters` is the bundle count (`changed` separately carries the read-only
 *  create PREDICTION); chats are every transcript paired to a card. */
function dryRunCensus(collected: ProfileCollected): ImportDryRunCensus {
  return {
    characters: collected.bundles.length,
    personas: collected.personas.length,
    chats: collected.bundles.reduce((n, b) => n + b.chats.length, 0),
    worlds: collected.worlds.length,
    presets: collected.presets.length,
    themes: collected.themes.length,
    backgrounds: collected.backgrounds.length,
    groups: collected.groups.length,
    groupChats: collected.groups.reduce((n, g) => n + g.chats.length, 0),
    orphanChatDirs: collected.orphanChatDirs.length,
  };
}

function reportFrom({ collected, scanned, changed, skippedCards, waves, dryRunWouldImport }: ReportArgs): ImportReport {
  return {
    scanned,
    changed,
    dryRun: dryRunWouldImport !== undefined,
    dryRunWouldImport: dryRunWouldImport ?? null,
    skippedCards,
    unreadableCards: collected.unreadableCards,
    unreadableWorlds: collected.unreadableWorlds,
    unreadablePresets: collected.unreadablePresets,
    unreadableGroups: collected.unreadableGroups,
    missingGroupChats: collected.missingGroupChats,
    ...waves,
    // ONE "did not import" list per plane, whichever stage refused: the CONVERTER's refusals (collect-time —
    // unreadable / colour-less; a non-media background
    // file) joined with the WRITE stage's (the settings domain refused the theme; the CAS refused the blob).
    skippedThemes: [...collected.refusedThemes, ...waves.skippedThemes],
    skippedBackgrounds: [...collected.skippedBackgrounds, ...waves.skippedBackgrounds],
    skippedChats: collected.skippedChats,
    orphanChatDirs: collected.orphanChatDirs,
    skippedCharacters: collected.skippedCharacters,
    unhandled: [...new Set(collected.unhandled)],
    unhandledSettings: [...new Set(collected.unhandledSettings)],
    truncatedDirs: collected.truncatedDirs,
    // The silent-gap sweep's counts: the FOUND halves are collect-time facts (real on a dryRun too); the
    // lifted/attached halves ride `waves` above and are zero on a dryRun, like every other write outcome.
    globalRegexScriptsFound: collected.globalRegexScripts.length,
    malformedGlobalRegexScripts: collected.malformedGlobalRegexScripts,
    databankFileCount: collected.databankFileCount,
    galleryImageCount: collected.galleryImageCount,
  };
}

/** The ST card PNG extension, stripped to recover the stem `charLore` keys by (ST's `getCharaFilename`). */
const CARD_PNG_EXT = /\.png$/i;

/** The GLOBAL regex lift, one call — isolated so the op arrives as a NARROWED parameter (the same shape
 *  `attachWorldLinksFor` receives `attach` in; awaiting the optional property inline trips biome's
 *  thenable lens even though the op's contract returns a Promise). */
function liftGlobalScripts(lift: ImportGlobalScripts, ownerId: UserId, scripts: readonly RegexScriptCard[]): ReturnType<ImportGlobalScripts> {
  return lift({ ownerId, scripts });
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
  characterIdByCardFilename: ReadonlyMap<string, CharacterId>,
  landed: ReadonlyMap<string, WorldBookId>,
): Promise<{ readonly attached: number; readonly missing: { character: string; book: string }[]; readonly skippedReason: string | null }> {
  const attach = deps.attachBooksByName;
  const missing: { character: string; book: string }[] = [];
  let attached = 0;
  let anyLinks = false;
  for (const bundle of collected.bundles) {
    if (deps.signal.aborted) {
      break;
    }
    const extras = collected.extraBooksByCardStem.get(bundle.filename.replace(CARD_PNG_EXT, "")) ?? [];
    if (bundle.worldName === null && extras.length === 0) {
      continue;
    }
    anyLinks = true;
    const characterId = characterIdByCardFilename.get(bundle.filename);
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
  readonly orphanImports: { dir: string; characterName: string; created: boolean; chatsImported: number }[];
  readonly orphanSkipped: { dir: string; reason: string }[];
  readonly unresolvedPins: ImportUnresolvedPinnedPersona[];
  readonly chatsPersonaHealed: number;
  readonly memoryChatIds: ChatId[];
}> {
  let changed = 0;
  let chatsPersonaHealed = 0;
  const memoryChatIds: ChatId[] = [];
  const orphanImports: { dir: string; characterName: string; created: boolean; chatsImported: number }[] = [];
  const orphanSkipped: { dir: string; reason: string }[] = [];
  const unresolvedPins: ImportUnresolvedPinnedPersona[] = [];
  for (const orphan of orphans) {
    if (deps.signal.aborted) {
      break;
    }
    // @orb-waive caught-failure-ownership(err): the catch pushes `{ dir, reason }` onto `orphanSkipped`, which
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
      }
      const chatResult = await service.importChats({ characterId: mint.characterId, chats: orphan.chats });
      changed += chatResult.chatsImported;
      chatsPersonaHealed += chatResult.chatsPersonaHealed;
      memoryChatIds.push(...chatResult.memoryChatIds);
      unresolvedPins.push(...chatResult.unresolvedPinnedPersonas);
      orphanImports.push({ dir: orphan.dirName, characterName: mint.name, created: mint.created, chatsImported: chatResult.chatsImported });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      orphanSkipped.push({ dir: orphan.dirName, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return { changed, orphanImports, orphanSkipped, unresolvedPins, chatsPersonaHealed, memoryChatIds };
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
  readonly unresolvedPins: readonly ImportUnresolvedPinnedPersona[];
  /** Already-imported rooms of THIS card whose persona attribution this run back-filled (the dedup-skip HEAL). */
  readonly chatsPersonaHealed: number;
  /** The card's written real conversations (the memory-build offer's scope). */
  readonly memoryChatIds: readonly ChatId[];
  /** The card's regex-script lift counts (D121-E) — summed into the report's card-lift accounting. */
  readonly scriptsLifted: number;
  readonly scriptsReused: number;
}> {
  let changed = 0;
  const cardResult = await service.importCharacter({ card: { bytes: bundle.cardBytes, filename: bundle.filename } });
  if (cardResult.created) {
    changed += 1;
  }
  const scripts = { scriptsLifted: cardResult.regexScriptsLifted, scriptsReused: cardResult.regexScriptsReused };
  if (bundle.chats.length === 0) {
    return { changed, characterId: cardResult.characterId, unresolvedPins: [], chatsPersonaHealed: 0, memoryChatIds: [], ...scripts };
  }
  const chatResult = await service.importChats({ characterId: cardResult.characterId, chats: bundle.chats });
  changed += chatResult.chatsImported;
  return {
    changed,
    characterId: cardResult.characterId,
    unresolvedPins: chatResult.unresolvedPinnedPersonas,
    chatsPersonaHealed: chatResult.chatsPersonaHealed,
    memoryChatIds: chatResult.memoryChatIds,
    ...scripts,
  };
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
  // the card imported with fewer labels than the profile carried and the report said nothing (#1469). The
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
  bundles: readonly CollectedCard[],
  tagsByEntityKey: ReadonlyMap<string, readonly string[]>,
): Promise<{
  readonly changed: number;
  readonly skippedCards: ImportSkippedCard[];
  /** Card FILENAME → the character it resolved to (created OR matched). The ST group wave's ONLY member key —
   *  see `verbs/import-group-chats.ts` for why a handle or a display name cannot substitute. */
  readonly characterIdByCardFilename: Map<string, CharacterId>;
  readonly characterNameByCardFilename: Map<string, string>;
  /** §5.7 — the solo wave's half of the unresolved chat-bound persona picks. */
  readonly unresolvedPins: ImportUnresolvedPinnedPersona[];
  /** The solo wave's half of the dedup-skip HEAL count. */
  readonly chatsPersonaHealed: number;
  /** The solo wave's written real conversations. */
  readonly memoryChatIds: ChatId[];
  /** The card-lift halves of the regex accounting, summed across every imported card. */
  readonly cardScriptsLifted: number;
  readonly cardScriptsReused: number;
  /** Library tags that did NOT attach to an imported card, with the reason (per-tag isolation, never silent). */
  readonly skippedCardTags: ImportSkippedCardTag[];
}> {
  let changed = 0;
  let chatsPersonaHealed = 0;
  const memoryChatIds: ChatId[] = [];
  const skippedCards: ImportSkippedCard[] = [];
  const characterIdByCardFilename = new Map<string, CharacterId>();
  const characterNameByCardFilename = new Map<string, string>();
  const unresolvedPins: ImportUnresolvedPinnedPersona[] = [];
  let cardScriptsLifted = 0;
  const skippedCardTags: ImportSkippedCardTag[] = [];
  let cardScriptsReused = 0;
  for (const bundle of bundles) {
    if (deps.signal.aborted) {
      break;
    }
    // @orb-waive caught-failure-ownership(err): the catch pushes `{ file, reason }` onto `skippedCards`, which
    // `importCollectedBundles` returns and `runProfileDirectory` passes to `reportFrom` as `skippedCards`.
    // Ends if `skippedCards` stops reaching the report.
    try {
      const result = await importOneBundle(service, bundle);
      changed += result.changed;
      chatsPersonaHealed += result.chatsPersonaHealed;
      memoryChatIds.push(...result.memoryChatIds);
      unresolvedPins.push(...result.unresolvedPins);
      cardScriptsLifted += result.scriptsLifted;
      cardScriptsReused += result.scriptsReused;
      characterIdByCardFilename.set(bundle.filename, result.characterId);
      characterNameByCardFilename.set(bundle.filename, bundle.cardName);
      const tagNames = tagsByEntityKey.get(bundle.filename);
      if (tagNames !== undefined && tagNames.length > 0) {
        skippedCardTags.push(...(await attachBundleTags(deps, bundle, result.characterId, tagNames)));
      }
    } catch (err) {
      // The concise refusal reason for the report — the last line of a ZodError prettify is the actionable
      // one ("Too big: expected string to have <=200 characters → at cardVersion").
      const message = err instanceof Error ? err.message : String(err);
      skippedCards.push({ file: bundle.filename, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return {
    changed,
    skippedCards,
    characterIdByCardFilename,
    characterNameByCardFilename,
    unresolvedPins,
    chatsPersonaHealed,
    memoryChatIds,
    cardScriptsLifted,
    cardScriptsReused,
    skippedCardTags,
  };
}

/** Assemble the run's ImportContext. The post-import index pass is enqueued ONCE at the very end of the whole
 *  import (gated on `changed > 0`) — NOT per character. Reasons: (1) the per-(kind, owner) admission lock
 *  makes a per-entity enqueue collide, and an unhandled conflict aborts the import mid-loop (the "only 2 of
 *  hundreds imported" bug); (2) the index pass must run AFTER the whole import, never while it is still
 *  writing. So the per-chat `enqueueImportIndex` the importChats verb calls is a NO-OP
 *  here — the driver owns the one enqueue. */
function contextFor(deps: ProfileDirImportDeps, store: ImportAssetPort["store"]): ReturnType<typeof buildImportContext> {
  return buildImportContext({
    ...deps.contextFor(deps.principal, store),
    principal: deps.principal,
    ...(deps.importLorebook !== undefined ? { importLorebook: deps.importLorebook } : {}),
    ...(deps.hasPrimaryBook !== undefined ? { hasPrimaryBook: deps.hasPrimaryBook } : {}),
    ...(deps.linkCarriedBooks !== undefined ? { linkCarriedBooks: deps.linkCarriedBooks } : {}),
    ...(deps.importCardScripts !== undefined ? { importCardScripts: deps.importCardScripts } : {}),
    profile: {
      now: deps.now,
      stWallClockZone: stWallClockZone(deps),
      personaByUserName: new Map(),
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      // NO-OP (see the header): the driver owns the one enqueue, so this per-chat call enqueues nothing.
      enqueueImportIndex: (): Promise<void> => Promise.resolve(),
      reconcileStats: deps.reconcileImportStats,
      ...(deps.importPreset !== undefined ? { importPreset: deps.importPreset } : {}),
      ...(deps.importTheme !== undefined ? { importTheme: deps.importTheme } : {}),
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
  const scanned = tallyScanned(collected);

  if (deps.dryRun) {
    return reportFrom({
      collected,
      scanned,
      changed: await countWouldCreate(deps, collected.bundles),
      skippedCards: [],
      // Every WRITE outcome is zero because nothing was written; the census beside it says what the real run
      // would attempt, per wave, so a rehearsal is never mistaken for an empty profile (#1469).
      waves: NO_WAVES,
      dryRunWouldImport: dryRunCensus(collected),
    });
  }

  // The card avatar is CAS-stored inside importCharacter via ctx.storeAsset → this capped store.
  const store: ImportAssetPort["store"] = (params) => deps.storeAvatar({ ...params, maxBytes: ASSET_UPLOAD_MAX_BYTES });
  const service = createImportService(contextFor(deps, store));

  let changed = 0;
  let personasMergedKeys: readonly string[] = [];

  // Personas FIRST — populates personaByUserName so the chat importers can attribute their user_names.
  const personaInputs: ImportPersonaInput[] = [];
  for (const p of collected.personas) {
    if (deps.signal.aborted) {
      break;
    }
    personaInputs.push(await toPersonaInput(store, deps.principal, p));
  }
  if (personaInputs.length > 0) {
    const personaResult = await service.importPersonas({ personas: personaInputs, collisions: deps.personaCollisions });
    changed += personaResult.personasCreated;
    personasMergedKeys = personaResult.mergedKeys;
  }

  // Standalone ST worlds BEFORE characters — imported as UNATTACHED owner library books (additive by content).
  // Ahead of the character wave so a card name-link (`extensions.world`) can resolve an already-imported book.
  const worldResult = await importCollectedWorlds(deps, collected.worlds);
  changed += worldResult.created;

  // ST chat-completion presets — independent of every other plane (a preset references no character), so the
  // wave runs before the characters and its `changed` counts as new canon like a world book does.
  const presetResult = await service.importPresets({ presets: collected.presets });
  // Only CREATES are net-new canon — a merged preset is the idempotent re-run path (see ImportPresetsResult),
  // exactly as `importCollectedWorlds` counts only a book it did not replace.
  changed += presetResult.presetsCreated;

  // ST UI THEMES — independent of every other plane (a palette references nothing), so the wave runs beside
  // the presets. Each was already converted (and safety-gated) by the collector; the settings domain owns the
  // write and the (ownerId, name) merge rule. Only CREATES count as new canon, like every other wave.
  const themeResult = await service.importThemes({ themes: collected.themes });
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

  const bundleResult = await importCollectedBundles(deps, service, collected.bundles, collected.tagsByEntityKey);
  changed += bundleResult.changed;

  // The ST world NAME-LINKS, strictly AFTER both the standalone-world wave (the books the names resolve
  // against) and the character wave (the characters they attach to): a card's `extensions.world` names its
  // PRIMARY book (demoted by the attach op when the embedded `character_book` already took the seat) and
  // `charLore` names per-character EXTRA books (`auxiliary`). A name the worlds wave landed binds the row it
  // landed or was reused as (an import is additive, so changed lore sits beside the stale book under a
  // numbered name); any other name resolves by exact name. A dangling name is a report row, never a near-match.
  const worldLinks = await attachCollectedWorldLinks(deps, collected, bundleResult.characterIdByCardFilename, worldResult.landed);

  // The ORPHAN wave — transcripts whose card is absent get a minted placeholder (evidence-only, tagged
  // `orphan import`) and then ride the ORDINARY chats verb. Runs after the card wave so a same-slug card
  // character can never be shadowed by a mint.
  const orphanResult = await importOrphanBundles(deps, service, collected.orphanBundles);
  changed += orphanResult.changed;

  // ST GROUPS strictly AFTER the character wave: a group's members are card FILENAMES, and the filename →
  // characterId map only exists once every card has been imported (or matched). A member card that is not in
  // the import set is skipped WITH a report note — the room still forms around the members that resolved.
  const groupResult = await service.importGroupChats({
    groups: deps.signal.aborted ? [] : collected.groups,
    characterIdByCardFilename: bundleResult.characterIdByCardFilename,
    characterNameByCardFilename: bundleResult.characterNameByCardFilename,
  });
  changed += groupResult.groupChatsImported;

  // ONE post-import index enqueue for the whole run, gated on new canon (characters/personas/chats/worlds/
  // presets/group rooms). Triggered on ANY new canon, not just a chat, so a characters-only import still embeds
  // its cards. Skipped on abort (retry re-runs).
  if (changed > 0 && !deps.signal.aborted) {
    await deps.enqueueImportIndex({ ownerId: deps.principal.userId });
  }

  return reportFrom({
    collected,
    scanned,
    changed,
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
      appearanceKeysApplied,
      groupsImported: groupResult.groupsImported,
      groupChatsImported: groupResult.groupChatsImported,
      skippedGroups: groupResult.skippedGroups,
      skippedGroupMembers: groupResult.skippedMembers,
      skippedCardTags: bundleResult.skippedCardTags,
      ambiguousSpeakerNames: groupResult.ambiguousSpeakerNames,
      seatedDisabledMembers: groupResult.seatedDisabledMembers,
      // Every wave's unresolved chat-bound persona picks, in run order: solo bundles, group rooms, orphans.
      unresolvedPinnedPersonas: [...bundleResult.unresolvedPins, ...groupResult.unresolvedPinnedPersonas, ...orphanResult.unresolvedPins],
      // Every wave's dedup-skip HEALS, summed: this is the number the operator reads to see an existing
      // corpus gain the persona attribution its first import could not resolve.
      chatsPersonaHealed: bundleResult.chatsPersonaHealed + groupResult.chatsPersonaHealed + orphanResult.chatsPersonaHealed,
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
