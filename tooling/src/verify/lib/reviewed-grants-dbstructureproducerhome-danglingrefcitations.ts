// Reviewed grants: duplicate-action-doors.
// Split from reviewed-grants.ts — see that file for the central home comment.
import { ACTION_DOOR_RULINGS, rulingOperation } from "../../floor/code-facts/action-door-rulings.ts";
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_DBSTRUCTUREPRODUCERHOME_DANGLINGREFCITATIONS: readonly ReviewedGateGrant[] = [
  // THE #252 DUPLICATE-ACTION DOOR RULINGS (#1584, 2026-09-13). They replace
  // `duplicate-action-doors.baseline.json` (six RATIFIED count rows whose `cite` list was the real ruling) and the
  // gate-local `EXEMPT_PROCEDURES` table (one procedure-keyed row, four qualifying planes). THE RULED UNIT IS THE
  // DOOR SET and it lives in the `operation`, which is what preserves #2101's two-sided semantics through the
  // migration: a third door, a moved door, a swapped door or a pure RENAME changes the set, the row stops matching,
  // the finding is effective, and the orphaned row alarms stale.
  //
  // THE ROWS ARE AUTHORED IN `floor/code-facts/action-door-rulings.ts` AND MAPPED HERE, which is the ONLY placement that
  // serves both readers: the `ast subset-callers` lens renders the same ruling, and a lens reading this table
  // through `verify/index.ts` closes a real import cycle (measured 2026-09-13: five `noImportCycles` errors, the
  // loop being verify/index → ops/debt → … → ast/index → ops/subset-callers). `floor` is the floor both tools
  // read down into; the retired `DOORS_BASELINE_REL` sat there for exactly this reason. Consumption, staleness and
  // over-broad judgment remain entirely central.
  ...ACTION_DOOR_RULINGS.map(
    (ruling): ReviewedGateGrant => ({
      id: ruling.id,
      policyId: "duplicate-action-doors",
      subject: ruling.subject,
      operation: rulingOperation(ruling),
      why: ruling.why,
      endsWhen: ruling.endsWhen,
    }),
  ),
];
