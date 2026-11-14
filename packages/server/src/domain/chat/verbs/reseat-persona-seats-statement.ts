// op: reseatPersonaSeatsStatement — the seat half of a persona delete, unexecuted, for persona's delete batch (D337).
// It runs AHEAD of the delete in that batch: the delete's FK SET NULL empties a seat, and an emptied seat cannot be
// told apart from one that was empty before, so the seats move to the fallback persona while they still name the
// doomed one. `announce` fans personaSwitched for the rooms the statement moved, after the batch commits.

import type { AwaitableStatementToken, DbAssemblyInput } from "@orb/db/wiring";
import { awaitableStatementToken, databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { PersonaSeatReseatDeps } from "../contract/persona-seats.ts";
import { reseatPersonaSeatsStatement } from "../persistence/persona-seats.ts";

export function createReseatPersonaSeatsStatement(input: DbAssemblyInput<PersonaSeatReseatDeps>): (args: {
  readonly ownerId: UserId;
  readonly personaId: PersonaId;
  readonly reseatWith: PersonaId;
}) => {
  readonly statement: AwaitableStatementToken<{ chatId: ChatId }[]>;
  readonly announce: (chatIds: readonly ChatId[]) => Promise<void>;
} {
  const db = databaseForOwner(input.db);
  return (args) => ({
    statement: awaitableStatementToken(reseatPersonaSeatsStatement(db, args)),
    announce: async (chatIds): Promise<void> => {
      for (const chatId of chatIds) {
        await input.emit({ type: "personaSwitched", chatId, from: args.personaId, to: args.reseatWith });
      }
    },
  });
}
