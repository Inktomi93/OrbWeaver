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
// created personas + imported chats). The runner reconciles stats post-run when `changed > 0` (PD-78); a
// chat write enqueues the memory backfill via the injected op (PD-78).
//
// dryRun: parse + collect + the read-only dedup MATCH only — ZERO writes. The import verbs have no
// write-free mode, so the driver never calls them under `dryRun`; it predicts the character-create count via
// the (read-only) importHash + handle oracles. Persona/chat dedup can't be predicted without the write op,
// so `changed` under `dryRun` reflects character creates only (documented; the invariant the runner cares
// about is zero writes).
//
// PD-94: every avatar/card blob is stored through a `maxBytes`-capped store — the zip-bomb belt for this
// non-HTTP caller (the store seam rejects an over-cap blob before the CAS write).

import type { Dirent } from "node:fs";
import { readdir as readdirFs, readFile as readFileFs, stat as statFs } from "node:fs/promises";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
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
  ImportFsPort,
  ImportPersonaInput,
  ImportPresetNote,
  ImportReport,
  ImportSkippedCard,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportThemeNote,
} from "#domain/import";
import { collectBundlesFromDir, createImportService, importFileHash } from "#domain/import";
import type { BulkImportPersonas } from "#domain/persona";
import type { ImportPreset } from "#domain/preset";
import type { ImportedAppearance, ImportedAppearanceOutcome, SettingsImportOutcome } from "#domain/settings";
import type { ImportStandaloneLorebook } from "#domain/world-info";
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
  readonly linkCarriedBooks?: ImportWorldInfoPort["linkCarriedBooks"];
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
  readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly now: () => number;
  /** The zone the staged ST snapshot's wall-clock dates were written in. Omitted ⇒ {@link hostTimeZone} — a
   *  profile snapshot is imported on the box that produced it in the ordinary case, and ST built those
   *  strings off that box's local `Date`. Explicit here so a test pins it instead of inheriting the host's. */
  readonly stWallClockZone?: string;
  readonly dryRun: boolean;
  readonly signal: AbortSignal;
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
  };
  for (const ent of await fs.readdir(profileRoot)) {
    if (signal.aborted) {
      break;
    }
    if (ent.kind !== "directory") {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: user dirs are collected sequentially — a one-time bulk-import scan, not a hot path.
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
  return { bundles, personas, worlds, presets, themes, backgrounds, appearance, groups, tagsByEntityKey, skipped, ...r };
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
    // biome-ignore lint/performance/noAwaitInLoops: dedup oracles are probed sequentially per bundle during the one-time dry scan.
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

/** Store one persona's avatar (PD-94-capped) and pair it into the canonical persona-import input. */
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

/** The ST BACKGROUND wave: CAS-store each collected image/video under the owner (kind `background`, PD-94
 *  capped, magic-verified because the mime is only extension-derived) and turn it into a ready
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
): Promise<{ readonly entries: BackgroundLibraryEntry[]; readonly skipped: ImportSkippedCard[] }> {
  const entries: BackgroundLibraryEntry[] = [];
  const skipped: ImportSkippedCard[] = [];
  const store = deps.storeBackground;
  const newEntryId = deps.newBackgroundEntryId;
  if (store === undefined || newEntryId === undefined) {
    return { entries, skipped: backgrounds.map((b) => ({ file: b.filename, reason: "background import is not wired into this composition" })) };
  }
  for (const background of backgrounds) {
    if (deps.signal.aborted) {
      break;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: backgrounds are stored sequentially during the one-time bulk import — one CAS write each, isolated per file.
      const stored = await store({
        principal: deps.principal,
        bytes: background.bytes,
        mime: background.mime,
        // One single-asset ceiling repo-wide — the profile importer deliberately shares the upload cap.
        maxBytes: ASSET_UPLOAD_MAX_BYTES,
      });
      entries.push({ entryId: newEntryId(), assetId: stored.assetId, assetHash: stored.hash, mime: background.mime, name: background.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ file: background.filename, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return { entries, skipped };
}

/** Import the collected standalone ST worlds as UNATTACHED owner library books; returns the net-new count
 *  (a name-collision re-import replaces in place and is not counted). Aborts cleanly on signal. */
async function importCollectedWorlds(deps: ProfileDirImportDeps, worlds: readonly CollectedWorld[]): Promise<number> {
  let created = 0;
  for (const world of worlds) {
    if (deps.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: worlds are imported sequentially during the one-time bulk import, not a hot path.
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
  readonly appearanceKeysApplied: readonly string[];
  readonly groupsImported: number;
  readonly groupChatsImported: number;
  readonly skippedGroups: readonly ImportSkippedGroup[];
  readonly skippedGroupMembers: readonly ImportSkippedGroupMember[];
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
  appearanceKeysApplied: [],
  groupsImported: 0,
  groupChatsImported: 0,
  skippedGroups: [],
  skippedGroupMembers: [],
};

interface ReportArgs {
  readonly collected: Collected;
  readonly scanned: number;
  readonly changed: number;
  readonly skippedCards: readonly ImportSkippedCard[];
  readonly waves: WaveOutcomes;
}

function reportFrom({ collected, scanned, changed, skippedCards, waves }: ReportArgs): ImportReport {
  return {
    scanned,
    changed,
    skippedCards,
    unreadableCards: collected.unreadableCards,
    unreadableWorlds: collected.unreadableWorlds,
    unreadablePresets: collected.unreadablePresets,
    unreadableGroups: collected.unreadableGroups,
    missingGroupChats: collected.missingGroupChats,
    ...waves,
    // ONE "did not import" list per plane, whichever stage refused: the CONVERTER's refusals (collect-time —
    // unreadable / colour-less / a base surface the derivation cannot make legible; a non-media background
    // file) joined with the WRITE stage's (the settings domain refused the theme; the CAS refused the blob).
    skippedThemes: [...collected.refusedThemes, ...waves.skippedThemes],
    skippedBackgrounds: [...collected.skippedBackgrounds, ...waves.skippedBackgrounds],
    skippedChats: collected.skippedChats,
    orphanChatDirs: collected.orphanChatDirs,
    skippedCharacters: collected.skippedCharacters,
    unhandled: [...new Set(collected.unhandled)],
    unhandledSettings: [...new Set(collected.unhandledSettings)],
  };
}

/** Import one collected card bundle: the character (idempotent by importHash) then its chats. Returns the
 *  net-new count (created character + imported chats) and the resolved character id (for the tag attach).
 *  Throws are the CALLER's to isolate. */
async function importOneBundle(
  service: ReturnType<typeof createImportService>,
  bundle: CollectedCard,
): Promise<{ readonly changed: number; readonly characterId: CharacterId }> {
  let changed = 0;
  const cardResult = await service.importCharacter({ card: { bytes: bundle.cardBytes, filename: bundle.filename } });
  if (cardResult.created) {
    changed += 1;
  }
  if (bundle.chats.length > 0) {
    const chatResult = await service.importChats({ characterId: cardResult.characterId, chats: bundle.chats });
    changed += chatResult.chatsImported;
  }
  return { changed, characterId: cardResult.characterId };
}

/** Attach the ST library tags for a just-imported character (`tag_map[card filename]` → resolve-or-create by
 *  NAME). Source `manual`/status `accepted` — these are the user's own library tags, not a card-shipped
 *  suggestion. The attaches are independent and the verb is race-safe/idempotent (try-insert, fall back on
 *  conflict; never downgrades an accepted row), so they run together; `allSettled` isolates a single tag's
 *  failure so one bad tag never loses the already-imported character. */
function attachBundleTags(deps: ProfileDirImportDeps, characterId: CharacterId, tagNames: readonly string[]): Promise<unknown> {
  const ownerId = deps.principal.userId;
  return Promise.allSettled(tagNames.map((tagName) => deps.attachCardTag({ ownerId, characterId, tagName, source: "manual", status: "accepted" })));
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
}> {
  let changed = 0;
  const skippedCards: ImportSkippedCard[] = [];
  const characterIdByCardFilename = new Map<string, CharacterId>();
  const characterNameByCardFilename = new Map<string, string>();
  for (const bundle of bundles) {
    if (deps.signal.aborted) {
      break;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: bulk import is intentionally sequential — each card is one atomic idempotent write, isolated per bundle.
      const result = await importOneBundle(service, bundle);
      changed += result.changed;
      characterIdByCardFilename.set(bundle.filename, result.characterId);
      characterNameByCardFilename.set(bundle.filename, bundle.cardName);
      const tagNames = tagsByEntityKey.get(bundle.filename);
      if (tagNames !== undefined && tagNames.length > 0) {
        await attachBundleTags(deps, result.characterId, tagNames);
      }
    } catch (err) {
      // The concise refusal reason for the report — the last line of a ZodError prettify is the actionable
      // one ("Too big: expected string to have <=200 characters → at cardVersion").
      const message = err instanceof Error ? err.message : String(err);
      skippedCards.push({ file: bundle.filename, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return { changed, skippedCards, characterIdByCardFilename, characterNameByCardFilename };
}

/**
 * Import a staged ST profile-directory snapshot into the target owner. Returns the maintenance-pass counts
 * (scanned + changed). `dryRun` collects + matches with ZERO writes.
 */
export async function runProfileDirImport(deps: ProfileDirImportDeps): Promise<ImportReport> {
  const collected = await collectProfileRoot(deps);
  const scanned = tallyScanned(collected);

  if (deps.dryRun) {
    return reportFrom({ collected, scanned, changed: await countWouldCreate(deps, collected.bundles), skippedCards: [], waves: NO_WAVES });
  }

  // The card avatar is CAS-stored inside importCharacter via ctx.storeAsset → this capped store (PD-94).
  const store: ImportAssetPort["store"] = (params) => deps.storeAvatar({ ...params, maxBytes: ASSET_UPLOAD_MAX_BYTES });
  // Post-import embedding is enqueued ONCE at the very end of the whole import (below, gated on `changed > 0`)
  // — NOT per character. Reasons: (1) the per-(kind, owner) admission lock makes a per-entity enqueue collide,
  // and an unhandled conflict aborts the import mid-loop (the "only 2 of hundreds imported" bug); (2) the embed
  // passes (characters then chats) must run AFTER the whole import, never while it is still writing. So the
  // per-chat `enqueueBackfill` the importChats verb calls is a NO-OP here — the driver owns the one enqueue.
  const ctx = buildImportContext({
    principal: deps.principal,
    character: deps.character,
    storeAvatar: store,
    attachCardTag: deps.attachCardTag,
    ...(deps.importLorebook !== undefined ? { importLorebook: deps.importLorebook } : {}),
    ...(deps.linkCarriedBooks !== undefined ? { linkCarriedBooks: deps.linkCarriedBooks } : {}),
    profile: {
      now: deps.now,
      stWallClockZone: stWallClockZone(deps),
      personaByUserName: new Map(),
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      enqueueBackfill: (): Promise<void> => Promise.resolve(),
      reconcileStats: deps.reconcileImportStats,
      ...(deps.importPreset !== undefined ? { importPreset: deps.importPreset } : {}),
      ...(deps.importTheme !== undefined ? { importTheme: deps.importTheme } : {}),
    },
  });
  const service = createImportService(ctx);

  let changed = 0;

  // Personas FIRST — populates personaByUserName so the chat importers can attribute their user_names.
  const personaInputs: ImportPersonaInput[] = [];
  for (const p of collected.personas) {
    if (deps.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: avatars are stored sequentially during the one-time bulk import (a short persona list), not a hot path.
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

  // ST BACKGROUNDS — CAS-stored, then appended to `appearance.backgroundLibrary` together with the
  // `power_user` ergonomics patch in ONE serialized settings write (the array append needs a
  // read-modify-write that must sit INSIDE the per-user serializer). A re-run stores byte-identical blobs
  // that dedup in the CAS and appends nothing (the entry dedup is by assetId), so `changed` stays honest.
  const stored = await storeCollectedBackgrounds(deps, collected.backgrounds);
  let backgroundsImported = 0;
  let appearanceKeysApplied: readonly string[] = [];
  if (deps.applyImportedAppearance !== undefined && (stored.entries.length > 0 || Object.keys(collected.appearance).length > 0)) {
    const outcome = await deps.applyImportedAppearance(deps.principal.userId, { patch: collected.appearance, backgroundLibrary: stored.entries });
    backgroundsImported = outcome.backgroundsAdded;
    appearanceKeysApplied = outcome.patchedKeys;
    changed += backgroundsImported;
  }

  const bundleResult = await importCollectedBundles(deps, service, collected.bundles, collected.tagsByEntityKey);
  changed += bundleResult.changed;

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
      skippedBackgrounds: stored.skipped,
      appearanceKeysApplied,
      groupsImported: groupResult.groupsImported,
      groupChatsImported: groupResult.groupChatsImported,
      skippedGroups: groupResult.skippedGroups,
      skippedGroupMembers: groupResult.skippedMembers,
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

/** The real node:fs `ImportFsPort` for the staged profile snapshot. `readdir` resolves `[]` for a
 *  missing/unreadable dir (the port contract — a profile may carry only one subdir), never throwing. */
export function createNodeFsImportPort(): ImportFsPort {
  return {
    readdir: async (dir): Promise<readonly FsEntry[]> => {
      try {
        const ents = await readdirFs(dir, { withFileTypes: true });
        return ents.map((e): FsEntry => ({ name: e.name, kind: direntKind(e) }));
      } catch {
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
