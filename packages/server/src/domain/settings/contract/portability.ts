// domain/settings/contract/portability — return shapes for the settings-domain portable entities (theme +
// user-settings) export/import verbs. These structurally match @orb/contracts/portability's PortableFile/
// PortableImportOutcome but this file deliberately does not import that contract — the entity-agnostic
// registry is composed at the entry root.

export interface SettingsPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** Never throws for a malformed file, so one bad entry can't abort a bundle. */
export interface SettingsImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}
