import type { StoredAsset, StoreParams } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { ImportFsPort, PersonaCollisionChoices } from "@orb/contracts/import";
import type { ImportedAppearance, ImportedAppearanceOutcome, SettingsImportOutcome } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { ImportAssetPort } from "#domain/assets";
import type { BulkImportChats } from "#domain/chat";
import type { BulkImportPersonas } from "#domain/persona";
import type { ImportPreset } from "#domain/preset";
import type { ImportCardScripts, ImportGlobalScripts, ImportPresetScripts } from "#domain/regex";
import type { ImportTagPort } from "#domain/tag";
import type { AttachOwnedBooksByName, ImportStandaloneLorebook, ImportWorldInfoPort } from "#domain/world-info";
import type { ImportContextWiring } from "./build-context.ts";
import type { CollectResult } from "./collection.ts";
import type { ImportReport } from "./results.ts";

/** The settings-owned theme-import op (`createImportTheme`) as the driver consumes it. */
type ImportTheme = (ownerId: UserId, bytes: Uint8Array, fallbackName?: string) => Promise<SettingsImportOutcome>;
/** The settings-owned `appearance` landing op (`createApplyImportedAppearance`). */
type ApplyImportedAppearance = (ownerId: UserId, imported: ImportedAppearance) => Promise<ImportedAppearanceOutcome>;

/** The CAS store for BACKGROUND blobs. A separate port from the avatar one (which is deliberately narrowed to
 *  `kind:"avatar"` and returns only an id): a `BackgroundLibraryEntry` needs the content HASH — the picker
 *  builds `blobUrl(hash)` from it with no async id→hash round-trip — and the kind differs. `enforceMagic` is
 *  bound TRUE at the composition root: a background's mime is only extension-derived here, so the bytes are
 *  verified against the claim before they enter the CAS. */
type ImportBackgroundStore = (params: Pick<StoreParams, "principal" | "bytes" | "mime" | "maxBytes">) => Promise<Pick<StoredAsset, "assetId" | "hash">>;

export interface ProfileDirImportDeps {
  readonly fs: ImportFsPort;
  /** The root holding one subdir per ST user profile (the loader collects each subdir independently). */
  readonly profileRoot: string;
  readonly principal: Principal;
  readonly contextFor: (principal: Principal, store: ImportAssetPort["store"]) => ImportContextWiring;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook?: ImportWorldInfoPort["importLorebook"];
  /** Travels with `importLorebook` (#1598 — the edited-primary guard). */
  readonly hasPrimaryBook?: ImportWorldInfoPort["hasPrimaryBook"];
  readonly linkCarriedBooks?: ImportWorldInfoPort["linkCarriedBooks"];
  /** Card-carried scripts land through the same owner operation as upload and bundle import. */
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
  readonly enqueueImportIndex: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly now: () => number;
  /** The zone the staged ST snapshot's wall-clock dates were written in. Omitted uses the importing host's zone — a
   *  profile snapshot is imported on the box that produced it in the ordinary case, and ST built those
   *  strings off that box's local `Date`. Explicit here so a test pins it instead of inheriting the host's. */
  readonly stWallClockZone?: string;
  readonly dryRun: boolean;
  readonly signal: AbortSignal;
  /** The review's per-collision persona choices; an unlisted collision merges. */
  readonly personaCollisions?: PersonaCollisionChoices | undefined;
}

export interface ProfileCollectRecords
  extends Pick<
    CollectResult,
    | "unreadableCards"
    | "unreadableWorlds"
    | "unreadablePresets"
    | "refusedThemes"
    | "skippedBackgrounds"
    | "unreadableGroups"
    | "skippedChats"
    | "orphanChatDirs"
    | "skippedCharacters"
    | "unhandled"
    | "unhandledSettings"
    | "truncatedDirs"
  > {
  readonly missingGroupChats: ImportReport["missingGroupChats"][number][];
}

export interface ProfileCollected
  extends ProfileCollectRecords,
    Pick<
      CollectResult,
      | "bundles"
      | "personas"
      | "worlds"
      | "presets"
      | "themes"
      | "backgrounds"
      | "appearance"
      | "groups"
      | "tagsByEntityKey"
      | "orphanBundles"
      | "globalRegexScripts"
      | "malformedGlobalRegexScripts"
      | "extraBooksByCardStem"
      | "databankFileCount"
      | "galleryImageCount"
    > {
  readonly skipped: number;
}

export type ProfileWaveOutcomes = Pick<
  ImportReport,
  | "presetsImported"
  | "presetsCreated"
  | "skippedPresets"
  | "presetNotes"
  | "themesImported"
  | "themesCreated"
  | "skippedThemes"
  | "themeNotes"
  | "worldNotes"
  | "backgroundsImported"
  | "skippedBackgrounds"
  | "skippedCardTags"
  | "appearanceKeysApplied"
  | "groupsImported"
  | "groupChatsImported"
  | "skippedGroups"
  | "skippedGroupMembers"
  | "ambiguousSpeakerNames"
  | "seatedDisabledMembers"
  | "unresolvedPinnedPersonas"
  | "chatsPersonaHealed"
  | "personasMergedKeys"
  | "memoryChatIds"
  | "globalRegexScriptsLifted"
  | "globalRegexScriptsReused"
  | "globalRegexSkippedReason"
  | "cardRegexScriptsLifted"
  | "cardRegexScriptsReused"
  | "worldLinksAttached"
  | "worldLinksMissing"
  | "worldLinksSkippedReason"
  | "orphanImports"
  | "orphanSkipped"
>;
