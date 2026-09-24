// The boot secrets' shapes: where a secret comes from, and what the pre-db phase resolved it to.

/** Where a boot secret comes from: the explicit env value, else a keyfile under `secretsDir` — but only for a
 *  local `file:` db, because the keyfile is the db's backup unit and a remote db has none on this disk. */
export interface BootSecretSource {
  readonly explicit: string | undefined;
  readonly databaseUrl: string;
  readonly secretsDir: string;
}

/** A boot secret after the env and the keyfile were consulted, before the db was. `resolved` carries the
 *  usable value or `null` (a remote db, a corrupt or unreadable keyfile, a bad explicit value) and the keyfile
 *  path when one was read. `absent` names a keyfile that does not exist yet and was NOT written. */
export type BootSecretResolution<T> =
  | { readonly kind: "resolved"; readonly value: T | null; readonly path: string | null }
  | { readonly kind: "absent"; readonly path: string };
