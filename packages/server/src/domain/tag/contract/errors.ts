// domain/tag/contract/errors — the tag domain's one typed error. `TagNotFoundError` extends the kit
// primitive `DomainNotFoundError` (`@orb/kit/errors`, NOT the dissolved `_shared/errors`).
// Re-exported from the front door; thrown by get/update/remove/attach when
// an owner-scoped tag (or its target) does not exist for THIS principal. The transport boundary maps it to
// tRPC NOT_FOUND via the kit-error middleware.

import { DomainNotFoundError } from "@orb/kit/errors";

/** A tag does not exist for the requesting owner (owner-scoped: a foreign-owned tag reads as not-found,
 *  never another user's row). */
export class TagNotFoundError extends DomainNotFoundError {
  constructor(id: string) {
    super("tag", id);
  }
}
