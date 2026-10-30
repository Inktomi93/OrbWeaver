// domain/persona/contract/import — the `PersonaImportContext` DI bundle for the persona-OWNED
// bulk-import WRITE (`createBulkImportPersonas`, Option B). A PURPOSE-BUILT context (NOT the full
// `PersonaContext`): the bulk path needs only db + clock + the persona id minter — no audit/user-bus/chat
// guards. Homed under `contract/` (the `types-in-contract`/`no-context-returntype` gate); explicit
// interface, never `ReturnType<typeof …>`.
//
// `import` injects this op: it translates ST `power_user.personas` → the canonical `BulkImportPersonaInput`
// (`@orb/contracts/persona`) and calls the op. Persona owns the WRITE (dedup-by-name + `personas` insert) and
// returns `idByName` so import can attribute chat `user_name`s.

import type { Db } from "@orb/db";
import type { PersonaId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";

/** The DI bundle `createBulkImportPersonas` closes over (assembled at the entry composition root). */
export interface PersonaImportContext {
  readonly db: Db;
  readonly now: Clock;
  readonly newPersonaId: () => PersonaId;
}
