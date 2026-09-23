// The ST profile-DIRECTORY bulk-import driver — the composition the `import-st` workload runs through
// (`ctx.env.import.importAll`). Where `run-profile-import.ts` takes already-extracted card files, this walks
// a staged ST profile snapshot on disk: the configured root holds ONE subdirectory per ST user profile
// (`<userDir>/characters/*.png`, `<userDir>/chats/<charDir>/*.jsonl`, `<userDir>/settings.json`,
// `<userDir>/User Avatars/`). Each subdir is collected through the injected `ImportFsPort` (the loader stays
// node:fs-free) and imported into the ONE target owner.
//
// FLOW (real run): collect every user dir → store persona avatars + `importPersonas` FIRST (populates the
// cross-verb `personaByUserName` map the chat importers attribute against) → standalone worlds → ST
// chat-completion presets (`importPresets`, through the preset domain's own idempotent op) → per bundle
// `importCharacter` (idempotent by importHash; the card PNG is CAS-stored inside the verb) then `importChats`,
// then attach the character's ST library tags (`settings.tag_map[card filename]` → resolve-or-create by name)
// → LAST the ST GROUPS (`importGroupChats`), which must follow the character wave because a group's members
// are CARD FILENAMES and the filename → characterId map is that wave's output. Counts follow
// the maintenance-pass shape: `scanned` = every ST entity the loader examined (bundles + personas + chat
// files + the recorded non-happy-path skips), `changed` = net-new canon written (created characters +
// created personas + imported chats). The runner reconciles stats post-run when `changed > 0`; a
// chat write enqueues the memory backfill via the injected op.
//
// dryRun: parse + collect + the read-only dedup MATCH only — ZERO writes. The import verbs have no
// write-free mode, so the driver never calls them under `dryRun`; it predicts the character-create count via
// the (read-only) importHash + handle oracles. Persona/chat dedup can't be predicted without the write op,
// so `changed` under `dryRun` reflects character creates only (documented; the invariant the runner cares
// about is zero writes).
//
// Every avatar/card blob is stored through a `maxBytes`-capped store — the zip-bomb belt for this
// non-HTTP caller (the store seam rejects an over-cap blob before the CAS write).

import type { Dirent } from "node:fs";
import { readdir as readdirFs, readFile as readFileFs, stat as statFs } from "node:fs/promises";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { ASSET_UPLOAD_MAX_BYTES, IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { hostTimeZone } from "@orb/kit/time";
import type { BulkImportChats } from "#domain/chat";
import type {
  CollectedBackground,
  CollectedCard,
  CollectedGroup,
  CollectedPersona,
  CollectedPreset,
  CollectedTheme,
  CollectedWorld,
  CollectResult,
  ImportAmbiguousSpeakerName,
  ImportDryRunCensus,
  ImportFsPort,
  ImportPersonaInput,
  ImportPresetNote,
  ImportReport,
  ImportSeatedDisabledMember,
  ImportSkippedCard,
  ImportSkippedCardTag,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportThemeNote,
  ImportUnresolvedPinnedPersona,
} from "#domain/import";
import { collectBundlesFromDir, createImportService, importFileHash, ProfileImportLimitError } from "#domain/import";
import type { BulkImportPersonas } from "#domain/persona";
import type { ImportPreset } from "#domain/preset";
import type { ImportCardScripts, ImportGlobalScripts, ImportPresetScripts } from "#domain/regex";
import type { ImportedAppearance, ImportedAppearanceOutcome, SettingsImportOutcome } from "#domain/settings";
import type { AttachOwnedBooksByName, ImportStandaloneLorebook } from "#domain/world-info";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "./build-import-context.ts";
import { buildImportContext } from "./build-import-context.ts";

/** The settings-owned theme-import op (`createImportTheme`) as the driver consumes it. */
type ImportTheme = (ownerId: UserId, bytes: Uint8Array) => Promise<SettingsImportOutcome>;
/** The settings-owned `appearance` landing op (`createApplyImportedAppearance`). */
type ApplyImportedAppearance = (ownerId: UserId, imported: ImportedAppearance) => Promise<ImportedAppearanceOutcome>;

const AVATAR_MIME = "image/png";

/** The ST wall-clock zone for this run: the caller's pin, else the host's. ONE resolver so the collect pass
 *  and the per-file import verbs can never disagree about which clock a snapshot's dates were written on. */
function stWallClockZone(deps: ProfileDirImportDeps): string {
  return deps.stWallClockZone ?? hostTimeZone();
}

/** The CAS store for BACKGROUND blobs. A separate port from the avatar one (which is deliberately narrowed to
 *  `kind:"avatar"` and returns only an id): a `BackgroundLibraryEntry` needs the content HASH — the picker
 *  builds `blobUrl(hash)` from it with no async id→hash round-trip — and the kind differs. `enforceMagic` is
 *  bound TRUE at the composition root: a background's mime is only extension-derived here, so the bytes are
 *  verified against the claim before they enter the CAS. */
type ImportBackgroundStore = (params: {
  readonly principal: Principal;
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly maxBytes: number;
}) => Promise<{ readonly assetId: AssetId; readonly hash: string }>;

export interface ProfileDirImportDeps {
  readonly fs: ImportFsPort;
  /** The root holding one subdir per ST user profile (the loader collects each subdir independently). */
  readonly profileRoot: string;
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook?: ImportWorldInfoPort["importLorebook"];
  /** Travels with `importLorebook` (#1598 — the edited-primary guard). */
  readonly hasPrimaryBook?: ImportWorldInfoPort["hasPrimaryBook"];
  readonly linkCarriedBooks?: ImportWorldInfoPort["linkCarriedBooks"];
  /** D121-E: the regex card LIFT. The composition ALWAYS supplied this (`portability-runner.ts`'s shared
   *  `profileImport` slice) but the field was never declared here, so the driver silently dropped it and
   *  every profile-dir card's scripts no-opped at `importCharacter`'s optional-op guard — the upload door
   *  wired it, the bulk path did not. Optional on the `importLorebook` precedent (test compositions). */
  readonly importCardScripts?: ImportCardScripts;
  /** The GLOBAL regex lift (`extension_settings.regex` → library + `global_regex_scripts`). Optional on the
   *  same precedent; found-but-unlifted scripts are REPORTED with the reason, never silent. */
  readonly importGlobalScripts?: ImportGlobalScripts;
  /** The preset-scoped regex lift, threaded to the presets verb through the profile ops. Same optionality. */
  readonly importPresetScripts?: ImportPresetScripts;
  /** The ST NAME-LINK attach (card `extensions.world` primary + charLore auxiliaries → the owner's books,
   *  by exact name). Optional on the same precedent; dangling names are REPORTED per character. */
  readonly attachBooksByName?: AttachOwnedBooksByName;
  /** The UNATTACHED owner-library book write — the standalone `worlds/*.json` land through this (no character
   *  attach). Imported BEFORE characters so a future name-link (`extensions.world`) can resolve them. */
  readonly importStandaloneLorebook: ImportStandaloneLorebook;
  /** The preset domain's own import op — the ST preset wave hands it orb-native `orb.preset` bytes. Optional
   *  on the `importLorebook` precedent: absent ⇒ the preset plane does not restore and every collected preset
   *  is reported skipped-with-reason, never silently dropped. */
  readonly importPreset?: ImportPreset;
  /** The settings domain's own idempotent theme-import op (`createImportTheme`) — the ST theme wave hands it
   *  orb-native `orb.theme` bytes. Optional on the `importPreset` precedent: absent ⇒ the theme plane does
   *  not restore and every converted theme is reported skipped-with-reason, never silently dropped. */
  readonly importTheme?: ImportTheme;
  /** The CAS store for the ST `backgrounds/` plane. Optional: absent ⇒ no background imports (and every
   *  collected file is reported skipped-with-reason). */
  readonly storeBackground?: ImportBackgroundStore;
  /** Lands the `appearance` plane (the background-library append + the `power_user` ergonomics patch) in ONE
   *  serialized settings write. Optional alongside `storeBackground` — both come from the same composition. */
  readonly applyImportedAppearance?: ApplyImportedAppearance;
  /** Mints a `BackgroundLibraryEntry`'s stable per-row id (crypto uuid in prod; deterministic in tests). */
  readonly newBackgroundEntryId?: () => string;
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<boolean>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly now: () => number;
  /** The zone the staged ST snapshot's wall-clock dates were written in. Omitted ⇒ {@link hostTimeZone} — a
   *  profile snapshot is imported on the box that produced it in the ordinary case, and ST built those
   *  strings off that box's local `Date`. Explicit here so a test pins it instead of inheriting the host's. */
  readonly stWallClockZone?: string;
  readonly dryRun: boolean;
  readonly signal: AbortSignal;
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

/** The per-profile "not imported" records, merged across every user dir — the import report's raw material. */
interface CollectRecords {
  readonly unreadableCards: string[];
  readonly unreadableWorlds: string[];
  readonly unreadablePresets: string[];
  /** Themes the CONVERTER refused (with the reason) — merged with the settings domain's refusals in the report. */
  readonly refusedThemes: ImportSkippedCard[];
  /** `backgrounds/*` entries that are not importable media (with the reason). */
  readonly skippedBackgrounds: ImportSkippedCard[];
  readonly unreadableGroups: string[];
  /** Transcript leaves a group's own `chats[]` claimed with no readable file, merged across every group. */
  readonly missingGroupChats: string[];
  readonly skippedChats: string[];
  readonly orphanChatDirs: string[];
  readonly skippedCharacters: string[];
  readonly unhandled: string[];
  readonly unhandledSettings: string[];
  /** Directories the collector truncated at its entry ceiling (dir + kept/total), merged across profiles. */
  readonly truncatedDirs: { dir: string; kept: number; total: number }[];
}

interface Collected extends CollectRecords {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  readonly worlds: CollectedWorld[];
  readonly presets: CollectedPreset[];
  readonly themes: CollectedTheme[];
  readonly backgrounds: CollectedBackground[];
  /** The ST `power_user` → orb `appearance` patch. FIRST profile dir that carries one wins (see the wave). */
  readonly appearance: Record<string, unknown>;
  readonly groups: CollectedGroup[];
  /** ST library-tag assignments merged across every profile dir: card/avatar filename → tag names. */
  readonly tagsByEntityKey: ReadonlyMap<string, readonly string[]>;
  /** The orphan dirs' transcripts + evidence, concatenated across profile dirs (the mint wave's input). */
  readonly orphanBundles: CollectResult["orphanBundles"];
  /** GLOBAL regex scripts, concatenated across profile dirs (the lift content-dedups repeats). */
  readonly globalRegexScripts: RegexScriptCard[];
  readonly malformedGlobalRegexScripts: number;
  /** charLore extra-book bindings, unioned across profile dirs (card filename STEM → book names). */
  readonly extraBooksByCardStem: Map<string, string[]>;
  readonly databankFileCount: number;
  readonly galleryImageCount: number;
  /** examined-but-not-imported records (unreadable cards/worlds, oversized/orphan chats, skip-listed characters). */
  readonly skipped: number;
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
function mergeRecords(into: CollectRecords, from: Awaited<ReturnType<typeof collectBundlesFromDir>>): void {
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
async function collectProfileRoot(deps: ProfileDirImportDeps): Promise<Collected> {
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
  const r: CollectRecords = {
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
function tallyScanned(collected: Collected): number {
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

/** dryRun prediction: a card writes iff neither the byte-identical importHash oracle nor the handle oracle
 *  matches (a create). Both lookups are reads — zero writes. Personas/chats can't be predicted without their
 *  write op, so they are examined (counted in scanned) but never in the dryRun `changed`. */
async function countWouldCreate(deps: ProfileDirImportDeps, bundles: readonly CollectedCard[]): Promise<number> {
  const ownerId = deps.principal.userId;
  let changed = 0;
  for (const b of bundles) {
    if (deps.signal.aborted) {
      break;
    }
    const importHash = importFileHash(b.cardBytes);
    const byHash = await deps.character.findByImportHash({ ownerId, importHash });
    if (byHash !== null) {
      continue;
    }
    const byHandle = await deps.character.findByHandle({ ownerId, handle: b.handle });
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
    // @orb-waive caught-failure-ownership(err): bookkeeping — the failure is recorded into
    // `skipped` (with reason), the function's own return value; one bad background never aborts the batch.
    // Ends if `skipped` stops being read by the caller.
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
  collected: Collected,
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

/** Import the collected standalone ST worlds as UNATTACHED owner library books; returns the net-new count
 *  (a name-collision re-import replaces in place and is not counted). Aborts cleanly on signal. */
async function importCollectedWorlds(deps: ProfileDirImportDeps, worlds: readonly CollectedWorld[]): Promise<number> {
  let created = 0;
  for (const world of worlds) {
    if (deps.signal.aborted) {
      break;
    }
    const bookResult = await deps.importStandaloneLorebook({ ownerId: deps.principal.userId, book: world.book });
    if (!bookResult.replaced) {
      created += 1;
    }
  }
  return created;
}

/** Assemble the import report from the merged collect results + the run's counts + the per-card skips. The
 *  two structure planes (`unhandled`/`unhandledSettings`) are deduped — a multi-profile upload lists the same
 *  section names per user dir. */
/** The preset + group waves' accounting, threaded into the report. Zero-valued (and empty) on a dryRun and on
 *  a profile carrying neither plane, which is byte-identically the pre-epic report. */
interface WaveOutcomes {
  readonly presetsImported: number;
  readonly presetsCreated: number;
  readonly skippedPresets: readonly ImportSkippedCard[];
  readonly presetNotes: readonly ImportPresetNote[];
  readonly themesImported: number;
  readonly themesCreated: number;
  /** The settings domain's per-theme refusals ONLY — the converter's own are merged in `reportFrom`. */
  readonly skippedThemes: readonly ImportSkippedCard[];
  readonly themeNotes: readonly ImportThemeNote[];
  readonly backgroundsImported: number;
  /** Backgrounds the STORE refused (magic mismatch, over-cap) — the non-media ones are merged in `reportFrom`. */
  readonly skippedBackgrounds: readonly ImportSkippedCard[];
  /** ST library tags that did not attach to their imported card (per-tag isolation, never silent). */
  readonly skippedCardTags: readonly ImportSkippedCardTag[];
  readonly appearanceKeysApplied: readonly string[];
  readonly groupsImported: number;
  readonly groupChatsImported: number;
  readonly skippedGroups: readonly ImportSkippedGroup[];
  readonly skippedGroupMembers: readonly ImportSkippedGroupMember[];
  /** Display names two seated cards share (the withheld name fallback) + the ST mutes that did not travel. */
  readonly ambiguousSpeakerNames: readonly ImportAmbiguousSpeakerName[];
  readonly seatedDisabledMembers: readonly ImportSeatedDisabledMember[];
  /** §5.7, MERGED across the solo bundle loop and the group wave — one report line per chat whose ST
   *  chat-bound persona pick named nobody here, wherever the transcript came from. */
  readonly unresolvedPinnedPersonas: readonly ImportUnresolvedPinnedPersona[];
  /** ALREADY-IMPORTED rooms this run back-filled persona attribution onto, summed across the solo, group and
   *  orphan waves (the dedup-skip HEAL — `BulkImportChatsResult.chatsPersonaHealed`). */
  readonly chatsPersonaHealed: number;
  /** The GLOBAL regex wave (found counts ride `collected`; these are the write-time outcomes). */
  readonly globalRegexScriptsLifted: number;
  readonly globalRegexScriptsReused: number;
  readonly globalRegexSkippedReason: string | null;
  /** The CARD lift halves (D121-E), summed across the bundle wave. */
  readonly cardRegexScriptsLifted: number;
  readonly cardRegexScriptsReused: number;
  /** The world NAME-LINK wave (card `extensions.world` + charLore) — attaches + the dangling names. */
  readonly worldLinksAttached: number;
  readonly worldLinksMissing: readonly { readonly character: string; readonly book: string }[];
  readonly worldLinksSkippedReason: string | null;
  /** The ORPHAN wave: dirs imported via a minted placeholder + the per-orphan failures. */
  readonly orphanImports: readonly { readonly dir: string; readonly characterName: string; readonly created: boolean; readonly chatsImported: number }[];
  readonly orphanSkipped: readonly { readonly dir: string; readonly reason: string }[];
}

const NO_WAVES: WaveOutcomes = {
  presetsImported: 0,
  presetsCreated: 0,
  skippedPresets: [],
  presetNotes: [],
  themesImported: 0,
  themesCreated: 0,
  skippedThemes: [],
  themeNotes: [],
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
  readonly collected: Collected;
  readonly scanned: number;
  readonly changed: number;
  readonly skippedCards: readonly ImportSkippedCard[];
  readonly waves: WaveOutcomes;
  /** Present ONLY on a dryRun — the census that keeps a rehearsal's structural zeroes from reading as "this
   *  profile carries none of these planes" (#1469). */
  readonly dryRunWouldImport?: ImportDryRunCensus;
}

/** What each wave WOULD attempt, straight off the collect result: the counts a real run's wave outcomes
 *  report after writing. `characters` is the bundle count (`changed` separately carries the read-only
 *  create PREDICTION); chats are every transcript paired to a card. */
function dryRunCensus(collected: Collected): ImportDryRunCensus {
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
 *  own `extensions.world`; `extras` are the profile's `charLore` bindings for this card. Missing names come
 *  back per character for the report. */
async function attachWorldLinksFor(args: {
  readonly attach: AttachOwnedBooksByName;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly bundle: CollectedCard;
  readonly extras: readonly string[];
}): Promise<{ readonly attached: number; readonly missing: { character: string; book: string }[] }> {
  const { attach, ownerId, characterId, bundle, extras } = args;
  const missing: { character: string; book: string }[] = [];
  let attached = 0;
  if (bundle.worldName !== null) {
    const res = await attach({ ownerId, characterId, names: [bundle.worldName], role: "primary" });
    attached += res.linked;
    missing.push(...res.missing.map((book) => ({ character: bundle.cardName, book })));
  }
  if (extras.length > 0) {
    const res = await attach({ ownerId, characterId, names: extras, role: "auxiliary" });
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
  collected: Collected,
  characterIdByCardFilename: ReadonlyMap<string, CharacterId>,
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
    const result = await attachWorldLinksFor({ attach, ownerId: deps.principal.userId, characterId, bundle, extras });
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
  orphans: Collected["orphanBundles"],
): Promise<{
  readonly changed: number;
  readonly orphanImports: { dir: string; characterName: string; created: boolean; chatsImported: number }[];
  readonly orphanSkipped: { dir: string; reason: string }[];
  readonly unresolvedPins: ImportUnresolvedPinnedPersona[];
  readonly chatsPersonaHealed: number;
}> {
  let changed = 0;
  let chatsPersonaHealed = 0;
  const orphanImports: { dir: string; characterName: string; created: boolean; chatsImported: number }[] = [];
  const orphanSkipped: { dir: string; reason: string }[] = [];
  const unresolvedPins: ImportUnresolvedPinnedPersona[] = [];
  for (const orphan of orphans) {
    if (deps.signal.aborted) {
      break;
    }
    // @orb-waive caught-failure-ownership(err): bookkeeping — the failure is recorded into
    // `orphanSkipped` (with reason), part of the function's own return value; one bad orphan directory
    // never aborts the batch. Ends if `orphanSkipped` stops being read by the caller.
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
      unresolvedPins.push(...chatResult.unresolvedPinnedPersonas);
      orphanImports.push({ dir: orphan.dirName, characterName: mint.name, created: mint.created, chatsImported: chatResult.chatsImported });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      orphanSkipped.push({ dir: orphan.dirName, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return { changed, orphanImports, orphanSkipped, unresolvedPins, chatsPersonaHealed };
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
    return { changed, characterId: cardResult.characterId, unresolvedPins: [], chatsPersonaHealed: 0, ...scripts };
  }
  const chatResult = await service.importChats({ characterId: cardResult.characterId, chats: bundle.chats });
  changed += chatResult.chatsImported;
  return {
    changed,
    characterId: cardResult.characterId,
    unresolvedPins: chatResult.unresolvedPinnedPersonas,
    chatsPersonaHealed: chatResult.chatsPersonaHealed,
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
  /** The card-lift halves of the regex accounting, summed across every imported card. */
  readonly cardScriptsLifted: number;
  readonly cardScriptsReused: number;
  /** Library tags that did NOT attach to an imported card, with the reason (per-tag isolation, never silent). */
  readonly skippedCardTags: ImportSkippedCardTag[];
}> {
  let changed = 0;
  let chatsPersonaHealed = 0;
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
    // @orb-waive caught-failure-ownership(err): bookkeeping — the failure is recorded into
    // `skippedCards` (with reason), part of the function's own return value; one bad card bundle never
    // aborts the batch. Ends if `skippedCards` stops being read by the caller.
    try {
      const result = await importOneBundle(service, bundle);
      changed += result.changed;
      chatsPersonaHealed += result.chatsPersonaHealed;
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
    cardScriptsLifted,
    cardScriptsReused,
    skippedCardTags,
  };
}

/** Assemble the run's ImportContext. Post-import embedding is enqueued ONCE at the very end of the whole
 *  import (gated on `changed > 0`) — NOT per character. Reasons: (1) the per-(kind, owner) admission lock
 *  makes a per-entity enqueue collide, and an unhandled conflict aborts the import mid-loop (the "only 2 of
 *  hundreds imported" bug); (2) the embed passes (characters then chats) must run AFTER the whole import,
 *  never while it is still writing. So the per-chat `enqueueBackfill` the importChats verb calls is a NO-OP
 *  here — the driver owns the one enqueue. */
function contextFor(deps: ProfileDirImportDeps, store: ImportAssetPort["store"]): ReturnType<typeof buildImportContext> {
  return buildImportContext({
    principal: deps.principal,
    character: deps.character,
    storeAvatar: store,
    attachCardTag: deps.attachCardTag,
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
      // NO-OP (see the header): the driver owns the one enqueue, so this per-chat call enqueues nothing and
      // reports nothing enqueued.
      enqueueBackfill: (): Promise<boolean> => Promise.resolve(false),
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
export async function runProfileDirImport(deps: ProfileDirImportDeps): Promise<ImportReport> {
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

  // Personas FIRST — populates personaByUserName so the chat importers can attribute their user_names.
  const personaInputs: ImportPersonaInput[] = [];
  for (const p of collected.personas) {
    if (deps.signal.aborted) {
      break;
    }
    personaInputs.push(await toPersonaInput(store, deps.principal, p));
  }
  if (personaInputs.length > 0) {
    const personaResult = await service.importPersonas({ personas: personaInputs });
    changed += personaResult.personasCreated;
  }

  // Standalone ST worlds BEFORE characters — imported as UNATTACHED owner library books (dedup by name). Ahead
  // of the character wave so a future card name-link (`extensions.world`) can resolve an already-imported book.
  changed += await importCollectedWorlds(deps, collected.worlds);

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
  // `charLore` names per-character EXTRA books (`auxiliary`). Exact-name resolution only; a dangling name
  // is a report row, never a near-match.
  const worldLinks = await attachCollectedWorldLinks(deps, collected, bundleResult.characterIdByCardFilename);

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

  // ONE post-import embed enqueue for the whole run, gated on new canon (characters/personas/chats/worlds/
  // presets/group rooms) — the op chains embed-characters → embed-chats via dependsOn (see portability-runner).
  // Triggered on ANY new canon, not just a chat, so a characters-only import still embeds its cards. Skipped on
  // abort (retry re-runs).
  if (changed > 0 && !deps.signal.aborted) {
    await deps.enqueueBackfill({ ownerId: deps.principal.userId });
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

type FsEntry = Awaited<ReturnType<ImportFsPort["readdir"]>>[number];

function direntKind(e: Dirent): FsEntry["kind"] {
  if (e.isFile()) {
    return "file";
  }
  return e.isDirectory() ? "directory" : "other";
}

/** The fs codes that mean "this profile carries no such plane": the dir is not there (`ENOENT`), or the name
 *  is occupied by a FILE (`ENOTDIR`) — both are ABSENT, which is the port's documented `[]`. Every other code
 *  (`EACCES`, `EIO`, `ELOOP`, `EMFILE`, …) is an INFRASTRUCTURE fault: folding those into the same empty
 *  listing made an unreadable `characters/` read as "this profile has no characters" and imported a truncated
 *  profile while reporting success (#1469). */
const ABSENT_DIR_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR"]);

/** The real node:fs `ImportFsPort` for the staged profile snapshot. `readdir` resolves `[]` for an ABSENT dir
 *  (the port contract — a profile may carry only one subdir) and REJECTS on an infrastructure fault. */
export function createNodeFsImportPort(): ImportFsPort {
  return {
    readdir: async (dir): Promise<readonly FsEntry[]> => {
      // The catch is NARROWED to the two ABSENT
      // codes and RE-THROWS everything else — an infra fault leaves as a rejection, which the collector
      // wraps as `ImportInfraFailureError`. Ends if the port stops distinguishing absent from broken.
      try {
        const ents = await readdirFs(dir, { withFileTypes: true });
        return ents.map((e): FsEntry => ({ name: e.name, kind: direntKind(e) }));
      } catch (error) {
        if (!ABSENT_DIR_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
          throw error;
        }
        return [];
      }
    },
    readFile: (path): Promise<Uint8Array> => readFileFs(path),
    stat: async (path): Promise<{ readonly size: number }> => {
      const s = await statFs(path);
      return { size: s.size };
    },
    join: (...parts): string => join(...parts),
  };
}
