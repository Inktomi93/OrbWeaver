// domain/persona/substrate/metadata — the write-seam metadata coercion (pure, zero-I/O). The wire INPUT
// carries `metadata` as a loose write-record (`Record<string, unknown>`, validated at transport by
// `personaMetadataWriteSchema`); the row column is typed `PersonaMetadata`. This narrows the record into
// the typed shape at the WRITE seam — the one home for the coercion (create + update both call it), and a
// belt against a non-transport caller (import domain) passing an unvalidated blob. `null` (an explicit
// clear) passes straight through.

import type { PersonaMetadata } from "@orb/contracts/persona";
import { personaMetadataSchema } from "@orb/contracts/persona";

export function normalizeWriteMetadata(
  raw: Record<string, unknown> | null,
): PersonaMetadata | null {
  return raw === null ? null : personaMetadataSchema.parse(raw);
}
