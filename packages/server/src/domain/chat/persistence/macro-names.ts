// domain/chat/persistence/macro-names — the chat macro name producer loader: resolve a chat's referenced
// persona/character ids into the member-gated name maps both consumers need — server ASSEMBLE and the
// client-read surface (`verbs/read.ts`, which returns the array output as-is, the `ChatMacroNameProducer`
// wire shape). One query shape, two consumers.
//
// Names only, never the full character/persona entity: a member already sees who authored each line, so
// a co-participant's persona/character name is not a further secret to gate.
//
// Coverage: every id the chat references — participants' seat/active-persona ids union any character/
// persona id a loaded set of message rows stamps (incl. since-switched personas). Both args optional.

import type { ChatMacroNameProducer } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, personas } from "@orb/db";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { inArray } from "drizzle-orm";
import type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids";

export type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids";

/** Collect the DISTINCT `characterId`/`personaId` sets the producer must cover (§1), from whichever of the
 *  two optional sources the caller has loaded. Pure — no I/O; `loadChatMacroNameProducer` runs the query.
 *  EXPORTED: `persistence/roster-avatars.ts` (the persona-AVATAR producer sibling, kept a SEPARATE type/
 *  file because the name producer is names-only, §1) reuses this for the identical coverage algorithm. */
export function collectMacroIds(args: {
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
