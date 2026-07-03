// domain/preset/contract/errors — the feature's typed errors.
// They extend the @orb/kit base taxonomy (no `_shared` drawer): `PresetNotFoundError` ← `DomainNotFoundError`
// (maps to tRPC NOT_FOUND) fixes the entity name to "preset"; `PresetOperationError` ← `DomainOperationError`
// (maps to BAD_REQUEST) carries a `code` discriminator. This file is the ONE home for those reason codes —
// the magic-string discriminators the verbs throw and the transport maps (no inline re-spell, §7.5).

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";

/** The `PresetOperationError.code` discriminators preset verbs throw. One home for the reason strings. */
export const PRESET_OP_CODES = {
  /** The single system-default row (`ownerId IS NULL`) may never be removed — only the boot seeder owns
   *  its lifecycle. */
  cannotRemoveSystemDefault: "cannot_remove_system_default",
} as const;

/** The reason-code union (derived from the one tuple of values — never re-spelled). */
export type PresetOpCode = (typeof PRESET_OP_CODES)[keyof typeof PRESET_OP_CODES];

/** A preset the caller may read/own does not exist (or is not theirs). Maps to tRPC NOT_FOUND. */
export class PresetNotFoundError extends DomainNotFoundError {
  constructor(id: string) {
    super("preset", id);
  }
}

// NARROWS `code` from the base `DomainOperationError`'s `string` to the `PresetOpCode` union, so a verb can
// never throw an off-catalog reason code (born-compliant enforcement of the one-home reason-code tuple).
/** A coded operational refusal (the `code` is the discriminator). Maps to tRPC BAD_REQUEST. */
export class PresetOperationError extends DomainOperationError {
  // biome-ignore lint/complexity/noUselessConstructor: narrows `code` to PresetOpCode (see class doc) — not useless.
  constructor(code: PresetOpCode, message: string) {
    super(code, message);
  }
}
