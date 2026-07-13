// domain/world-info/contract/errors — one typed NotFound error for the whole slice: a book, entry, or
// foreign attachment target (character/persona) missing or not the caller's all collapse into ONE
// answer (no foreign-existence leak).

import { DomainNotFoundError } from "@orb/kit/errors";

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
