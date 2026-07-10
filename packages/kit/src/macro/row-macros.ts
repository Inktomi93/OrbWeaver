// resolveRowMacros — the ONE shared atom server ASSEMBLE (`domain/chat/engine` history-macro pass) and
// client DISPLAY (`lib/message-render`) BOTH call to resolve a stored history row's `{{char}}`/`{{user}}`/
// `{{persona}}` macros (Chat-Macro-Resolution.md §2 — read that doc in full before touching this file).
//
// Composes the pure `@orb/kit/macro` engine (`processMacros`, defined in `./engine`) — this file does NOT
// reimplement the parser/evaluator; it only maps a row's STAMPS + the per-chat name PRODUCER onto a
// `ProcessMacroOptions`. Imports `./engine`/`./registry` directly (NOT `./index`, which re-exports this
// very file) — importing the barrel here would be an import cycle.
//
// It runs a NAMES-ONLY registry, not the full default one: history rows resolve ONLY the stable identity
// macros ({{char}}/{{user}}/{{persona}} + aliases) and re-emit every VOLATILE macro verbatim. Re-running
// {{time}}/{{roll}}/{{random}} against a live clock/PRNG on stored content churned the row's bytes every
// turn (R1 prefix-cache miss + non-byte-identical re-render — see `createNamesOnlyRegistry`).
//
// §0 (the one rule): storage is RAW, never mutated — resolution happens at CONSUMPTION. The per-message
// STAMPS (`characterId`/`personaId`) are the source of truth for BOTH the attribution chrome and the
// macro subject — this function takes them as its one required input, never re-derives them.
// §1 (the producer): names are DERIVED from a per-chat, member-gated id→name map — never denormalized
// onto the row. `ctx.characterNamesById`/`ctx.personaNamesById` are that producer's OUTPUT (built via
// `@orb/contracts/chat`'s `buildCharacterNameMap`/`buildPersonaNameMap` over the wire arrays).

import type { CharacterId, PersonaId } from "#ids";
import { processMacros } from "./engine";
import { createNamesOnlyRegistry } from "./registry";

// Stored-history resolution runs a RESTRICTED registry, NOT the full default one: a row's volatile
// macros ({{time}}/{{roll}}/{{random}}/var mutations) are not re-derivable from the row, so re-running
// them against a live clock/PRNG on every assemble churned the row's bytes every turn (R1 prefix-cache
// miss + non-byte-identical re-render — D46). The names-only registry resolves only the stable identity
// macros and re-emits everything else verbatim (Chat-Macro-Resolution.md §0/§2). Built ONCE (a fixed
// restricted set, never extended) — this atom fires per row per turn on both the assemble and display
// paths, so a per-call rebuild would be pure waste.
const NAMES_ONLY_REGISTRY = createNamesOnlyRegistry();

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

/** The per-chat name producer (§1) + the fallback subjects (§2/§4) a caller supplies:
 *  `speakerCharName` — the turn's OWN `{{char}}` default (the SOLO character) used only when a
 *  characterId-carrying row's `characterId` doesn't resolve; `cast` — the full cast names (roster order),
 *  the `{{char}}` subject for a HUMAN-authored / narrator row (`characterId === null`): the joined cast in
 *  a multi-character room (== `{{group}}`, ruling B), the one character in solo — so a user's own `{{char}}`
 *  is the room's cast, resolved IDENTICALLY on server-assemble and client-display (never the arbitrary
 *  current speaker); `fallbackPersonaName`/`fallbackPersonaDescription` — the null-stamp
 *  `{{user}}`/`{{persona}}` fallback subject: the chat-level ANCHOR persona (`chats.anchorPersonaId` /
 *  `pinnedPersona`), NEVER the reader's own active persona (the design principle: identity is the row's or
 *  the chat anchor's, never the viewer's — a greeting/AI line then addresses the SAME persona for the
 *  model and every human). All optional — a caller with no anchor falls through to this atom's literal
 *  floor ("User"/""). */
export interface RowMacroNameContext {
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  readonly speakerCharName?: string | undefined;
  readonly cast?: readonly string[] | undefined;
  readonly fallbackPersonaName?: string | undefined;
  readonly fallbackPersonaDescription?: string | undefined;
}

// The ultimate `{{char}}` floor when NEITHER the producer map NOR `speakerCharName` resolves — mirrors
// the codebase's existing "unknown character" literal (`domain/export/verbs/export-chat.ts`), the same
// way `{{user}}`'s floor mirrors ST's "User" convention (`domain/chat/assembly/macros.ts`).
const UNKNOWN_CHARACTER_NAME = "Character";
// The ultimate `{{user}}`/`{{persona}}`-name floor (matches every existing consumer: `assembly/macros.ts`,
// `engine/pipeline.ts`).
const UNKNOWN_PERSONA_NAME = "User";

/** `{{char}}` for a HUMAN-authored / narrator row (`characterId === null`): the joined CAST in a
 *  multi-character room (== `{{group}}`, ruling B), the one character in solo, else the caller's
 *  `speakerCharName` default, then the literal floor. Gated on cast SIZE (`length > 1`) — never an
 *  `isGroup` flag (D16): a cast-of-one collapses to the one name, so solo and group are one code path. */
function castChar(ctx: RowMacroNameContext): string {
  const cast = ctx.cast;
  if (cast !== undefined && cast.length > 1) {
    return cast.join(", ");
  }
  return cast?.[0] ?? ctx.speakerCharName ?? UNKNOWN_CHARACTER_NAME;
}

/**
 * Resolve `{{char}}`/`{{user}}`/`{{persona}}` in a stored history row's content against its OWN stamps
 * (§0) and the per-chat name producer (§1). Both server ASSEMBLE and client DISPLAY call this SAME
 * function so they cannot diverge (§2/§6 parity).
 *
 * - `{{char}}` → for a VOICED row (`characterId` set): the ROW's own speaker,
 *   `characterNamesById.get(stamps.characterId)?.name`, falling back to `ctx.speakerCharName`, then the
 *   literal floor (a past line by Aria stays Aria's even when a different character speaks the CURRENT
 *   turn). For a HUMAN-authored / narrator row (`characterId === null`): the room's CAST — the joined
 *   `ctx.cast` in a multi-character room (== `{{group}}`, ruling B), or the one character in solo — so a
 *   user's own `{{char}}` addresses the whole cast, resolved identically on both consumers (never the
 *   arbitrary current speaker).
 * - `{{user}}` / `{{persona}}` → the ROW's own author: `personaNamesById.get(stamps.personaId)`, whose
 *   `name` resolves `{{user}}` (falling back to the chat ANCHOR `ctx.fallbackPersonaName`, then "User")
 *   and whose `description` resolves `{{persona}}` (falling back to the anchor's
 *   `ctx.fallbackPersonaDescription`, then "").
 *
 * A `content` with no `{{` is returned byte-identical (the kit engine's own no-op passthrough); a
 * `<speaker>NAME</speaker>` marker passes through untouched (the macro parser only touches `{{…}}` —
 * `speakerTagsToPlain` is the separate pass that converts those). VOLATILE macros in stored content
 * (`{{time}}`/`{{date}}`/`{{roll}}`/`{{random}}`/var mutations) are NOT resolved here — they re-emit verbatim
 * (the names-only registry has no handler for them), so a given row renders byte-identically on every
 * assemble/re-render regardless of wall clock or PRNG.
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

  // `{{char}}`: a VOICED row (characterId set) resolves to its OWN speaker (or the deleted-id floor); a
  // HUMAN-authored / narrator row (characterId === null) resolves to the CAST — the joined names in a
  // multi-character room (ruling B: a user's `{{char}}` == `{{group}}`), the one character in solo.
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
