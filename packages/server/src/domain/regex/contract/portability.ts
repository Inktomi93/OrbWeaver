// domain/regex/contract/portability — the DI bundle the portability ops close over. The op signatures
// (card lift, card re-embed, bundle halves, single-entity export) live in `@orb/contracts/regex`.
//
// THE DEDUP RULE (one home, both import paths): a candidate matches an existing owned row when its
// BEHAVIOR BODY is content-equal (canonical JSON of the behavior blob) AND its name matches. Re-importing
// a card pack is the norm, and always-new would breed hundreds of identical rows.

import type { Db } from "@orb/db";
import type { RegexScriptId } from "@orb/kit/ids";
import type { SubstituteFindRegex } from "@orb/kit/regex";
import type { Clock } from "@orb/kit/time";

/** One stored find pattern, as the executor will compile it. */
export interface FindCompileProbe {
  readonly findRegex: string;
  readonly substituteRegex?: SubstituteFindRegex | undefined;
}

/** A pattern's verdict at the write door: admitted, or refused with a reason a summary prints after the name. */
export type FindCompileVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The write door's compile-cost check (D53): one verdict per pattern, in order; never rejects. */
export type ProbeFindCompilesOp = (patterns: readonly FindCompileProbe[]) => Promise<readonly FindCompileVerdict[]>;

/** The DI bundle every portability op closes over (assembled at the entry composition root). */
export interface RegexPortabilityContext {
  readonly db: Db;
  readonly now: Clock;
  readonly newScriptId: () => RegexScriptId;
  readonly probeFindCompiles: ProbeFindCompilesOp;
}
