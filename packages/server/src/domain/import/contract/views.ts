// domain/import/contract/views — import-local parser/loader return contracts for the ST-profile waves.
// Pure-type file: the ST interchange is validated structurally inside the parsers (null-on-unparseable).
// Card-path types stay in contract/params.ts + contract/results.ts.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { PresetFile, StDroppedField } from "@orb/contracts/preset";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { ThemeOverride } from "@orb/contracts/theme";
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
  /** Must resolve to [] (never throw) for a MISSING dir — a profile may carry only one subdir. An
   *  INFRASTRUCTURE fault on a dir that exists (EACCES/EIO/ELOOP/…) must REJECT: folding it into the same
   *  empty listing reads as "that plane is empty" and imports a truncated profile while reporting success
   *  (#1469). The collector wraps the rejection as `ImportInfraFailureError` naming the dir + `readdir`. */
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
}

/** One ST chat-completion preset mapped to the orb-native portable file, with the fields that did not travel.
 *  `file` is fed verbatim to the preset domain's own `ImportPreset` op (as UTF-8 JSON bytes) — the import
 *  domain mints no preset row and owns no collision rule. */
export interface ParsedStPreset {
  readonly name: string;
  readonly file: PresetFile;
  /** ST fields present with a meaningful value that orb has no seat for (the shared mapper's `dropped` list). */
  readonly unmapped: readonly StDroppedField[];
  /** The preset's OWN regex scripts (ST presetManager extension field `extensions.regex_scripts`) — lifted
   *  into the library + `preset_regex_scripts` AFTER the preset row exists (the verb owns the sequencing).
   *  Not part of the orb preset FILE: scripts are owner-library rows, never embedded config (D121-E). */
  readonly regexScripts: readonly RegexScriptCard[];
}

/** One parsed ST group definition. `memberFiles`/`disabledMemberFiles` are CARD FILENAMES (the collect-time
 *  key ST itself uses); `chatLeaves` are `group chats/<leaf>.jsonl` basenames without the extension. */
export interface ParsedStGroup {
  /** The group's display name (ST's `name`), or the file stem when it carries none. */
  readonly name: string;
  readonly memberFiles: readonly string[];
  /** Members the author DISABLED in ST. Still SEATED — the room's cast is the cast — and now seated MUTED:
   *  the flag TRAVELS onto orb's own per-seat mute (`chat_participants.disabled`, `seatKnobsSchema`) through
   *  the bulk-import wire's `seatKnobs` channel (#1687). The ruling survives with its input changed: the old
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
  readonly characterIds: readonly CharacterId[];
  /** The seats ST had DISABLED, which the room seats MUTED (#1687) — a subset of the primary + `characterIds`, so
   *  the write op's seat gate can never refuse one. Empty ⇒ every seat arrives at the column defaults. */
  readonly mutedSeats: readonly CharacterId[];
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

/** One ST `themes/*.json` mapped to an orb theme: the QUALIFIED name (`Azure (SillyTavern)` — the theme import
 *  op merges on (ownerId, name), so an unqualified name could overwrite the owner's own theme), the clamped
 *  token set, and the ST keys that carry a meaningful value but produce no orb theme token. */
export interface ParsedStTheme {
  readonly name: string;
  readonly override: ThemeOverride;
  /** ST theme keys present with a meaningful value that orb's THEME model has no seat for — several are
   *  homed on the viewer's `appearance` namespace instead and import from `power_user` (see the reasons). */
  readonly unmapped: readonly StDroppedField[];
}

/** An sRGB colour with straight (non-premultiplied) alpha; channels 0–255, alpha 0–1. The ST theme plane's
 *  intermediate: ST writes `rgba()` tints, `substrate/color.ts` flattens them here, and only the flattened
 *  result becomes an OKLCH token. Homed in the contract because two substrate files share it. */
export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** One ST theme file's parse: the converted palette, or the REASON it could not convert. A refusal always
 *  carries its reason — "unreadable JSON" or "no base surface colour". The report prints it verbatim. */
export type StThemeParse = { readonly ok: true; readonly parsed: ParsedStTheme } | { readonly ok: false; readonly reason: string };

/** One collected ST theme + the `themes/<file>` path the report names. */
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
   *  text-completion families are deliberately NOT here (owner ruling). */
  readonly presets: CollectedPreset[];
  /** ST saved UI themes from `<profileDir>/themes/*.json`, mapped to the orb palette each safely converts to
   *  (unparseable / colour-less ones in `unreadableThemes`). */
  readonly themes: CollectedTheme[];
  /** ST app backgrounds from `<profileDir>/backgrounds/*`, with their bytes (non-media entries land in
   *  `skippedBackgrounds` with a reason). */
  readonly backgrounds: CollectedBackground[];
  /** The orb `appearance` patch this profile's `power_user` section carries — the VIEWER half of what ST
   *  bundles into a theme file (`substrate/appearance.ts`). `{}` when the profile carries none. */
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
  /** `extension_settings.regex` entries the schema refused — counted for the report, never silent. */
  readonly malformedGlobalRegexScripts: number;
  /** ST's per-character EXTRA lorebook bindings (`world_info_settings.world_info.charLore`): card filename
   *  STEM → book NAMES. The driver attaches them role `auxiliary` after the standalone-world wave. */
  readonly extraBooksByCardStem: ReadonlyMap<string, readonly string[]>;
  /** Files under `user/files/` — ST's Data Bank plane (orb counterpart: `domain/databank`). COUNTED so the
   *  report names the plane; the write wave is a named follow-up (the plane is empty on the real corpus). */
  readonly databankFileCount: number;
  /** Files under `user/images/` (incl. per-character gallery subdirs — orb counterpart: the assets gallery
   *  verbs). COUNTED for the report; same follow-up posture as `databankFileCount`. */
  readonly galleryImageCount: number;
  readonly orphanChatDirs: string[];
  /** The orphan dirs' TRANSCRIPTS, with their evidence (the original dir name + the parsed headers) — the
   *  mint-a-placeholder wave's input. Before 2026-08-15 the chats were counted, named, and thrown away. */
  readonly orphanBundles: { readonly dirName: string; readonly handle: CharacterHandle; readonly chats: CollectedChat[] }[];
  readonly unreadableCards: string[];
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
  /** Directories whose listing breached the collector's entry CEILING: everything past `kept` was never
   *  examined, so cards/chats/worlds/groups/themes/backgrounds in the tail did not import. The cap protects
   *  the loop from a hostile staging dir; this list is what keeps the truncation from being silent. */
  readonly truncatedDirs: { readonly dir: string; readonly kept: number; readonly total: number }[];
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

/** One ST library tag that did NOT attach to the character it belongs to. Per-tag isolation is preserved (the
 *  character imported), but the attach's `allSettled` outcome used to be discarded, so a rejected tag left the
 *  card with fewer labels than the profile carried and the report said nothing. `character` is the CARD
 *  FILENAME — the same key `tag_map` uses. */
export interface ImportSkippedCardTag {
  readonly character: string;
  readonly tag: string;
  readonly reason: string;
}

/** What a DRY RUN would attempt, per wave. A dry run performs zero writes, so every write-wave count in the
 *  report is zero BY CONSTRUCTION — which reads exactly like a profile that carries none of those planes.
 *  This census is the collect-time arithmetic that tells the two apart (#1469). Null on a real run. */
export interface ImportDryRunCensus {
  readonly characters: number;
  readonly personas: number;
  readonly chats: number;
  readonly worlds: number;
  readonly presets: number;
  readonly themes: number;
  readonly backgrounds: number;
  readonly groups: number;
  readonly groupChats: number;
  readonly orphanChatDirs: number;
}

/** One imported ST preset's honest lossiness note: which orb preset it became and which ST fields did not
 *  travel (each with the reason). Present even when `fields` is empty — the operator learns the preset landed
 *  losslessly rather than being told nothing. */
export interface ImportPresetNote {
  readonly name: string;
  readonly sourceFile: string;
  readonly fields: readonly { readonly field: string; readonly reason: string }[];
  /** The preset's carried regex scripts, LIFTED into the library + attached to this preset (fresh rows). */
  readonly scriptsLifted: number;
  /** Carried scripts that content-matched an existing library row and were attached rather than cloned. */
  readonly scriptsReused: number;
}

/** One imported ST theme's honest lossiness note — the same shape (and the same "present even when empty"
 *  rule) as {@link ImportPresetNote}: the operator must be able to tell "this palette landed whole" apart
 *  from "this palette was never looked at". */
export interface ImportThemeNote {
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

/** One imported chat whose ST chat-bound persona pick (`chat_metadata.pinnedPersona`) named a persona this
 *  install does not have. The chat still imports — its anchor falls back to the header `user_name`, or to
 *  none — and the pick is recorded rather than near-matched onto a similar name. `chat` is the ST filename
 *  (the `importedFrom` provenance key), `persona` the name the pin asked for. */
export interface ImportUnresolvedPinnedPersona {
  readonly chat: string;
  readonly persona: string;
}

/** One group's resolved seating, computed ONCE in the wave loop and handed to the importer: the cast in ST's
 *  own member order (the first is the room's primary) plus the display-name fallback map with the ambiguous
 *  names already withheld ({@link ImportAmbiguousSpeakerName}). */
export interface GroupSeats {
  readonly seated: readonly { readonly file: string; readonly characterId: CharacterId }[];
  readonly speakerByName: ReadonlyMap<string, CharacterId>;
  /** The seats ST had DISABLED (#1687) — carried alongside the cast so the room is seated MUTED in the same
   *  pass that seats it. A subset of `seated`, by construction. */
  readonly mutedSeats: readonly CharacterId[];
}

/** A display NAME two or more of a room's seated cards share, so a transcript line that names only that name
 *  (a pre-`original_avatar` export) cannot say WHICH seat spoke. The line falls through to the room's primary
 *  and the ambiguity is reported — never resolved by pick-the-last, which silently misattributed the turn. */
export interface ImportAmbiguousSpeakerName {
  readonly group: string;
  readonly name: string;
  /** How many seated cards carry this display name (≥2 by construction). */
  readonly seats: number;
}

/** One member ST had DISABLED in its group file, and which the imported room SEATS MUTED (#1687). The member
 *  is seated (the room's cast is the cast) with orb's own per-seat mute set, so this record is no longer a
 *  loss report — it is the accounting of which seats arrived quiet, which an operator staring at a silent
 *  character otherwise has to guess at. Only RESOLVED members appear: a disabled member whose card never
 *  resolved is already reported as a skipped member, and claiming it was seated would be a lie. */
export interface ImportSeatedDisabledMember {
  readonly group: string;
  /** The CARD FILENAME ST listed, the same key `memberFiles` uses. */
  readonly member: string;
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
  /** True when the run WROTE NOTHING (`dryRun`). Every write-wave count below is then zero by construction,
   *  which is why {@link dryRunWouldImport} carries what the run WOULD have attempted. */
  readonly dryRun: boolean;
  /** The dry run's per-wave census, or null on a real run. */
  readonly dryRunWouldImport: ImportDryRunCensus | null;
  /** ST library tags that did not attach to their imported card (the attach is per-tag isolated). */
  readonly skippedCardTags: readonly ImportSkippedCardTag[];
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
  /** ST themes ACCEPTED by this run (created OR merged in place onto a same-named imported theme). */
  readonly themesImported: number;
  /** The net-new subset of {@link themesImported} — the only part `changed` counts. */
  readonly themesCreated: number;
  /** A `themes/*.json` that did NOT become an orb theme, with the reason — both the converter's refusals
   *  (unreadable / colour-less) and the settings domain's (per-theme isolation). */
  readonly skippedThemes: readonly ImportSkippedCard[];
  /** Per-imported-theme: which ST keys had no orb THEME seat, INCLUDING any individual colour dropped as
   *  unsafe with its measured contrast ratio. The honest half of "themes convert now". */
  readonly themeNotes: readonly ImportThemeNote[];
  /** ST background images CAS-stored and appended to `appearance.backgroundLibrary` (a re-run adds none —
   *  the CAS is content-addressed and the append dedups by assetId). */
  readonly backgroundsImported: number;
  /** A `backgrounds/*` entry that did not import, with the reason (non-media, magic mismatch, over-cap). */
  readonly skippedBackgrounds: readonly ImportSkippedCard[];
  /** The `appearance` keys the ST `power_user` section actually claimed on this install (empty when the
   *  profile carried none, or when the user had already chosen those keys — first-writer-wins). */
  readonly appearanceKeysApplied: readonly string[];
  /** Group rooms created, and the group transcripts written into them. */
  readonly groupsImported: number;
  readonly groupChatsImported: number;
  readonly skippedGroups: readonly ImportSkippedGroup[];
  readonly skippedGroupMembers: readonly ImportSkippedGroupMember[];
  /** Room display names two seated cards share — the name-only speaker fallback is withheld there, so those
   *  lines fall to the room's primary instead of being assigned to whichever seat happened to be last. */
  readonly ambiguousSpeakerNames: readonly ImportAmbiguousSpeakerName[];
  /** Members ST had DISABLED that the imported room seats MUTED — the flag travelled (#1687). */
  readonly seatedDisabledMembers: readonly ImportSeatedDisabledMember[];
  /** A transcript leaf a group's own `chats[]` claimed with no readable file under `group chats/`. */
  readonly missingGroupChats: readonly string[];
  readonly skippedChats: readonly string[];
  readonly orphanChatDirs: readonly string[];
  readonly skippedCharacters: readonly string[];
  /** Top-level ST profile entries the importer does not process (assets/backgrounds/presets/themes/…). */
  readonly unhandled: readonly string[];
  /** settings.json sections the importer does not process (only personas are read). */
  readonly unhandledSettings: readonly string[];
  /** Directories the collector TRUNCATED at its entry ceiling — everything past `kept` was never examined,
   *  so the operator is told exactly which plane lost its tail instead of reading a normal-looking report
   *  over a partial import (#1469). */
  readonly truncatedDirs: readonly { readonly dir: string; readonly kept: number; readonly total: number }[];
  /** Chats whose ST chat-bound persona pick named a persona this install does not have (solo + group waves
   *  merged). The chats imported; only the pin did not travel. */
  readonly unresolvedPinnedPersonas: readonly ImportUnresolvedPinnedPersona[];
  /** ALREADY-IMPORTED rooms this run back-filled persona attribution onto (solo + group + orphan waves
   *  merged). The importer is idempotent by `importHash`, so a corpus imported before the mapper could
   *  resolve its persona can only be repaired by re-running the import over the same snapshot — that re-run
   *  reports its repairs here. NOT part of `changed`: a heal writes no new canon. Zero on every fresh
   *  import, and zero on a re-run of an already-attributed corpus. */
  readonly chatsPersonaHealed: number;
  // ── the regex + world-link + user-plane accounting (the silent-gap sweep, 2026-08-15): every one of these
  // planes used to vanish without a report line — the counts render even at zero so "read and empty" is
  // distinguishable from "never looked at". ──
  /** GLOBAL regex scripts found in `extension_settings.regex` (both write-time outcomes below are 0 on a
   *  dryRun and when the lift op is unwired — `globalRegexSkippedReason` then says why). */
  readonly globalRegexScriptsFound: number;
  readonly globalRegexScriptsLifted: number;
  readonly globalRegexScriptsReused: number;
  /** `extension_settings.regex` entries the ST card-wire schema refused. */
  readonly malformedGlobalRegexScripts: number;
  /** Why found global scripts did not lift (unwired op / dryRun), or null when they lifted (or none exist). */
  readonly globalRegexSkippedReason: string | null;
  /** The CARD lift halves (D121-E — `data.extensions.regex_scripts`), summed across the bundle wave. */
  readonly cardRegexScriptsLifted: number;
  readonly cardRegexScriptsReused: number;
  /** Card `extensions.world` + charLore book NAME-LINKS attached to imported characters. */
  readonly worldLinksAttached: number;
  /** Name-links that resolved NO owned book — `character` is the card's display name, `book` the dangling
   *  name (never near-matched; the §5.7 unresolved-pin posture). */
  readonly worldLinksMissing: readonly { readonly character: string; readonly book: string }[];
  /** Why real name-links did not attach (unwired op / dryRun), or null when they attached (or none exist). */
  readonly worldLinksSkippedReason: string | null;
  /** Files found under the ST Data Bank plane (`user/files/`) — named follow-up when non-zero. */
  readonly databankFileCount: number;
  /** Files found under the ST character-gallery plane (`user/images/`) — named follow-up when non-zero. */
  readonly galleryImageCount: number;
  /** Orphan chat dirs IMPORTED via a minted placeholder character (name from the dir's own evidence; the
   *  mint is tagged `orphan import` so the owner can find every husk). Empty on a dryRun. */
  readonly orphanImports: readonly { readonly dir: string; readonly characterName: string; readonly created: boolean; readonly chatsImported: number }[];
  /** Orphan dirs whose mint or chat write FAILED, with the reason (per-orphan isolation — never silent). */
  readonly orphanSkipped: readonly { readonly dir: string; readonly reason: string }[];
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
