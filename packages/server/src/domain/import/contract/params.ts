// domain/import/contract/params — the card-import verb input shapes (§7.4 — one type home). Pure-type
// file (no `z.object`): the card bytes are validated structurally by the parser and then by the canonical
// `createCharacterSchema` at the flatten seam, not by a parallel import wire schema.
//
// SCOPE (this slice): the SillyTavern character-card path only. `ImportChatsInput` / `ImportPersonaInput`
// are the chats/personas waves — they need the chat-writer + the persona normalizer,
// which are not built here.

import type { CharacterHandle, PluginId } from "@orb/kit/ids";

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
  /** The ORIGINAL chats/ directory name (provenance + the name fallback), e.g. `"Bonnie_Cow"`. */
  readonly dirName: string;
  /** The collect-time slug for the dir — the mint's handle base + its idempotency key. */
  readonly handle: CharacterHandle;
  readonly headerNames: readonly string[];
}
