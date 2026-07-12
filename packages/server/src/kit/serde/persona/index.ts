// @orb/server/kit/serde/persona — the ONE orb-native persona-backup serde core: the portable persona-backup
// grammar with BOTH directions in one home, so build + parse can never drift (the card / chat serde precedent
// — PD-44 / W0a). PURE: zero I/O, zero db, zero id-resolution — it maps a canonical `PersonaBackup` (a
// concrete, NAME-level value shape) to / from the `@orb/contracts/persona` `personaBackupSchema` wire object.
// The RELATIONAL work stays OUT of here, in the persona domain:
//   • export narrows the stored row to `PersonaDetail` (`detailOf`, the read seam) and hands the resolved
//     fields to `buildPersonaBackup` (which drops `avatarAssetId` — a binary asset reference can't travel in
//     a JSON backup; re-attaching an avatar after restore is a separate, explicit action).
//   • import calls `parsePersonaBackup` to normalize the untrusted backup blob (apply `create`'s field
//     defaults + narrow the metadata blob through `personaMetadataSchema`), then inserts a fresh owned row.
// So the serde only ever sees names / strings + the typed metadata blob — never a db handle or an id map.
//
// This is the orb-NATIVE backup only. The ST `settings.json` persona path (the profile bulk-import) is a
// SEPARATE adapter into the persona canonical shape (`ParsedPersona` → `BulkImportPersonaInput`) and does NOT
// route through here — the two formats stay independent.
//
// Round-trip drift guard: `buildPersonaBackup(parsePersonaBackup(buildPersonaBackup(p)))` deep-equals
// `buildPersonaBackup(p)` — pinned in the mirror test (the SERIALIZED wire form is the stable fixed point).

import type { PersonaBackupInput, PersonaMetadata } from "@orb/contracts/persona";
import { personaBackupSchema, personaMetadataSchema } from "@orb/contracts/persona";

// ── the canonical shape (NAME-level, concrete — the serde owns its wire shape, server/kit type-home-exempt) ──

/** The canonical persona-backup value: the portable fields with CONCRETE (non-optional) types — the
 *  build INPUT and the parse OUTPUT, so a round-trip is a fixed point. Deliberately excludes `avatarAssetId`
 *  (a binary asset reference can't ride a JSON backup). `metadata` is the typed placement/provenance blob
 *  (`personaMetadataSchema`), null when unset. */
export interface PersonaBackup {
  readonly name: string;
  readonly title: string | null;
  readonly description: string;
  readonly starred: boolean;
  readonly metadata: PersonaMetadata | null;
}

/**
 * Serialize a canonical `PersonaBackup` to the portable `personaBackupSchema` wire object (the inverse of
 * `parsePersonaBackup`). Emits ALL portable fields present (`title`/`starred`/`metadata` concrete, never
 * omitted) so the backup is self-describing and re-imports byte-identically. `avatarAssetId` is structurally
 * absent (not on `PersonaBackup`, omitted from the schema). The result is `personaBackupSchema.parse`d so a
 * malformed projection fails loud at the boundary, not silently on the wire. PURE.
 */
export function buildPersonaBackup(backup: PersonaBackup): PersonaBackupInput {
  return personaBackupSchema.parse({
    name: backup.name,
    title: backup.title,
    description: backup.description,
    starred: backup.starred,
    metadata: backup.metadata,
  });
}

/**
 * Parse an untrusted `personaBackupSchema` wire object into the canonical `PersonaBackup` (the inverse of
 * `buildPersonaBackup`). Validates the shape, applies `create`'s field defaults (`title` null, `starred`
 * false, `metadata` null), and narrows the metadata blob through `personaMetadataSchema` — the same coercion
 * `create`/`update` run at their write seam, now the ONE home for the backup format. Throws on an invalid
 * backup (our own strict format, unlike the tolerant ST card adapter). PURE.
 */
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
