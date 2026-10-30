// Character-owned refinery op contexts; the op shapes live in `@orb/contracts/character` and the implementations are
// injected at compose. Characters remain the only writer; estimates retain scalar output and read-only dependencies.

import type { CharacterCard } from "@orb/contracts/character";
import type { Db, ReadOnlyDb } from "@orb/db";

/** The context both refinery-op factories close over. */
export interface CharacterRefineryOpsContext {
  readonly db: Db;
}

/** The count boundary can read and classify privately, but cannot write or return a card payload. */
export interface RefineryScoreCountContext {
  readonly db: ReadOnlyDb;
  readonly isReady: (card: CharacterCard) => boolean;
}
