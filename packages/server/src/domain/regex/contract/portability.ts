// domain/regex/contract/portability — the DI bundle the portability ops close over. The op signatures
// (card lift, card re-embed, bundle halves, single-entity export) live in `@orb/contracts/regex`.
//
// THE DEDUP RULE (one home, both import paths): a candidate matches an existing owned row when its
// BEHAVIOR BODY is content-equal (canonical JSON of the behavior blob) AND its name matches. Re-importing
// a card pack is the norm, and always-new would breed hundreds of identical rows.

import type { Db } from "@orb/db";
import type { RegexScriptId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";

/** The DI bundle every portability op closes over (assembled at the entry composition root). */
export interface RegexPortabilityContext {
  readonly db: Db;
  readonly now: Clock;
  readonly newScriptId: () => RegexScriptId;
}
