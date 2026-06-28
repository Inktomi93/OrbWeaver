// domain/import — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The SillyTavern
// character-card import (4c W3 slice): parse a card → flatten/validate → dedup → store the avatar → create
// with import provenance, all via the injected ops on `ImportContext` (assembled at the entry root).
//
// SCOPE: `importCharacter` only (the card path). `importChats` / `importPersonas` (import.md §Verbs) are the
// chats/personas waves — they need the chat-writer + persona normalizer + the `emit`/`enqueueBackfill` ops,
// none of which are part of this card slice (they are NOT wired here).

import type { ImportContext, ImportService } from "./contract/service";
import { createImportCharacter } from "./verbs/import-character";

export function createImportService(ctx: ImportContext): ImportService {
  return {
    importCharacter: createImportCharacter(ctx),
  };
}
