// domain/preset/contract/errors — PresetNotFoundError maps to tRPC NOT_FOUND; PresetOperationError maps
// to BAD_REQUEST, carrying a code discriminator. One home for those reason codes.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";

export const PRESET_OP_CODES = {
  /** The single system-default row (ownerId IS NULL) may never be removed — only the boot seeder owns its lifecycle. */
  cannotRemoveSystemDefault: "cannot_remove_system_default",
} as const;

export type PresetOpCode = (typeof PRESET_OP_CODES)[keyof typeof PRESET_OP_CODES];

export class PresetNotFoundError extends DomainNotFoundError {
  constructor(id: string) {
    super("preset", id);
  }
}

export class PresetOperationError extends DomainOperationError {
  // Narrows code to PresetOpCode so a verb can never throw an off-catalog reason code.
  // biome-ignore lint/complexity/noUselessConstructor: the narrowing constructor is the point.
  constructor(code: PresetOpCode, message: string) {
    super(code, message);
  }
}
