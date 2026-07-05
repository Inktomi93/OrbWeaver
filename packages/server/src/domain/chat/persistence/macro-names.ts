// domain/chat/persistence/macro-names — the CHAT MACRO NAME PRODUCER loader (Chat-Macro-Resolution.md §1):
// resolve a chat's referenced persona/character ids into the member-gated NAME maps both consumers need —
// server ASSEMBLE (`engine/pipeline.ts` `toShapeCanon`, via `buildCharacterNameMap`/`buildPersonaNameMap` over
// this read's array output) and the client-read surface (`verbs/read.ts` `getChat`/`listMessages`, which
// return the array output AS-IS, the `ChatMacroNameProducer` wire shape). ONE query shape, two consumers —
// no second resolution path to drift (§6 parity).
//
// NAMES ONLY (never the full character/persona entity — §1): a member already sees who authored each line
// (the attribution chrome), so a co-participant's persona/character NAME is not a further secret this needs
// to gate. Modeled on `domain/export/verbs/export-chat.ts`'s `loadSpeakerNames` (the id-IN → name-map
// precedent) — same shape, chat-domain home instead of export's.
//
// COVERAGE (§1): every id the chat references — its participants' seat/active-persona ids (the `participants`
// arg — any `{characterId, activePersonaId}`-shaped roster projection: `ParticipantView[]` or a raw
// `chat_participants` row both satisfy it) UNION any `characterId`/`personaId` a loaded set of message rows
// stamps (the `messages` arg — `MessageView[]` or `loadCanonHistory`'s rows both satisfy it, incl.
// since-switched personas: a row's historical stamp is still covered even if no longer a participant's
// ACTIVE persona). Both args are optional + independently omittable — `getChat` supplies participants only;
// `listMessages`/the engine supply whichever set they have loaded.
//
// `characters`/`personas` are `@orb/db` schema tables (a shared package, not a `domain/*` feature) — reading
// them here is a sibling-package import, not a cross-feature reach (no `domain-no-cross-feature` violation);
// `persistence/` is a dependency-cruiser FIXED SLOT, so every verb/engine file may import this freely
// (`domain-no-cross-subsystem` exempts fixed slots on both sides).

import type { ChatMacroNameProducer } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, personas } from "@orb/db";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { inArray } from "drizzle-orm";

/** A roster projection carrying the two participant-scoped macro ids (§1's "participants' personas/
 *  characters" half) — satisfied by `ParticipantView` and by a raw `chat_participants` row alike. */
interface ParticipantMacroIdSource {
  readonly characterId: CharacterId | null;
  readonly activePersonaId: PersonaId | null;
}

/** A message-row projection carrying the two per-row macro STAMPS (§1's "any id a stored message carries"
 *  half) — satisfied by `MessageView` and by a raw `messages` row alike. */
interface MessageMacroIdSource {
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
}

/** Collect the DISTINCT `characterId`/`personaId` sets the producer must cover (§1), from whichever of the
 *  two optional sources the caller has loaded. Pure — no I/O; `loadChatMacroNameProducer` runs the query. */
function collectMacroIds(args: {
  readonly participants?: readonly ParticipantMacroIdSource[];
  readonly messages?: readonly MessageMacroIdSource[];
}): { characterIds: CharacterId[]; personaIds: PersonaId[] } {
  const participants = args.participants ?? [];
  const rows = args.messages ?? [];
  const characterIds = new Set<CharacterId>();
  const personaIds = new Set<PersonaId>();
  for (const p of participants) {
    if (p.characterId !== null) {
      characterIds.add(p.characterId);
    }
    if (p.activePersonaId !== null) {
      personaIds.add(p.activePersonaId);
    }
  }
  for (const m of rows) {
    if (m.characterId !== null) {
      characterIds.add(m.characterId);
    }
    if (m.personaId !== null) {
      personaIds.add(m.personaId);
    }
  }
  return { characterIds: [...characterIds], personaIds: [...personaIds] };
}

/**
 * Load the {@link ChatMacroNameProducer} (§1) for a chat: the member-gated `characterNames`/`personaNames`
 * arrays covering the union of `args.participants`' seat/active-persona ids and `args.messages`' per-row
 * stamps. Both args are optional (an empty producer for a hostless/messageless probe never queries). Returned
 * DIRECTLY as the wire shape (no re-mapping) — `verbs/read.ts` hands this straight to the client; the engine
 * runs it through `buildCharacterNameMap`/`buildPersonaNameMap` (`@orb/contracts/chat`) to get the
 * `ReadonlyMap`s `resolveRowMacros` (`@orb/kit/macro`) takes.
 */
export async function loadChatMacroNameProducer(
  db: Db,
  args: {
    readonly participants?: readonly ParticipantMacroIdSource[];
    readonly messages?: readonly MessageMacroIdSource[];
  },
): Promise<ChatMacroNameProducer> {
  const { characterIds, personaIds } = collectMacroIds(args);
  const [characterNames, personaNames] = await Promise.all([
    characterIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: characters.id, name: characters.name })
          .from(characters)
          .where(inArray(characters.id, characterIds)),
    personaIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: personas.id, name: personas.name, description: personas.description })
          .from(personas)
          .where(inArray(personas.id, personaIds)),
  ]);
  return { characterNames, personaNames };
}
