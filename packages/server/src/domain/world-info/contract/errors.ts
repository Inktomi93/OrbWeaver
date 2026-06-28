// domain/world-info/contract/errors — the typed domain error. One class for the whole slice: a book, an
// entry, OR a foreign attachment target (character / persona) that is missing OR not the caller's all
// collapse into ONE answer (NotFound, no foreign-existence leak — the owner-scoped read doctrine). Extends
// the kit `DomainNotFoundError` so the transport maps it to NOT_FOUND uniformly, while callers/tests can
// discriminate it past the base (`rejects.toBeInstanceOf(WorldInfoNotFoundError)`) and read which entity it
// was about (`entityKind`).
//
// The character/persona ownership gates (`persistence/ownership.ts`) reach the `characters`/`personas`
// SCHEMA directly (a sanctioned read — the `domain-no-cross-feature` gate bans importing those DOMAINS'
// code, not the shared `@orb/db` schema; persona's `ensureCharacterOwned` is the precedent). A foreign
// target throws this with the target's `entityKind`, never a cross-domain error type.

import { DomainNotFoundError } from "@orb/kit/errors";

/** The entity a `WorldInfoNotFoundError` is about — a book/entry of this domain, or an attachment target
 *  (character/persona) the caller doesn't own. One-home tuple → derived union (§7.5, no inline re-spell). */
export const WORLD_INFO_ENTITY_KINDS = [
  "world_book",
  "world_entry",
  "character",
  "persona",
] as const;
export type WorldInfoEntityKind = (typeof WORLD_INFO_ENTITY_KINDS)[number];

export class WorldInfoNotFoundError extends DomainNotFoundError {
  public readonly entityKind: WorldInfoEntityKind;
  public readonly entityId: string;
  constructor(entityKind: WorldInfoEntityKind, entityId: string) {
    super(entityKind, entityId);
    this.entityKind = entityKind;
    this.entityId = entityId;
    this.name = this.constructor.name;
  }
}
