// Every compose slice binds the root's one business ID source; there is no module-level fallback source.

import type { IdSource, TypeIdOf, TypeIdPrefix } from "@orb/kit/ids";

export function minter<P extends TypeIdPrefix>(prefix: P, source: IdSource): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => source.typeId(prefix);
}
