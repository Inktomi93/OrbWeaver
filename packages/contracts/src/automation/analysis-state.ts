// @orb/contracts/automation — the `run_analysis` arm's stored state, the shape `automation_rule_state.state` holds.
// It lives here because the column and the automation domain's read seam both import it (.claude/rules/db.md).
//
// VERSION POSTURE: "corrupt" means UNPARSEABLE, never merely old. Every field carries a default AND a per-field
// `.catch`, so a row written before a field existed (or with one damaged field) reads with that field defaulted and
// its watermark preserved; only non-object garbage resets whole. A `.max()` or refine here would make an
// already-stored row unparseable and reset the watermark it was meant to protect, so size bounds are a clamp the
// domain applies after this parse.

import { z } from "zod";

/** The stored state, parse-on-read. A key an older or newer build wrote is stripped, never a reason to reset the
 *  watermark. */
export const analysisStateSchema = z
  .object({
    arc: z.string().catch("").default(""),
    twists: z.array(z.string()).readonly().catch([]).default([]),
    retiredTwists: z.array(z.string()).readonly().catch([]).default([]),
    settledThroughSeq: z.int().nonnegative().nullable().catch(null).default(null),
  })
  .strip();

/** The `automation_rule_state.state` blob, parsed. `settledThroughSeq` is the settled-span HIGH-WATER MARK, advanced
 *  only on a successful durable apply, so a failed or unconfirmed pass re-covers its span. `null` means no pass has
 *  covered a span, never 0, because an imported room's canon can hold a real seq 0. */
export type AnalysisState = z.infer<typeof analysisStateSchema>;
