// domain/rpg/contract/errors — the rpg substrate's typed errors (docs/plans/rpg/design.md). Extends the kit
// domain-error taxonomy so the transport boundary maps them. W1a needs `RpgStateCorruptError` for the
// parse-on-read belt (a schema-invalid persisted JSON blob is surfaced LOUDLY, never defaulted away into a
// poisoned tracker — the constitution's no-swallow rule); `RpgModeUnbuiltError` is the PHASE refusal
// `createGame(mode:"full")` throws (its verb lands in W1b, but the error class homes here with its siblings).

import { DomainOperationError } from "@orb/kit/errors";

/** A persisted rpg JSON column failed re-validation through its `@orb/contracts/rpg` schema on read. Never a
 *  silent default — a corrupt tracker row is a loud typed error the caller surfaces (docs/plans/rpg/design.md). */
export class RpgStateCorruptError extends DomainOperationError {
  constructor(table: string, id: string, detail: string) {
    super("rpg_state_corrupt", `${table} ${id}: ${detail}`);
  }
}

/** `createGame(mode:"full")` — the honest-arms PHASE refusal (docs/plans/rpg/design.md). Full is unbuilt; the
 *  refusal NAMES the graft, never pretends full doesn't exist. */
export class RpgModeUnbuiltError extends DomainOperationError {
  constructor() {
    super("rpg_mode_unbuilt", "Full mode is not built yet — lite is the shipped mode. Full grafts as a later wave.");
  }
}
