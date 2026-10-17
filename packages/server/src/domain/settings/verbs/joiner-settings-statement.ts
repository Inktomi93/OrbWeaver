// op: joinerSettingsStatement — the sign-up joiner's persona pointers for chat's signup batch (D259). Not a
// `SettingsService` verb: its owner does not exist until that batch commits, so there is no Principal.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { awaitableStatementToken, databaseForOwner } from "@orb/db/wiring-owner";
import type { JoinerSettingsStatementOp } from "../contract/ops.ts";
import type { SettingsContext } from "../contract/service.ts";
import { insertJoinerSettingsStatement } from "../persistence/joiner.ts";

export function createJoinerSettingsStatement(ctx: DbAssemblyInput<Pick<SettingsContext, "db">>): JoinerSettingsStatementOp {
  const db = databaseForOwner(ctx.db);
  return ({ ownerId, personaId, at }) => awaitableStatementToken(insertJoinerSettingsStatement(db, { ownerId, personaId, at }));
}
