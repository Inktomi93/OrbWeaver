// domain/settings/contract/portability — the RETURN SHAPES for the settings-domain portable entities (theme +
// user-settings) export/import verbs. These STRUCTURALLY MATCH the `@orb/contracts/portability` PortableFile /
// PortableImportOutcome the delivery core consumes, but this file deliberately does NOT import that contract:
// the entity-agnostic registry + its contract are composed at the entry root (which adapts these shapes into a
// `PortableEntity` descriptor). Pure types (no zod) — no `.contract.test.ts` needed.

/** One exported portable file: its relative filename + the serialized bytes (matches `PortableFile`). */
export interface SettingsPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** The outcome of importing ONE portable file (matches `PortableImportOutcome`) — never throws for a malformed
 *  file, so one bad entry can't abort a bundle. `created`: true iff the import produced a NEW row (false =
 *  deduped / an idempotent merge into an existing singleton). `error` set only when `ok` is false. */
export interface SettingsImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}
