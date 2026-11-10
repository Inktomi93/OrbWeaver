// domain/regex/contract/errors — one typed NotFound error for the whole slice: a script, or a foreign
// attachment target (character/preset), missing or not the caller's all collapse into ONE answer (no
// foreign-existence leak). The CHAT scope is absent by design — its authority is the injected chat guard,
// which owns its own refusal shape (the world-info precedent).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { TypeIdOf } from "@orb/kit/ids";

const REGEX_ENTITY_KINDS = ["regex_script", "character", "preset"] as const;
export type RegexEntityKind = (typeof REGEX_ENTITY_KINDS)[number];
type RegexEntity = { [Kind in RegexEntityKind]: [kind: Kind, id: TypeIdOf<Kind>] }[RegexEntityKind];

export class RegexNotFoundError extends DomainNotFoundError {
  public readonly entityKind: RegexEntityKind;
  public readonly entityId: RegexEntity[1];
  constructor(...[entityKind, entityId]: RegexEntity) {
    super(entityKind, entityId);
    this.entityKind = entityKind;
    this.entityId = entityId;
    this.name = this.constructor.name;
  }
}
