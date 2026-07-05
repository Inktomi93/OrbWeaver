// resolveRowMacros — the ONE shared atom server ASSEMBLE (`domain/chat/engine` history-macro pass) and
// client DISPLAY (`lib/message-render`) BOTH call to resolve a stored history row's `{{char}}`/`{{user}}`/
// `{{persona}}` macros (Chat-Macro-Resolution.md §2 — read that doc in full before touching this file).
//
// Composes the pure `@orb/kit/macro` engine (`processMacros`, defined in `./engine`) — this file does NOT
// reimplement the parser/evaluator; it only maps a row's STAMPS + the per-chat name PRODUCER onto a
// `ProcessMacroOptions`. Imports `./engine` directly (NOT `./index`, which re-exports this very file) —
// importing the barrel here would be an import cycle.
//
// §0 (the one rule): storage is RAW, never mutated — resolution happens at CONSUMPTION. The per-message
// STAMPS (`characterId`/`personaId`) are the source of truth for BOTH the attribution chrome and the
// macro subject — this function takes them as its one required input, never re-derives them.
// §1 (the producer): names are DERIVED from a per-chat, member-gated id→name map — never denormalized
// onto the row. `ctx.characterNamesById`/`ctx.personaNamesById` are that producer's OUTPUT (built via
// `@orb/contracts/chat`'s `buildCharacterNameMap`/`buildPersonaNameMap` over the wire arrays).

import type { CharacterId, PersonaId } from "#ids";
import { processMacros } from "./engine";

/** One character's resolved macro-subject name (names only — never the full character entity, per §1). */
export interface RowCharacterName {
  readonly name: string;
}

/** One persona's resolved macro-subject name + description (names only, per §1). `description` backs the
 *  `{{persona}}` macro (distinct from `{{user}}`, which resolves to `name`). */
export interface RowPersonaName {
  readonly name: string;
  readonly description: string;
}

/** The per-message stamps (D-100 / §0) — the SAME two ids that drive the attribution chrome also drive
 *  the macro subject. `null` ⇒ no known speaker/author for this row (narrator / legacy / system rows). */
export interface RowMacroStamps {
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
}

/** The per-chat name producer (§1) + the two fallback subjects (§2/§4) a caller supplies:
 *  `speakerCharName` — the turn's OWN `{{char}}` default (the solo character / narrator cast-join) used
 *  only when the row's own `characterId` doesn't resolve; `activePersonaName` — the speaking
 *  participant's CURRENT persona name, the null-stamp `{{user}}` fallback (§4). Both optional — a caller
 *  with no better default falls through to this atom's own literal floor. */
export interface RowMacroNameContext {
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  readonly speakerCharName?: string | undefined;
  readonly activePersonaName?: string | undefined;
}

// The ultimate `{{char}}` floor when NEITHER the producer map NOR `speakerCharName` resolves — mirrors
// the codebase's existing "unknown character" literal (`domain/export/verbs/export-chat.ts`), the same
// way `{{user}}`'s floor mirrors ST's "User" convention (`domain/chat/assembly/macros.ts`).
const UNKNOWN_CHARACTER_NAME = "Character";
// The ultimate `{{user}}`/`{{persona}}`-name floor (matches every existing consumer: `assembly/macros.ts`,
// `engine/pipeline.ts`).
const UNKNOWN_PERSONA_NAME = "User";

/**
 * Resolve `{{char}}`/`{{user}}`/`{{persona}}` in a stored history row's content against its OWN stamps
 * (§0) and the per-chat name producer (§1). Both server ASSEMBLE and client DISPLAY call this SAME
 * function so they cannot diverge (§2/§6 parity).
 *
 * - `{{char}}` → the ROW's own speaker: `characterNamesById.get(stamps.characterId)?.name`, falling back
 *   to `ctx.speakerCharName` (the turn's current speaker/cast), then the literal floor. A past line by
 *   Aria stays Aria's even when a different character speaks the CURRENT turn — the row's stamp is never
 *   overridden by the caller's "current" default except as a last resort.
 * - `{{user}}` / `{{persona}}` → the ROW's own author: `personaNamesById.get(stamps.personaId)`, whose
 *   `name` resolves `{{user}}` (falling back to `ctx.activePersonaName`, then "User") and whose
 *   `description` resolves `{{persona}}` (falling back to "" — no name is a meaningful description).
 *
 * A `content` with no `{{` is returned byte-identical (the kit engine's own no-op passthrough); a
 * `<speaker>NAME</speaker>` marker passes through untouched (the macro parser only touches `{{…}}` —
 * `speakerTagsToPlain` is the separate pass that converts those).
 */
export function resolveRowMacros(
  content: string,
  stamps: RowMacroStamps,
  ctx: RowMacroNameContext,
): string {
  const character =
    stamps.characterId === null ? undefined : ctx.characterNamesById.get(stamps.characterId);
  const persona =
    stamps.personaId === null ? undefined : ctx.personaNamesById.get(stamps.personaId);

  const char = character?.name ?? ctx.speakerCharName ?? UNKNOWN_CHARACTER_NAME;
  const user = persona?.name ?? ctx.activePersonaName ?? UNKNOWN_PERSONA_NAME;
  const personaDescription = persona?.description ?? "";

  return processMacros(content, {
    char,
    user,
    persona: personaDescription,
    scenario: "",
    env: {},
  });
}
