// domain/regex/contract/portability — the DI bundle the portability ops close over. The op signatures
// (card lift, card re-embed, bundle halves, single-entity export) live in `@orb/contracts/regex`.
//
// THE DEDUP RULE (one home, both import paths): a candidate matches an existing owned row when its
// BEHAVIOR BODY is content-equal (canonical JSON of the behavior blob) AND its name matches. Re-importing
// a card pack is the norm, and always-new would breed hundreds of identical rows.

import type { Db } from "@orb/db";
import type { RegexScriptId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { FindCompileProbe } from "#primitives/regex";

/** A pattern's verdict at the write door: admitted, or refused with a reason a summary prints after the name. */
export type FindCompileVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The write door's compile-cost check (D53): one verdict per pattern, in order. Rejects only when the probe cannot
 *  run or cannot be stopped, which refuses the write. */
export type ProbeFindCompilesOp = (patterns: readonly FindCompileProbe[]) => Promise<readonly FindCompileVerdict[]>;

/** The DI bundle every portability op closes over (assembled at the entry composition root). */
export interface RegexPortabilityContext {
  readonly db: Db;
  readonly now: Clock;
  readonly newScriptId: () => RegexScriptId;
  readonly probeFindCompiles: ProbeFindCompilesOp;
  /** Tells every room a script reaches that its tiers changed; a lift calls it for each script it attached, so an
   *  open room draws an imported panel without a reload. Never rejects. */
  readonly fanRegexScriptRooms: (scriptId: RegexScriptId) => Promise<void>;
}
