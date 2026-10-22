// domain/import/contract/results — the verb result shapes.

import type { CardLorebookRestoreResult } from "@orb/contracts/import";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";

export interface ImportedCharacterRef {
  readonly characterId: CharacterId;
}

/** The orphan-dir placeholder mint's outcome. `created:false` ⇒ a prior run's mint (the synthetic
 *  dir-keyed importHash matched) — the chats still import against it, idempotently. `name` is what the
 *  evidence yielded (the majority non-sentinel header name, else the humanized dir name) — the report
 *  prints it so the owner can find every husk and flesh it out. */
export interface ImportOrphanCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly name: string;
}

/** `created:false` means an existing character already carried this importHash, so no new CHARACTER was
 *  written — NOT that nothing was (#1470). That re-import RECONCILES the card's overlay planes against the
 *  existing character (a run that threw after the create leaves them missing, and the dedup key is that same
 *  row), so the counts below report what the reconcile actually landed and are NOT zero by definition on the
 *  dedup arm.
 *  `attachedBooksLinked`/`attachedBooksSkipped` report the carried book-reference re-link — skipped
 *  counts references whose id had no book the importer owns on this install (absent/foreign), reported so a
 *  cross-install import surfaces the books that didn't travel. Both 0 for a card carrying no references. */
export interface ImportCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
  readonly attachedBooksLinked: number;
  readonly attachedBooksSkipped: number;
  /** The card's regex-script lift (D121-E), the `attachedBooks*` precedent: fresh library rows minted from
   *  the by-value payload / candidates attached to existing rows instead of cloned. Both 0 for a script-less
   *  card and for an unwired lift op; on a dedup match they report the reconcile's lift, which content-dedups
   *  against the library and so reads as `reused` once the scripts have landed. */
  readonly regexScriptsLifted: number;
  readonly regexScriptsReused: number;
  /** The card planes this import deliberately did NOT assert, each as one operator-facing line (the
   *  {@link ImportChatFileOutcome} `skippedOverlays` model, #1598). Present even when EMPTY: "the card landed
   *  whole" has to be legible apart from "nobody looked". Today's one member is the embedded lorebook a
   *  re-upload KEEPS instead of replacing, because the character already holds a primary book the owner may
   *  have edited since (the restore verb is how they ask for the card's version back). */
  readonly skippedOverlays: readonly string[];
}

/** The RESTORE door's outcome (#1598). Never throws for a bad/unmatched card — the refusal is a value the
 *  calling door renders, exactly like {@link ImportChatFileOutcome}. `replaced:false` means the character
 *  held no primary book at all and the card's book was landed fresh (a restore onto a character whose book
 *  was deleted is still a restore). */
export type RestoreCharacterBookResult = CardLorebookRestoreResult;

/** `memoryChatIds`: the real conversations this run wrote — the scope the import's memory-build offer covers.
 *  `unresolvedPinnedPersonas` is the honest half of §5.7: the chats whose ST chat-bound persona pick named
 *  nothing here. Always present (empty ⇒ every pick travelled), never a silent drop. */
export interface ImportChatsResult {
  readonly characterId: CharacterId;
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly memoryChatIds: readonly ChatId[];
  readonly unresolvedPinnedPersonas: readonly ImportUnresolvedPinnedPersona[];
  /** Already-imported rooms this run back-filled persona attribution onto (the dedup-skip arm's HEAL — the
   *  write op's `chatsPersonaHealed`). NOT counted as `changed`: healing an existing room writes no new canon,
   *  exactly as a merged preset or a replaced world book is not new canon. */
  readonly chatsPersonaHealed: number;
}

/** The ST preset wave's tally. The two counts are deliberately DISTINCT: `presetsImported` is every preset the
 *  preset domain ACCEPTED (created OR merged in place), which is what the operator wants to read; only
 *  `presetsCreated` is NET-NEW canon, which is what the run's `changed` may count — a re-run of a whole-profile
 *  import merges every preset, and counting those as new canon would make an idempotent no-op report as work.
 *  (The world-book wave draws the same line with its `replaced` flag.) `notes` carries the per-preset
 *  unmapped-field list, emitted even when empty so "landed whole" is legible. */
export interface ImportPresetsResult {
  readonly presetsImported: number;
  readonly presetsCreated: number;
  readonly skippedPresets: readonly ImportSkippedCard[];
  readonly notes: readonly ImportPresetNote[];
}

/** The ST theme wave's tally — the preset wave's shape exactly. `themesImported` is every theme the settings
 *  domain ACCEPTED (created OR merged in place onto a same-named import); only `themesCreated` is NET-NEW
 *  canon, so a re-run of a whole-profile import reports zero new work. `notes` carries the per-theme
 *  unmapped-key list, emitted even when empty so "landed whole" is legible. */
export interface ImportThemesResult {
  readonly themesImported: number;
  readonly themesCreated: number;
  readonly skippedThemes: readonly ImportSkippedCard[];
  readonly notes: readonly ImportThemeNote[];
}

/** The ST group wave's tally. `groupsImported` counts rooms that actually WROTE a transcript — a second
 *  byte-identical run dedups every transcript by importHash and therefore reports zero, the same "net-new
 *  canon" line the preset wave draws. `memoryChatIds` is every real conversation the wave wrote, for the
 *  driver's report. */
export interface ImportGroupsResult {
  readonly groupsImported: number;
  readonly groupChatsImported: number;
  readonly skippedGroups: readonly ImportSkippedGroup[];
  readonly skippedMembers: readonly ImportSkippedGroupMember[];
  readonly memoryChatIds: readonly ChatId[];
  /** Same §5.7 record as the solo wave's — a group transcript can carry a chat-bound pick too, and a
   *  wave-local report field is what keeps it from being the one arm that drops it silently. */
  readonly unresolvedPinnedPersonas: readonly ImportUnresolvedPinnedPersona[];
  /** The group wave's half of the dedup-skip HEAL count (`ImportChatsResult.chatsPersonaHealed`'s twin — an
   *  already-imported group room gains its persona attribution the same way a solo one does). */
  readonly chatsPersonaHealed: number;
  /** Display names two seated cards share: the name-only attribution fallback is withheld for them and the
   *  slots fall to the room's primary, reported rather than guessed (#1469 item 5). */
  readonly ambiguousSpeakerNames: readonly ImportAmbiguousSpeakerName[];
  /** Members ST had disabled that the room seats MUTED — the flag TRAVELLED (#1687; #1469 item 4 shipped the
   *  reporting half first, when the bulk-import wire still had no knob channel). */
  readonly seatedDisabledMembers: readonly ImportSeatedDisabledMember[];
}

export interface ImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly personasMerged: number;
  readonly mergedKeys: readonly string[];
  readonly defaultPersonaId: PersonaId | null;
}

/** `importChatFile` — never throws for a malformed/unmatched file; the refusal carries the operator-facing
 *  reason the calling door renders. `created:false` ⇒ the transcript deduped against an existing chat.
 *
 *  `skippedOverlays` is the SUCCESS arm's honest half (#1469 item 6): an orb-native bundle carries planes the
 *  room's canon write does not own — the tag overlay and the rpg campaign — and each rides an OPTIONAL
 *  injected op. A composition without that op used to drop the plane with no record at all, so a discarded
 *  campaign answered a bare `{ok:true, created:true}`. Each dropped plane is now one operator-facing line
 *  here. Present even when EMPTY (the {@link ImportPresetNote} rule): "restored whole" must be legible apart
 *  from "never looked at". The chat itself always still imports — an overlay never un-writes canon. */
export type ImportChatFileOutcome =
  | { readonly ok: true; readonly created: boolean; readonly skippedOverlays: readonly string[]; readonly memoryChatIds: readonly ChatId[] }
  | { readonly ok: false; readonly error: string };

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
  /** The file's own name when the landed name took a collision suffix (a different same-named preset exists). */
  readonly renamedFrom: string | null;
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
  /** The file's own name when the landed name took a collision suffix (a different same-named theme exists). */
  readonly renamedFrom: string | null;
  readonly sourceFile: string;
  readonly fields: readonly { readonly field: string; readonly reason: string }[];
}

/** One standalone world book the run landed: where it landed, and the SillyTavern activation fields its
 *  entries keep stored but inert (owner ruling: kept untouched, shown as not active yet). */
export interface ImportWorldNote {
  readonly name: string;
  /** The file's own name when the landed name took a collision suffix (a different same-named book exists). */
  readonly renamedFrom: string | null;
  readonly created: boolean;
  readonly entries: number;
  /** Each inert activation field present with a non-default value, with how many entries carry it. */
  readonly inertFields: readonly { readonly field: string; readonly entries: number }[];
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
  /** Per standalone world book the run landed: where it landed and the inert activation fields it keeps. */
  readonly worldNotes: readonly ImportWorldNote[];
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
  /** Folded names of the personas this run linked to an owned persona of the same name (the merge choice).
   *  Scanned, not changed. */
  readonly personasMergedKeys: readonly string[];
  /** Every real conversation the solo, group and orphan waves WROTE — the scope of the client's memory-build
   *  offer. Empty on a dry run. Not rendered into the written report. */
  readonly memoryChatIds: readonly ChatId[];
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
