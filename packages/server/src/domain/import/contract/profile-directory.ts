import type { StoreAvatarAsset, StoredAsset, StoreParams } from "@orb/contracts/assets";
import type { BulkImportChatsOp, FindImportedChatHashes } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ImportFsPort, PersonaCollisionChoices } from "@orb/contracts/import";
import type { BulkImportPersonas, FindOwnedPersonas } from "@orb/contracts/persona";
import type { FindOwnedPresets, ImportPreset } from "@orb/contracts/preset";
import type { ImportCardScripts, ImportGlobalScripts, ImportPresetScripts } from "@orb/contracts/regex";
import type {
  FindOwnedThemes,
  ImportedAppearance,
  ImportedAppearanceOutcome,
  ImportThemeOp,
  NewBackgroundEntryId,
  OwnedBackgroundHashes,
} from "@orb/contracts/settings";
import type { AttachCardTagByNameOp } from "@orb/contracts/tag";
import type { AttachOwnedBooksByName, FindOwnedBooks, ImportStandaloneLorebook, ImportWorldInfoPort } from "@orb/contracts/world-info";
import type { UserId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { ImportContextWiring } from "./build-context.ts";
import type {
  CollectedBackground,
  CollectedCard,
  CollectedChat,
  CollectedGroup,
  CollectedPersona,
  CollectedPreset,
  CollectedTheme,
  CollectedWorld,
  CollectResult,
} from "./collection.ts";
import type { ImportReport } from "./results.ts";
import type { AdoptDefaultPersona } from "./service.ts";

/** The settings-owned `appearance` landing op (`createApplyImportedAppearance`). */
type ApplyImportedAppearance = (ownerId: UserId, imported: ImportedAppearance) => Promise<ImportedAppearanceOutcome>;

/** The CAS store for BACKGROUND blobs. A separate port from the avatar one (which is deliberately narrowed to
 *  `kind:"avatar"` and returns only an id): a `BackgroundLibraryEntry` needs the content HASH — the picker
 *  builds `blobUrl(hash)` from it with no async id→hash round-trip — and the kind differs. `enforceMagic` is
 *  bound TRUE at the composition root: a background's mime is only extension-derived here, so the bytes are
 *  verified against the claim before they enter the CAS. */
type ImportBackgroundStore = (params: Pick<StoreParams, "principal" | "bytes" | "mime" | "maxBytes">) => Promise<Pick<StoredAsset, "assetId" | "hash">>;

/** What the owner already holds, asked of each owning domain without writing. A dry run's preview names an item
 *  the owner has through these reads, one per kind a character's own lookups do not cover. */
export interface ProfileOwnership {
  readonly findBooks: FindOwnedBooks;
  readonly findPresets: FindOwnedPresets;
  readonly findThemes: FindOwnedThemes;
  readonly backgroundHashes: OwnedBackgroundHashes;
  readonly findPersonas: FindOwnedPersonas;
  readonly findChatHashes: FindImportedChatHashes;
}

/** The collected items of each kind the owner already holds. An item is the collected entry itself, never its
 *  source string, so two profiles that share a path keep their own verdicts. */
export interface ImportOwnership {
  readonly characters: ReadonlySet<CollectedCard>;
  readonly chats: ReadonlySet<CollectedChat>;
  readonly personas: ReadonlySet<CollectedPersona>;
  readonly worlds: ReadonlySet<CollectedWorld>;
  readonly presets: ReadonlySet<CollectedPreset>;
  readonly themes: ReadonlySet<CollectedTheme>;
  readonly backgrounds: ReadonlySet<CollectedBackground>;
  readonly groups: ReadonlySet<CollectedGroup>;
  readonly orphans: ReadonlySet<CollectResult["orphanBundles"][number]>;
}

export interface ProfileDirImportDeps {
  /** The tree holding one subdir per ST user profile (the loader collects each subdir independently). */
  readonly fs: ImportFsPort;
  readonly principal: Principal;
  readonly contextFor: (principal: Principal, store: StoreAvatarAsset) => ImportContextWiring;
  readonly storeAvatar: StoreAvatarAsset;
  readonly attachCardTag: AttachCardTagByNameOp;
  readonly importLorebook?: ImportWorldInfoPort["importLorebook"];
  /** Travels with `importLorebook` (the edited-primary guard). */
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
  readonly importTheme?: ImportThemeOp;
  /** The settings-owned null-only default-persona crown (`createAdoptImportedDefaultPersona`). */
  readonly adoptDefaultPersona: AdoptDefaultPersona;
  /** The CAS store for the ST `backgrounds/` plane. Optional: absent ⇒ no background imports (and every
   *  collected file is reported skipped-with-reason). */
  readonly storeBackground?: ImportBackgroundStore;
  /** Lands the `appearance` plane (the background-library append + the `power_user` ergonomics patch) in ONE
   *  serialized settings write. Optional alongside `storeBackground` — both come from the same composition. */
  readonly applyImportedAppearance?: ApplyImportedAppearance;
  /** Mints a `BackgroundLibraryEntry`'s stable per-row id (crypto uuid in prod; deterministic in tests). */
  readonly newBackgroundEntryId?: NewBackgroundEntryId;
  /** The read-only twins of the write ops above, so a dry run can say what the owner already has. */
  readonly ownership: ProfileOwnership;
  readonly bulkImportChats: BulkImportChatsOp;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly enqueueImportIndex: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly now: Clock;
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
    | "missingPersonaAvatars"
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
