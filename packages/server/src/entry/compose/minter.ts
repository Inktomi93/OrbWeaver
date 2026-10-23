// Every compose slice binds the same canonical business ID source, including deterministic compositions.

import type { IdSource, TypeIdOf, TypeIdPrefix } from "@orb/kit/ids";
import { createIdSource } from "@orb/kit/ids";

const DEFAULT_IDS = createIdSource();

export function minter<P extends TypeIdPrefix>(prefix: P, source: IdSource = DEFAULT_IDS): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => source.typeId(prefix);
}
