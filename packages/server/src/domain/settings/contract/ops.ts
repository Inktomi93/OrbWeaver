// domain/settings/contract/ops — the Principal-less injected ops this domain hands out. Each is a compose-built
// factory, never a `SettingsService` verb: its caller acts before any Principal exists.

import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";

/** D259 — a sign-up joiner's first settings row, unexecuted: the defaults with both persona pointers aimed at the
 *  persona chat's signup batch created. It writes only where the statement before it changed a row. */
export type JoinerSettingsStatementOp = (args: {
  readonly ownerId: UserId;
  readonly personaId: PersonaId;
  readonly at: number;
}) => AwaitableBatchStmt<{ userId: UserId }[]>;
