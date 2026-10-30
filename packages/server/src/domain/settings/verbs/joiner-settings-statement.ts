// op: joinerSettingsStatement — the sign-up joiner's persona pointers for chat's signup batch (D259). Not a
// `SettingsService` verb: its owner does not exist until that batch commits, so there is no Principal.

import type { JoinerSettingsStatementParams } from "@orb/contracts/settings";
import type { AwaitableStatementToken, DbAssemblyInput } from "@orb/db/wiring";
import { awaitableStatementToken, databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import type { SettingsContext } from "../contract/service.ts";
import { insertJoinerSettingsStatement } from "../persistence/joiner.ts";

export function createJoinerSettingsStatement(
  ctx: DbAssemblyInput<Pick<SettingsContext, "db">>,
): (params: JoinerSettingsStatementParams) => AwaitableStatementToken<{ userId: UserId }[]> {
  const db = databaseForOwner(ctx.db);
  return ({ ownerId, personaId, at }) => awaitableStatementToken(insertJoinerSettingsStatement(db, { ownerId, personaId, at }));
}
