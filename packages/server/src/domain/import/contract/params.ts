// domain/import/contract/params — the card-import verb input shapes (§7.4 — one type home). Pure-type
// file (no `z.object`): the card bytes are validated structurally by the parser and then by the canonical
// `createCharacterSchema` at the flatten seam, not by a parallel import wire schema.
//
// SCOPE (this slice): the SillyTavern character-card path only. `ImportChatsInput` / `ImportPersonaInput`
// (`history/export-import-portability.md` §5, PD-77) are the chats/personas waves — they need the chat-writer + the persona normalizer,
// which are not built here.

/** One card to import: the raw bytes (a PNG with an embedded ccv3/chara chunk, or a bare V2/V3 JSON card)
 *  plus an optional source label. `filename` feeds both the fallback character name (when the card JSON
 *  carries none) and the `importedFrom` provenance stamp. */
export interface ImportCardInput {
  readonly bytes: Uint8Array;
  readonly filename?: string;
}

/** `importCharacter` input — one ST card → one canonical character (this slice). The embedded chats/
 *  lorebook (the full importCharacter — `history/export-import-portability.md` §5) are the chats wave; here it is the card alone. */
export interface ImportCharacterInput {
  readonly card: ImportCardInput;
}
