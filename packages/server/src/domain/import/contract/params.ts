// Import operation and mapping inputs. Interchange bytes are validated by their parsers and the owning
// domains' canonical write schemas, never a parallel import wire schema.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { AssetId, CharacterHandle, CharacterId, PersonaId, PluginId } from "@orb/kit/ids";
import type { CollectedChat, CollectedGroup, ParsedPersona } from "./collection.ts";

/** One card to import: the raw bytes (a PNG with an embedded ccv3/chara chunk, or a bare V2/V3 JSON card)
 *  plus an optional source label. `filename` feeds both the fallback character name (when the card JSON
 *  carries none) and the `importedFrom` provenance stamp.
 *
 *  `pluginId` is the OTHER provenance channel (#1702): a plugin's `character.ingest`/`ingestAsset` funnel
 *  carries no filename (its wire shape is `{card: Record<string,unknown>}` / `{assetId}`, never a name), so
 *  without this the row's `importedFrom` stayed null and `characterProvenanceOf` misread every hub-ingested
 *  card as `authored`. Mutually exclusive with `filename` in practice (only the plugin funnel sets this) —
 *  the verb still prefers `filename` were both ever present, matching the fallback-name precedent. */
export interface ImportCardInput {
  readonly bytes: Uint8Array;
  readonly filename?: string;
  readonly pluginId?: PluginId;
}

/** `importCharacter` input — one ST card → one canonical character (this slice). The embedded chats/
 *  lorebook (the full importCharacter) are the chats wave; here it is the card alone. */
export interface ImportCharacterInput {
  readonly card: ImportCardInput;
}

/** `restoreCharacterBook` input (#1598) — the SAME card bytes the owner imported from, re-uploaded on
 *  purpose. The card identifies its own character (the `(ownerId, importHash)` dedup oracle), so there is no
 *  caller-supplied character id to mis-aim: a restore can only ever land on the character those exact bytes
 *  imported as. */
export interface RestoreCharacterBookInput {
  readonly card: ImportCardInput;
}

/** `importOrphanCharacter` input — an ORPHAN chats/ directory (transcripts whose card PNG is absent from
 *  the profile) gets a MINIMAL placeholder character minted from the directory's own evidence, so its
 *  chats can import instead of being skipped (7 real dirs on the 2026-08-15 corpus run). `headerNames` are
 *  the transcripts' parsed `character_name` headers — the only name signal beyond the dir name itself. */
export interface ImportOrphanCharacterInput {
  /** The ORIGINAL chats/ directory name (provenance + the name fallback), e.g. `"Clover_Owl"`. */
  readonly dirName: string;
  /** The collect-time slug for the dir — the mint's handle base + its idempotency key. */
  readonly handle: CharacterHandle;
  readonly headerNames: readonly string[];
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

export interface ImportPersonaInput {
  readonly parsed: ParsedPersona;
  readonly avatarAssetId?: AssetId | null;
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
