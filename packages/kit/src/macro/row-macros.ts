// resolveRowMacros — the ONE shared atom server ASSEMBLE and client DISPLAY both call to resolve a
// stored history row's `{{char}}`/`{{user}}`/`{{persona}}` macros.
//
// Composes the pure `@orb/kit/macro` engine (`processMacros`, defined in `./engine`) — this file does NOT
// reimplement the parser/evaluator; it only maps a row's STAMPS + the per-chat name PRODUCER onto a
// `ProcessMacroOptions`. Imports `./engine`/`./registry` directly (NOT `./index`, which re-exports this
// very file) — importing the barrel here would be an import cycle.
//
// It runs a NAMES-ONLY registry, not the full default one: history rows resolve ONLY the stable identity
// macros ({{char}}/{{user}}/{{persona}} + aliases) and re-emit every VOLATILE macro verbatim. Re-running
// {{time}}/{{roll}}/{{random}} against a live clock/PRNG on stored content would churn the row's bytes
// every turn.
//
// Storage is RAW, never mutated — resolution happens at CONSUMPTION. The per-message STAMPS
// (`characterId`/`personaId`) are the source of truth for BOTH the attribution chrome and the macro
// subject — this function takes them as its one required input, never re-derives them. Names are
// DERIVED from a per-chat, member-gated id→name map — never denormalized onto the row.
// `ctx.characterNamesById`/`ctx.personaNamesById` are that producer's OUTPUT.

import type { CharacterId, PersonaId } from "#ids";
import { processMacros } from "./engine";
import { createNamesOnlyRegistry } from "./registry";

// Stored-history resolution runs a RESTRICTED registry, NOT the full default one: a row's volatile
// macros ({{time}}/{{roll}}/{{random}}/var mutations) are not re-derivable from the row, so re-running
// them against a live clock/PRNG on every assemble would churn the row's bytes every turn. The
// names-only registry resolves only the stable identity macros and re-emits everything else verbatim.
// Built ONCE — this atom fires per row per turn on both the assemble and display paths, so a
// per-call rebuild would be pure waste.
const NAMES_ONLY_REGISTRY = createNamesOnlyRegistry();

/** One character's resolved macro-subject name (names only — never the full character entity). */
export interface RowCharacterName {
  readonly name: string;
}

/** One persona's resolved macro-subject name + description. `description` backs the `{{persona}}`
 *  macro (distinct from `{{user}}`, which resolves to `name`). */
export interface RowPersonaName {
  readonly name: string;
  readonly description: string;
}

/** The per-message stamps — the SAME two ids that drive the attribution chrome also drive the macro
 *  subject. `null` ⇒ no known speaker/author for this row (narrator / legacy / system rows). */
export interface RowMacroStamps {
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
}

/** The per-chat name producer + the fallback subjects a caller supplies:
 *  `speakerCharName` — the turn's OWN `{{char}}` default (the SOLO character) used only when a
 *  characterId-carrying row's `characterId` doesn't resolve; `cast` — the full cast names (roster order),
 *  the `{{char}}` subject for a HUMAN-authored / narrator row (`characterId === null`): the joined cast in
 *  a multi-character room (== `{{group}}`), the one character in solo — so a user's own `{{char}}`
 *  is the room's cast, resolved IDENTICALLY on server-assemble and client-display (never the arbitrary
 *  current speaker); `fallbackPersonaName`/`fallbackPersonaDescription` — the null-stamp
 *  `{{user}}`/`{{persona}}` fallback subject: the chat-level ANCHOR persona, NEVER the reader's own
 *  active persona (identity is the row's or the chat anchor's, never the viewer's — a greeting/AI line
 *  then addresses the SAME persona for the model and every human). All optional — a caller with no
 *  anchor falls through to this atom's literal floor ("User"/""). */
export interface RowMacroNameContext {
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  readonly speakerCharName?: string | undefined;
  readonly cast?: readonly string[] | undefined;
  readonly fallbackPersonaName?: string | undefined;
  readonly fallbackPersonaDescription?: string | undefined;
}

// The ultimate `{{char}}` floor when NEITHER the producer map NOR `speakerCharName` resolves —
// mirrors the codebase's existing "unknown character" convention elsewhere.
const UNKNOWN_CHARACTER_NAME = "Character";
// The ultimate `{{user}}`/`{{persona}}`-name floor (matches every existing consumer).
const UNKNOWN_PERSONA_NAME = "User";

/** `{{char}}` for a HUMAN-authored / narrator row (`characterId === null`): the joined CAST in a
 *  multi-character room (== `{{group}}`), the one character in solo, else the caller's
 *  `speakerCharName` default, then the literal floor. Gated on cast SIZE (`length > 1`) — never an
 *  `isGroup` flag: a cast-of-one collapses to the one name, so solo and group are one code path. */
function castChar(ctx: RowMacroNameContext): string {
  const cast = ctx.cast;
  if (cast !== undefined && cast.length > 1) {
    return cast.join(", ");
  }
  return cast?.[0] ?? ctx.speakerCharName ?? UNKNOWN_CHARACTER_NAME;
}

/**
 * Resolve `{{char}}`/`{{user}}`/`{{persona}}` in a stored history row's content against its OWN stamps
 * and the per-chat name producer. Both server ASSEMBLE and client DISPLAY call this SAME function so
 * they cannot diverge.
 *
 * - `{{char}}` → for a VOICED row (`characterId` set): the ROW's own speaker,
 *   `characterNamesById.get(stamps.characterId)?.name`, falling back to `ctx.speakerCharName`, then the
 *   literal floor (a past line by Aria stays Aria's even when a different character speaks the CURRENT
 *   turn). For a HUMAN-authored / narrator row (`characterId === null`): the room's CAST — the joined
 *   `ctx.cast` in a multi-character room (== `{{group}}`), or the one character in solo — so a
 *   user's own `{{char}}` addresses the whole cast, resolved identically on both consumers (never the
 *   arbitrary current speaker).
 * - `{{user}}` / `{{persona}}` → the ROW's own author: `personaNamesById.get(stamps.personaId)`, whose
 *   `name` resolves `{{user}}` (falling back to the chat ANCHOR `ctx.fallbackPersonaName`, then "User")
 *   and whose `description` resolves `{{persona}}` (falling back to the anchor's
 *   `ctx.fallbackPersonaDescription`, then "").
 *
 * A `content` with no `{{` is returned byte-identical; a `<speaker>NAME</speaker>` marker passes
 * through untouched (the macro parser only touches `{{…}}`). VOLATILE macros in stored content
 * (`{{time}}`/`{{date}}`/`{{roll}}`/`{{random}}`/var mutations) are NOT resolved here — they re-emit
 * verbatim, so a given row renders byte-identically on every assemble/re-render regardless of wall
 * clock or PRNG.
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

  const char =
    stamps.characterId === null
      ? castChar(ctx)
      : (character?.name ?? ctx.speakerCharName ?? UNKNOWN_CHARACTER_NAME);
  const user = persona?.name ?? ctx.fallbackPersonaName ?? UNKNOWN_PERSONA_NAME;
  const personaDescription = persona?.description ?? ctx.fallbackPersonaDescription ?? "";

  return processMacros(
    content,
    {
      char,
      user,
      persona: personaDescription,
      scenario: "",
      env: {},
    },
    NAMES_ONLY_REGISTRY,
  );
}
