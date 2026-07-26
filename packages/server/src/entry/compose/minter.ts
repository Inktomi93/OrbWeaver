// The shared compose-root id-minter factory: a per-prefix TypeID generator (deterministic-safe — mintTypeId is
// the one branded-id mint the whole graph shares). Extracted so the keystone AND every seam file it splits into
// mint ids the same way without each re-declaring the two-liner.

import type { TypeIdOf } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";

export function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}
