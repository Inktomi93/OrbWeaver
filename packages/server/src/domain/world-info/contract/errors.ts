// domain/world-info/contract/errors — one typed NotFound error for the whole slice: a book, entry, or
// foreign attachment target (character/persona) missing or not the caller's all collapse into ONE
// answer (no foreign-existence leak).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { TypeIdOf } from "@orb/kit/ids";

const WORLD_INFO_ENTITY_KINDS = ["world_book", "world_entry", "character", "persona"] as const;
export type WorldInfoEntityKind = (typeof WORLD_INFO_ENTITY_KINDS)[number];
type WorldInfoEntity = { [Kind in WorldInfoEntityKind]: [kind: Kind, id: TypeIdOf<Kind>] }[WorldInfoEntityKind];

export class WorldInfoNotFoundError extends DomainNotFoundError {
  public readonly entityKind: WorldInfoEntityKind;
  public readonly entityId: WorldInfoEntity[1];
  constructor(...[entityKind, entityId]: WorldInfoEntity) {
    super(entityKind, entityId);
    this.entityKind = entityKind;
    this.entityId = entityId;
    this.name = this.constructor.name;
  }
}
