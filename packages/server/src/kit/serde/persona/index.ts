// The one orb-native persona-backup serde core: both directions in one home, so build + parse can never
// drift. Pure: zero I/O, zero db, zero id-resolution — it maps a canonical `PersonaBackup` to/from the
// portable `.json` bytes. This is the orb-native backup only; the ST settings.json persona path is a
// separate adapter and does not route through here.
//
// Defined through `#kit/serde/lib`. Persona shipped with NO envelope (a persona .json was fenced from
// foreign files only by its subdirectory + field shape, F4) — so build now EMITS the uniform envelope and
// parse keeps accepting envelope-less files FOREVER (`envelopeOptional`), the ruled external-artifact
// repair: a user's existing persona backups must not stop working.
//
// Round-trip drift guard: buildPersonaBackup(parsePersonaBackup(buildPersonaBackup(p))) deep-equals
// buildPersonaBackup(p).

import type { PersonaMetadata } from "@orb/contracts/persona";
import { personaBackupSchema, personaMetadataSchema } from "@orb/contracts/persona";
import type { PortableParse } from "@orb/contracts/portability";
import { defineJsonObjectSerde } from "#kit/serde/lib";

export const PERSONA_SCHEMA_KIND = "orb.persona";
export const PERSONA_SCHEMA_VERSION = 1;

/** The canonical persona-backup value: the portable fields with concrete (non-optional) types. Excludes
 *  avatarAssetId (a binary asset reference can't ride a JSON backup). */
export interface PersonaBackup {
  readonly name: string;
  readonly title: string | null;
  readonly description: string;
  readonly starred: boolean;
  readonly metadata: PersonaMetadata | null;
}

/** Narrow the validated metadata blob. Total by construction: `personaBackupSchema`'s write guard already
 *  refused anything `personaMetadataSchema` rejects, so the fallback is unreachable — it exists so parse
 *  keeps its never-throw contract without a cast. */
function narrowMetadata(raw: unknown): PersonaMetadata | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const parsed = personaMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const personaSerde = defineJsonObjectSerde<PersonaBackup, ReturnType<typeof personaBackupSchema.parse>>({
  schemaKind: PERSONA_SCHEMA_KIND,
  schemaVersion: PERSONA_SCHEMA_VERSION,
  envelopeOptional: true,
  bodySchema: personaBackupSchema,
  toWire: (backup) => personaBackupSchema.parse(backup),
  fromWire: (body) => ({
    name: body.name,
    title: body.title ?? null,
    description: body.description,
    starred: body.starred ?? false,
    metadata: narrowMetadata(body.metadata),
  }),
});

/** Serialize a canonical `PersonaBackup` to the portable persona-backup JSON bytes (the inverse of
 *  `parsePersonaBackup`). */
export function buildPersonaBackup(backup: PersonaBackup): Uint8Array {
  return personaSerde.build(backup);
}

/** Parse untrusted persona-backup bytes into the canonical `PersonaBackup`, or the typed reason they were
 *  refused. Envelope-less legacy files parse; a file whose fields are wrong is `malformed`. */
export function parsePersonaBackup(bytes: Uint8Array): PortableParse<PersonaBackup> {
  return personaSerde.parse(bytes);
}
