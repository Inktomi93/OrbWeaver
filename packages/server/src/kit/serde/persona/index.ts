// The one orb-native persona-backup serde core: both directions in one home, so build + parse can never
// drift. Pure: zero I/O, zero db, zero id-resolution — it maps a canonical `PersonaBackup` to/from the
// contracts/persona personaBackupSchema wire object. This is the orb-native backup only; the ST
// settings.json persona path is a separate adapter and does not route through here.
//
// Round-trip drift guard: buildPersonaBackup(parsePersonaBackup(buildPersonaBackup(p))) deep-equals
// buildPersonaBackup(p).

import type { PersonaBackupInput, PersonaMetadata } from "@orb/contracts/persona";
import { personaBackupSchema, personaMetadataSchema } from "@orb/contracts/persona";

/** The canonical persona-backup value: the portable fields with concrete (non-optional) types. Excludes
 *  avatarAssetId (a binary asset reference can't ride a JSON backup). */
export interface PersonaBackup {
  readonly name: string;
  readonly title: string | null;
  readonly description: string;
  readonly starred: boolean;
  readonly metadata: PersonaMetadata | null;
}

/** Serialize a canonical `PersonaBackup` to the portable wire object (the inverse of `parsePersonaBackup`).
 *  Emits all portable fields present so the backup is self-describing and re-imports byte-identically. */
export function buildPersonaBackup(backup: PersonaBackup): PersonaBackupInput {
  return personaBackupSchema.parse({
    name: backup.name,
    title: backup.title,
    description: backup.description,
    starred: backup.starred,
    metadata: backup.metadata,
  });
}

/** Parse an untrusted wire object into the canonical `PersonaBackup` (the inverse of `buildPersonaBackup`).
 *  Validates the shape, applies create's field defaults, and narrows the metadata blob. Throws on an
 *  invalid backup (our own strict format, unlike the tolerant ST card adapter). */
export function parsePersonaBackup(input: PersonaBackupInput): PersonaBackup {
  const parsed = personaBackupSchema.parse(input);
  const meta = parsed.metadata;
  return {
    name: parsed.name,
    title: parsed.title ?? null,
    description: parsed.description,
    starred: parsed.starred ?? false,
    metadata: meta === null || meta === undefined ? null : personaMetadataSchema.parse(meta),
  };
}
