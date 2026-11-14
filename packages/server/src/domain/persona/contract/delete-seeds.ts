import type { Principal } from "@orb/contracts/identity";
import type { LoadUserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { AwaitableStatementToken } from "@orb/db/wiring";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { PersonaSeedRepoint } from "./results.ts";

/** The deleting caller retains authority; persona can write only its two seed pointers. */

export interface PersonaDeleteSeedsDeps {
  readonly db: Db;
  readonly loadUserSettings: LoadUserSettings;
  readonly writeSeeds: (principal: Principal, seeds: Pick<PersonaSeedRepoint, "currentPersonaId" | "defaultPersonaId">) => Promise<void>;
}

/** The seed pointers a persona delete leaves, decided before the delete, and the write that stores them. `write` is a
 *  no-op when neither pointer named the deleted persona. */
export interface PersonaSeedRepointPlan {
  readonly next: PersonaSeedRepoint;
  readonly write: () => Promise<void>;
}

/** D337 — chat's seat reseat for a persona delete, unexecuted, which `remove` places ahead of its delete in one batch.
 *  The statement moves the owner's present seats on `personaId` to `reseatWith` and returns their rooms; `announce`
 *  fans the switch for those rooms once the batch commits. */
export type ReseatPersonaSeatsStatementOp = (args: { readonly ownerId: UserId; readonly personaId: PersonaId; readonly reseatWith: PersonaId }) => {
  readonly statement: AwaitableStatementToken<{ chatId: ChatId }[]>;
  readonly announce: (chatIds: readonly ChatId[]) => Promise<void>;
};
