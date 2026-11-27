// Parsed profile interchange and collected file bundles; no driver dependencies or write authority.

import type { PersonaImportName } from "@orb/contracts/persona";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { CharacterHandle } from "@orb/kit/ids";
import type { JsonObject } from "@orb/kit/json";
import type { ParsedChat } from "#primitives/serde/chat";
import type { ParsedStPreset } from "#primitives/serde/preset";
import type { ParsedStTheme } from "#primitives/serde/theme";

/** name is the key an imported chat's user_name maps against (case-insensitively) to attribute messages. */
export interface ParsedPersona {
  readonly name: PersonaImportName;
  readonly description: string;
  readonly avatarFile: string;
  readonly isDefault: boolean;
  readonly metadata: JsonObject | null;
}

/** One uploaded file: its path in the picked folder and its bytes. */
export interface UploadedFile {
  readonly relPath: string;
  readonly bytes: Uint8Array;
}

export interface ParsedPersonas {
  readonly personas: ParsedPersona[];
}

/** ST library-tag assignments resolved to per-entity tag NAMES. The key is the entity's card/avatar filename
 *  (ST's `tag_map[character.avatar]`); ST's per-profile tag ids are resolved away here so the importer attaches
 *  by name. Only entries with at least one resolvable name are present. */
export interface ParsedStTags {
  readonly byEntityKey: ReadonlyMap<string, readonly string[]>;
}

export interface CollectedChat {
  readonly parsed: ParsedChat;
  readonly importedFrom: string;
  /** The transcript's path in the profile, stable across the uploads of a split folder. */
  readonly sourceFile: string;
  /** The transcript's content identity (`chatContentHash`). */
  readonly importHash: string;
  /** The whole-file hash a row imported before the content identity carries (the write op's second lookup). */
  readonly fileHash?: string;
}

/** domain/import can't reach domain/assets — cardBytes/filename ride through to the driver that stores them. */
export interface CollectedCard {
  readonly handle: CharacterHandle;
  readonly cardBytes: Uint8Array;
  /** The card's import identity (`parsedCardImportHash`) and the same without its art (`parsedCardTextHash`)
   *  — what the dry run's create prediction asks by, in the one lookup order every door uses. */
  readonly contentHash: string;
  readonly textHash: string;
  /** The handle an orbweaver export carried (`ParsedCard.handle`), null for a foreign card: the row the lookup's
   *  current step compares, so the dry run asks what the write asks. */
  readonly carriedHandle: CharacterHandle | null;
  readonly filename: string;
  /** The card's DISPLAY name off the parsed card. Carried because the ST group importer needs a card-name →
   *  seat fallback for pre-group-era transcript lines that carry no `original_avatar` filename; the handle is
   *  NOT a substitute (it is slugified AND collision-suffixed, so it no longer matches what a line says). */
  readonly cardName: string;
  /** The card's `extensions.world` NAME-LINK — the lorebook NAME ST binds as this character's primary book
   *  (35 of 313 corpus cards). The driver attaches it by exact name AFTER the character + standalone-world
   *  waves (role `primary`, demoted when an embedded book claimed the seat); a dangling name is reported. */
  readonly worldName: string | null;
  readonly chats: CollectedChat[];
}

export interface CollectedPersona {
  readonly parsed: ParsedPersona;
  readonly avatarBytes?: Uint8Array;
}

/** One ST-native `worlds/*.json` standalone lorebook, already parsed to the canonical shape (`book.name` is
 *  the filename stem). Imported UNATTACHED as an owner library book — a card's OWN embedded book is a separate
 *  path (`CollectedCard` → the primary attach). */
export interface CollectedWorld {
  readonly book: BulkImportLorebookInput;
  /** The book file's path in the profile, stable across the uploads of a split folder. A book's name is not
   *  its identity: an orb export names itself, so two files can carry one name. */
  readonly sourceFile: string;
}

/** One parsed ST group definition. `memberFiles`/`disabledMemberFiles` are CARD FILENAMES (the collect-time
 *  key ST itself uses); `chatLeaves` are `group chats/<leaf>.jsonl` basenames without the extension. */
export interface ParsedStGroup {
  /** The group's display name (ST's `name`), or the file stem when it carries none. */
  readonly name: string;
  readonly memberFiles: readonly string[];
  /** Members the author DISABLED in ST. Still SEATED — the room's cast is the cast — and now seated MUTED:
   *  the flag TRAVELS onto orb's own per-seat mute (`chat_participants.disabled`, `seatKnobsSchema`) through
   *  the bulk-import wire's `seatKnobs` channel. The ruling survives with its input changed: the old
   *  parenthetical "orb has no per-member mute" was false — orb had the knob, the WIRE had no channel for it,
   *  and the report could only say the flag was lost. Reported either way, so the operator knows which seats
   *  arrived quiet. */
  readonly disabledMemberFiles: readonly string[];
  readonly chatLeaves: readonly string[];
  /** ST `generation_mode: 1` (append) ⇒ the whole cast speaks in ONE message ⇒ orb's `narrator` output. */
  readonly narratorOutput: boolean;
  /** ST `allow_self_responses` — maps 1:1 onto orb's group config field of the same meaning. */
  readonly allowSelfResponses: boolean;
}

/** One ST preset already mapped to the orb-native portable file, with the ST fields that found no orb seat.
 *  `sourceFile` is what the report names (the `OpenAI Settings/<file>` path, or the settings.json section). */
export interface CollectedPreset {
  readonly parsed: ParsedStPreset;
  readonly sourceFile: string;
}

/** One collected theme + the `themes/<file>` path the report names. `parsed` is the theme serde's ST shape
 *  (an orb-native file dropped into `themes/` carries an empty `unmapped`). */
export interface CollectedTheme {
  readonly parsed: ParsedStTheme;
  readonly sourceFile: string;
}

/** One ST `backgrounds/<file>` staged for the CAS. `domain/import` can't reach `domain/assets`, so the bytes
 *  ride through to the driver that stores them (the `CollectedCard` precedent). `name` is what the imported
 *  background-library entry is called; `mime` is the extension-derived claim the store magic-verifies. */
export interface CollectedBackground {
  readonly filename: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/** One ST Data Bank file a profile's attachment index names, with every scope SillyTavern attached it under. ST keeps
 *  each file already converted to text. `importHash` is the databank's own dedup key over the bytes. */
export interface CollectedDocument {
  /** The file's path in the profile (`user/files/<file>`). */
  readonly sourceFile: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly importHash: string;
  /** Listed in `extension_settings.attachments`: active in every chat. */
  readonly global: boolean;
  /** The cards `extension_settings.character_attachments` attaches it to, resolved by card filename. */
  readonly cards: readonly CollectedCard[];
  /** The transcripts whose `chat_metadata.attachments` name it. */
  readonly chats: readonly CollectedChat[];
  /** Switched off in SillyTavern (`extension_settings.disabled_attachments`). Orbweaver has no switched-off scope, so
   *  the document lands in the library with no scope. */
  readonly disabled: boolean;
}

/** One image of a character's ST gallery folder (`user/images/<folder>/`), with every card that folder belongs to. */
export interface CollectedGalleryImage {
  /** The image's path in the profile. */
  readonly sourceFile: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
  /** Never empty: a folder no card names is a recorded skip, because a gallery row with no character is never shown. */
  readonly cards: readonly [CollectedCard, ...CollectedCard[]];
}

/** One ST group definition + the transcripts its own `chats[]` list claimed, already parsed. Members are
 *  UNRESOLVED here (card filenames) — the driver resolves them to characterIds after the character wave, which
 *  is the only point at which the mapping exists. */
export interface CollectedGroup {
  readonly parsed: ParsedStGroup;
  /** The group file's path in the profile, stable across the uploads of a split folder. */
  readonly sourceFile: string;
  readonly chats: CollectedChat[];
  /** Leaves the group claimed that had no readable file under `group chats/` (recorded, never silent). */
  readonly missingChatLeaves: string[];
}

/** Every non-happy-path is recorded (never silent) so the operator can audit a wrong pairing/dropped card. */
export interface CollectResult {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  /** ST-native standalone lorebooks from `<profileDir>/worlds/*.json` (parsed; unparseable ones in `unreadableWorlds`). */
  readonly worlds: CollectedWorld[];
  /** ST CHAT-COMPLETION presets from `OpenAI Settings/` plus the live `settings.json.oai_settings` blob,
   *  already mapped to the orb-native portable file (unparseable ones in `unreadablePresets`). The three
   *  text-completion families are deliberately NOT here (owner ruling). */
  readonly presets: CollectedPreset[];
  /** ST saved UI themes from `<profileDir>/themes/*.json`, mapped to the orb palette each safely converts to
   *  (unparseable / colour-less ones in `unreadableThemes`). */
  readonly themes: CollectedTheme[];
  /** ST app backgrounds from `<profileDir>/backgrounds/*`, with their bytes (non-media entries land in
   *  `skippedBackgrounds` with a reason). */
  readonly backgrounds: CollectedBackground[];
  /** The orb `appearance` patch this profile's `power_user` section carries — the VIEWER half of what ST
   *  bundles into a theme file (`packages/server/src/primitives/serde/st-appearance/index.ts`). `{}` when the profile carries none. */
  readonly appearance: Record<string, unknown>;
  /** ST groups from `<profileDir>/groups/*.json`, each carrying the transcripts its own `chats[]` claimed
   *  out of the flat `group chats/` dir (unparseable definitions in `unreadableGroups`). */
  readonly groups: CollectedGroup[];
  /** ST library tags (`settings.tags` + `tag_map`) resolved to per-entity tag NAMES. The key is the entity's
   *  card/avatar filename (ST's `tag_map[character.avatar]`) — the driver attaches these to the matching
   *  imported character by filename. */
  readonly tagsByEntityKey: ReadonlyMap<string, readonly string[]>;
  /** ST's GLOBAL regex scripts (`extension_settings.regex` — "run on every chat"), parsed through the ONE
   *  ST card-wire schema. The driver lifts them into the library + `global_regex_scripts` (orb's identical
   *  semantic). ZERO on the real corpus — the count line is what keeps this plane loud. */
  readonly globalRegexScripts: readonly RegexScriptCard[];
  /** Each `extension_settings.regex` entry refused and each placement lost, by position, for the report. */
  readonly globalRegexScriptNotes: readonly { readonly field: string; readonly reason: string }[];
  /** ST's per-character EXTRA lorebook bindings (`world_info_settings.world_info.charLore`): card filename
   *  STEM → book NAMES. The driver attaches them role `auxiliary` after the standalone-world wave. */
  readonly extraBooksByCardStem: ReadonlyMap<string, readonly string[]>;
  /** ST Data Bank files from `user/files/` that the attachment index names (the rest are in `skippedDocuments`). */
  readonly documents: readonly CollectedDocument[];
  /** ST gallery images from `user/images/<folder>/` whose folder belongs to a card of the profile. */
  readonly galleryImages: readonly CollectedGalleryImage[];
  /** A Data Bank file or index entry that does not import, with why (recorded, never silent). */
  readonly skippedDocuments: { readonly file: string; readonly reason: string }[];
  /** A Data Bank file that imports without a scope SillyTavern gave it, with why. */
  readonly documentNotes: { readonly file: string; readonly reason: string }[];
  /** A gallery file or folder that does not import, with why (recorded, never silent). */
  readonly skippedGalleryImages: { readonly file: string; readonly reason: string }[];
  readonly orphanChatDirs: string[];
  /** The orphan dirs' TRANSCRIPTS, with their evidence (the original dir name + the parsed headers) — the
   *  mint-a-placeholder wave's input. Without it the chats would be counted, named, and thrown away. */
  readonly orphanBundles: { readonly dirName: string; readonly handle: CharacterHandle; readonly chats: CollectedChat[] }[];
  readonly unreadableCards: string[];
  /** A card file the parser refused or threw on, with why: the import goes on without it and the report names it. */
  readonly invalidCards: { file: string; reason: string }[];
  /** A `worlds/*.json` that did not parse as an ST world-info file (recorded, never silent). */
  readonly unreadableWorlds: string[];
  /** An `OpenAI Settings/*.json` that did not parse as an ST chat-completion preset (recorded, never silent). */
  readonly unreadablePresets: string[];
  /** A `themes/*.json` the converter REFUSED, with its reason (unreadable or colour-less). Recorded, never
   *  silent. */
  readonly refusedThemes: { readonly file: string; readonly reason: string }[];
  /** A `backgrounds/*` entry that is not importable media, with the reason (recorded, never silent). */
  readonly skippedBackgrounds: { readonly file: string; readonly reason: string }[];
  /** A `groups/*.json` that did not parse as an ST group definition (recorded, never silent). */
  readonly unreadableGroups: string[];
  /** A persona's avatar name that matched no file in the profile's avatar folder. The persona imports without art. */
  readonly missingPersonaAvatars: string[];
  /** Top-level profile entries the importer does not process (assets/backgrounds/presets/themes/…). */
  readonly unhandled: string[];
  /** settings.json top-level sections the importer does not process (only `power_user.personas` is read). */
  readonly unhandledSettings: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  /** A card whose file name gives a handle another card of the profile already held, and that shared handle. A chat folder of that name attaches to the first card holding it, never to this one. */
  readonly collidedCards: { readonly file: string; readonly handle: CharacterHandle }[];
  /** A chat folder paired to a card by the second-chance fuzzy match (trailing digits, `main_<Name>_spec_vN`), and the card handle it joined. */
  readonly fuzzyPairedDirs: { readonly chatDir: string; readonly handle: CharacterHandle }[];
  /** Directories whose listing breached the collector's entry CEILING: everything past `kept` was never
   *  examined, so cards/chats/worlds/groups/themes/backgrounds in the tail did not import. The cap protects
   *  the loop from a hostile staging dir; this list is what keeps the truncation from being silent. */
  readonly truncatedDirs: { readonly dir: string; readonly kept: number; readonly total: number }[];
}
