// domain/persona/contract/import — the `PersonaImportContext` DI bundle + op type for the persona-OWNED
// bulk-import WRITE (`createBulkImportPersonas`, Option B; PD-77). A PURPOSE-BUILT context (NOT the full
// `PersonaContext`): the bulk path needs only db + clock + the persona id minter — no audit/user-bus/chat
// guards. Homed under `contract/` (the `types-in-contract`/`no-context-returntype` gate); explicit
// interface, never `ReturnType<typeof …>`.
//
// `import` injects this op: it translates ST `power_user.personas` → the canonical `BulkImportPersonaInput`
// (`@orb/contracts/persona`) and calls the op. Persona owns the WRITE (dedup-by-name + `personas` insert) and
// returns `idByName` so import can attribute chat `user_name`s.

import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import type { Db } from "@orb/db";
import type { PersonaId, UserId } from "@orb/kit/ids";

/** The DI bundle `createBulkImportPersonas` closes over (assembled at the entry composition root). */
export interface PersonaImportContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPersonaId: () => PersonaId;
}

/** The persona-owned bulk-import op the entry root wires into `import`'s
 *  `ImportContext.profile.bulkImportPersonas`. Dedups by lowercased name; never duplicates an authoring
 *  identity. */
export type BulkImportPersonas = (args: {
  readonly ownerId: UserId;
  readonly personas: readonly BulkImportPersonaInput[];
}) => Promise<BulkImportPersonasResult>;
