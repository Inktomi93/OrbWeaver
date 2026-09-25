// op: joinerSettingsStatement — the sign-up joiner's persona pointers for chat's signup batch (D259). Not a
// `SettingsService` verb: its owner does not exist until that batch commits, so there is no Principal.

import type { JoinerSettingsStatementOp } from "../contract/ops.ts";
import type { SettingsContext } from "../contract/service.ts";
import { insertJoinerSettingsStatement } from "../persistence/joiner.ts";

export function createJoinerSettingsStatement(ctx: Pick<SettingsContext, "db">): JoinerSettingsStatementOp {
  return ({ ownerId, personaId, at }) => insertJoinerSettingsStatement(ctx.db, { ownerId, personaId, at });
}
