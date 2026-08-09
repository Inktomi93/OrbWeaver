// domain/import — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The SillyTavern
// character-card import (4c W3 slice): parse a card → flatten/validate → dedup → store the avatar → create
// with import provenance, all via the injected ops on `ImportContext` (assembled at the entry root).
//
// SCOPE: the card path (`importCharacter`, the built 4c-W3 slice) PLUS the PD-77 profile waves
// (`importChats` / `importPersonas`) — the latter close over `ctx.profile` (the db handle + minters +
// `personaByUserName` + the PD-78 ops, RULING A); they throw if `ctx.profile` is absent (a card-only wiring).

import type { ImportContext } from "./context.ts";
import type { ImportService } from "./contract/service.ts";
import { createImportCharacter } from "./verbs/import-character.ts";
import { createImportChatBundle } from "./verbs/import-chat-bundle.ts";
import { createImportChatFile } from "./verbs/import-chat-file.ts";
import { createImportChats } from "./verbs/import-chats.ts";
import { createImportGroupChats } from "./verbs/import-group-chats.ts";
import { createImportPersonas } from "./verbs/import-personas.ts";
import { createImportPresets } from "./verbs/import-presets.ts";
import { createImportThemes } from "./verbs/import-themes.ts";

export function createImportService(ctx: ImportContext): ImportService {
  // The single-chat door is a thin arm over the two format verbs; all three are wired HERE (a verb never
  // imports a sibling verb — `domain-no-cross-verb`). R6: `importChatFile` routes an ST `.jsonl` to the
  // interchange path and anything else to the orb-native bundle, which refuses by envelope.
  const importChats = createImportChats(ctx);
  const importChatBundle = createImportChatBundle(ctx);
  return {
    importCharacter: createImportCharacter(ctx),
    importChats,
    importChatBundle,
    importChatFile: createImportChatFile(ctx, importChats, importChatBundle),
    importPersonas: createImportPersonas(ctx),
    ...createImportPresets(ctx),
    ...createImportThemes(ctx),
    ...createImportGroupChats(ctx),
  };
}
