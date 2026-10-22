// op: joinerPersonaStatement — the sign-up joiner's persona for chat's signup batch (D259). Not a `PersonaService`
// verb: its owner does not exist until that batch commits, so there is no Principal. The statement goes out
// unexecuted with its minted id, because the seat later in the batch names the persona before it exists.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { awaitableStatementToken, databaseForOwner } from "@orb/db/wiring-owner";
import type { JoinerPersonaStatementOp } from "../contract/ops.ts";
import type { PersonaContext } from "../contract/service.ts";
import { insertJoinerPersonaStatement } from "../persistence/joiner.ts";

export function createJoinerPersonaStatement(ctx: DbAssemblyInput<Pick<PersonaContext, "db" | "newPersonaId">>): JoinerPersonaStatementOp {
  const db = databaseForOwner(ctx.db);
  return ({ ownerId, persona, at }) => {
    const personaId = ctx.newPersonaId();
    return { personaId, statement: awaitableStatementToken(insertJoinerPersonaStatement(db, { id: personaId, ownerId, persona, at })) };
  };
}
