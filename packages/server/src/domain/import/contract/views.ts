// domain/import/contract/views — import-local parser/loader return contracts for the ST-profile waves.
// Pure-type file: the ST interchange is validated structurally inside the parsers (null-on-unparseable).
// Card-path types stay in contract/params.ts + contract/results.ts.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { PresetFile, StDroppedField } from "@orb/contracts/preset";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { AssetId, CharacterHandle, CharacterId, PersonaId } from "@orb/kit/ids";
import type { ParsedChat } from "#kit/serde/chat";

/** name is the key an imported chat's user_name maps against (case-insensitively) to attribute messages. */
export interface ParsedPersona {
  readonly name: string;
  readonly description: string;
  readonly avatarFile: string;
  readonly isDefault: boolean;
  readonly metadata: Record<string, unknown> | null;
}

export interface ParsedPersonas {
  readonly personas: ParsedPersona[];
  readonly defaultAvatarFile: string | null;
}

/** ST library-tag assignments resolved to per-entity tag NAMES. The key is the entity's card/avatar filename
 *  (ST's `tag_map[character.avatar]`); ST's per-profile tag ids are resolved away here so the importer attaches
 *  by name. Only entries with at least one resolvable name are present. */
export interface ParsedStTags {
  readonly byEntityKey: ReadonlyMap<string, readonly string[]>;
}

const FS_DIR_ENTRY_KINDS = ["file", "directory", "other"] as const;
type FsDirEntryKind = (typeof FS_DIR_ENTRY_KINDS)[number];

interface FsDirEntry {
  readonly name: string;
  readonly kind: FsDirEntryKind;
}

/** Injected filesystem surface (domain-no-node-fs keeps node:fs out of the domain; real impl at
 *  entry/import/run-profile-dir-import.ts — `createNodeFsImportPort`). */
export interface ImportFsPort {
  /** Must resolve to [] (never throw) for a missing/unreadable dir — a profile may carry only one subdir. */
  readonly readdir: (dir: string) => Promise<readonly FsDirEntry[]>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly stat: (path: string) => Promise<{ readonly size: number }>;
  readonly join: (...parts: string[]) => string;
}

export interface CollectedChat {
  readonly parsed: ParsedChat;
  readonly importedFrom: string;
  readonly importHash: string;
}

/** domain/import can't reach domain/assets — cardBytes/filename ride through to the driver that stores them. */
export interface CollectedCard {
  readonly handle: CharacterHandle;
  readonly cardBytes: Uint8Array;
  readonly filename: string;
  /** The card's DISPLAY name off the parsed card. Carried because the ST group importer needs a card-name →
   *  seat fallback for pre-group-era transcript lines that carry no `original_avatar` filename; the handle is
   *  NOT a substitute (it is slugified AND collision-suffixed, so it no longer matches what a line says). */
  readonly cardName: string;
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
}

/** One ST chat-completion preset mapped to the orb-native portable file, with the fields that did not travel.
 *  `file` is fed verbatim to the preset domain's own `ImportPreset` op (as UTF-8 JSON bytes) — the import
 *  domain mints no preset row and owns no collision rule. */
export interface ParsedStPreset {
  readonly name: string;
  readonly file: PresetFile;
  /** ST fields present with a meaningful value that orb has no seat for (the shared mapper's `dropped` list). */
  readonly unmapped: readonly StDroppedField[];
}

/** One parsed ST group definition. `memberFiles`/`disabledMemberFiles` are CARD FILENAMES (the collect-time
 *  key ST itself uses); `chatLeaves` are `group chats/<leaf>.jsonl` basenames without the extension. */
export interface ParsedStGroup {
  /** The group's display name (ST's `name`), or the file stem when it carries none. */
  readonly name: string;
  readonly memberFiles: readonly string[];
  /** Members the author DISABLED in ST — still seated (the room's cast is the cast) but recorded so the report
   *  can say the disabled flag itself did not travel (orb has no per-member mute). */
  readonly disabledMemberFiles: readonly string[];
  readonly chatLeaves: readonly string[];
  /** ST `generation_mode: 1` (append) ⇒ the whole cast speaks in ONE message ⇒ orb's `narrator` output. */
  readonly narratorOutput: boolean;
  /** ST `allow_self_responses` — maps 1:1 onto orb's group config field of the same meaning. */
  readonly allowSelfResponses: boolean;
}

/** The seat-resolution surface for mapping a GROUP transcript (`buildGroupChatInput`). Both speaker maps are
 *  scoped by the caller to the room's own cast, so neither can reach a character the room does not seat —
 *  which is also what the chat write op's `assertSeatedSpeakers` gate would refuse. */
export interface GroupChatInputDeps {
  readonly now: () => number;
  /** The zone SillyTavern's zone-less wall-clock dates were written in (`ImportProfileDeps.stWallClockZone`).
   *  The imported room's TITLE renders its date in this same zone, so the title says the day the ST filename
   *  spelled. Absent ⇒ the serde's `"UTC"` default. */
  readonly wallClockZone?: string;
  /** The ST group's own display name — the imported room's TITLE subject. A group transcript's header
   *  `character_name` is one member, so it cannot name the room. */
  readonly roomName: string;
  readonly personaByUserName: Map<string, PersonaId>;
  /** The room's PRIMARY seat — the voice every assistant slot that names no resolvable speaker falls back to. */
  readonly primaryCharacterId: CharacterId;
  /** The ADDITIONAL seats (the cast minus the primary), in ST's own member order. */
  readonly roster: readonly CharacterId[];
  /** Card FILENAME → seat: the identity match, keyed exactly as ST's `original_avatar` writes it. */
  readonly speakerByFile: ReadonlyMap<string, CharacterId>;
  /** LOWERCASED card display name → seat: the fallback for a pre-group-era line with no `original_avatar`. */
  readonly speakerByName: ReadonlyMap<string, CharacterId>;
  readonly metadata: ChatMetadata;
}

/** One ST preset already mapped to the orb-native portable file, with the ST fields that found no orb seat.
 *  `sourceFile` is what the report names (the `OpenAI Settings/<file>` path, or the settings.json section). */
export interface CollectedPreset {
  readonly parsed: ParsedStPreset;
  readonly sourceFile: string;
}

/** One ST group definition + the transcripts its own `chats[]` list claimed, already parsed. Members are
 *  UNRESOLVED here (card filenames) — the driver resolves them to characterIds after the character wave, which
 *  is the only point at which the mapping exists. `sourceFile` is the `groups/<id>.json` name for the report. */
export interface CollectedGroup {
  readonly parsed: ParsedStGroup;
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
   *  text-completion families are deliberately NOT here (owner ruling 2026-08-08). */
  readonly presets: CollectedPreset[];
  /** ST groups from `<profileDir>/groups/*.json`, each carrying the transcripts its own `chats[]` claimed
   *  out of the flat `group chats/` dir (unparseable definitions in `unreadableGroups`). */
  readonly groups: CollectedGroup[];
  /** ST library tags (`settings.tags` + `tag_map`) resolved to per-entity tag NAMES. The key is the entity's
   *  card/avatar filename (ST's `tag_map[character.avatar]`) — the driver attaches these to the matching
   *  imported character by filename. */
  readonly tagsByEntityKey: ReadonlyMap<string, readonly string[]>;
  readonly orphanChatDirs: string[];
  readonly unreadableCards: string[];
  /** A `worlds/*.json` that did not parse as an ST world-info file (recorded, never silent). */
  readonly unreadableWorlds: string[];
  /** An `OpenAI Settings/*.json` that did not parse as an ST chat-completion preset (recorded, never silent). */
  readonly unreadablePresets: string[];
  /** A `groups/*.json` that did not parse as an ST group definition (recorded, never silent). */
  readonly unreadableGroups: string[];
  /** Top-level profile entries the importer does not process (assets/backgrounds/presets/themes/…). */
  readonly unhandled: string[];
  /** settings.json top-level sections the importer does not process (only `power_user.personas` is read). */
  readonly unhandledSettings: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  /** Their chats attach to the first card holding the base handle. */
  readonly collidedCards: { readonly file: string; readonly handle: CharacterHandle }[];
  /** Matched by the second-chance fuzzy pairing (trailing-digit / main_<Name>_spec_vN). */
  readonly fuzzyPairedDirs: { readonly chatDir: string; readonly handle: CharacterHandle }[];
}

export interface ImportPersonaInput {
  readonly parsed: ParsedPersona;
  readonly avatarAssetId?: AssetId | null;
}

/** One card the bulk import SKIPPED (per-card isolation) — the source file + the concise refusal reason. */
export interface ImportSkippedCard {
  readonly file: string;
  readonly reason: string;
}

/** One imported ST preset's honest lossiness note: which orb preset it became and which ST fields did not
 *  travel (each with the reason). Present even when `fields` is empty — the operator learns the preset landed
 *  losslessly rather than being told nothing. */
export interface ImportPresetNote {
  readonly name: string;
  readonly sourceFile: string;
  readonly fields: readonly { readonly field: string; readonly reason: string }[];
}

/** One ST group the importer could NOT turn into a room, with the reason (no member resolved, the chat write
 *  refused, …). A skipped group never aborts the wave — the next group still imports. */
export interface ImportSkippedGroup {
  readonly group: string;
  readonly reason: string;
}

/** One group MEMBER that did not make it into the room: the card is neither in this import set nor already in
 *  the library. The group still imports with the members that DID resolve (per-member isolation). */
export interface ImportSkippedGroupMember {
  readonly group: string;
  readonly member: string;
  readonly reason: string;
}

/** The whole-folder import's accounting of what landed and what did NOT — the source of the written report.
 *  Every "not imported" plane is here so a self-host owner can see exactly what a whole-profile import left
 *  behind (skipped cards, unreadable/oversized files, and the ST planes the importer does not process). */
export interface ImportReport {
  readonly scanned: number;
  readonly changed: number;
  /** Cards skipped by per-card isolation (validation defect repair could not fix), with the reason each. */
  readonly skippedCards: readonly ImportSkippedCard[];
  readonly unreadableCards: readonly string[];
  readonly unreadableWorlds: readonly string[];
  readonly unreadablePresets: readonly string[];
  readonly unreadableGroups: readonly string[];
  /** Presets ACCEPTED by this run (created OR merged in place onto a same-named preset). */
  readonly presetsImported: number;
  /** The net-new subset of {@link presetsImported} — the only part `changed` counts. */
  readonly presetsCreated: number;
  /** A preset file that parsed but the preset domain refused, with its refusal (per-preset isolation). */
  readonly skippedPresets: readonly ImportSkippedCard[];
  /** Per-imported-preset: which ST fields had no orb seat. The honest half of "presets are imported now". */
  readonly presetNotes: readonly ImportPresetNote[];
  /** Group rooms created, and the group transcripts written into them. */
  readonly groupsImported: number;
  readonly groupChatsImported: number;
  readonly skippedGroups: readonly ImportSkippedGroup[];
  readonly skippedGroupMembers: readonly ImportSkippedGroupMember[];
  /** A transcript leaf a group's own `chats[]` claimed with no readable file under `group chats/`. */
  readonly missingGroupChats: readonly string[];
  readonly skippedChats: readonly string[];
  readonly orphanChatDirs: readonly string[];
  readonly skippedCharacters: readonly string[];
  /** Top-level ST profile entries the importer does not process (assets/backgrounds/presets/themes/…). */
  readonly unhandled: readonly string[];
  /** settings.json sections the importer does not process (only personas are read). */
  readonly unhandledSettings: readonly string[];
}

/** ONE bundle-shaped chat file: `filename` is `<character-handle>/<leaf>.jsonl` (the directory IS the
 *  re-link key — chat ids are not preserved across a box). */
export interface ImportChatFileInput {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** ST chat headers don't reliably carry the character name, so there's no safe auto-match. */
export interface ImportChatsInput {
  readonly characterId: CharacterId;
  readonly chats: CollectedChat[];
}

/** The ST group wave's input. Both maps are keyed by CARD FILENAME — the collect-time key ST itself uses for a
 *  group's `members[]` and for each transcript line's `original_avatar`, and the only key that survives handle
 *  collision-suffixing. The driver builds them after the character wave (the only point the mapping exists):
 *  every card this run imported, plus any member card already in the library. */
export interface ImportGroupsInput {
  readonly groups: readonly CollectedGroup[];
  readonly characterIdByCardFilename: ReadonlyMap<string, CharacterId>;
  /** Card filename → the card's display NAME, for the roster-scoped name fallback on older exports. */
  readonly characterNameByCardFilename: ReadonlyMap<string, string>;
}
