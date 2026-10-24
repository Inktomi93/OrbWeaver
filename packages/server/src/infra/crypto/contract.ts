// Crypto adapter contracts and boot-secret provenance stay server-owned; no client consumes sealed material.

/** Where a boot secret comes from: the explicit env value, else a keyfile under `secretsDir` — but only for a
 *  local `file:` db, because the keyfile is the db's backup unit and a remote db has none on this disk. */
export interface BootSecretSource {
  readonly explicit: string | undefined;
  readonly databaseUrl: string;
  readonly secretsDir: string;
}

/** Where a keyfile notice goes (`keyfileReport` picks the sink for the build). */
export type KeyfileReport = (line: string) => void;

/** A boot secret after the env and the keyfile were consulted, before the db was. `resolved` carries the
 *  usable value or `null` (a remote db, a corrupt or unreadable keyfile, a bad explicit value) and the keyfile
 *  path when one was read. `absent` names a keyfile that does not exist yet and was NOT written. */
export type BootSecretResolution<T> =
  | { readonly kind: "resolved"; readonly value: T | null; readonly path: string | null }
  | { readonly kind: "absent"; readonly path: string };

/** Encrypted-blob shape (AES-256-GCM); stored on `user_credentials`. */
export interface Sealed {
  /** base64 ciphertext. */
  ciphertext: string;
  /** base64-encoded 12-byte IV (fresh per encrypt). */
  iv: string;
  /** base64 GCM auth tag. */
  tag: string;
}

/** The encryption seam for per-user credentials; constructed once at entry/ and injected into
 *  `credentials.context`. The box receives the `aad` VALUE from the credentials domain on each call. */
export interface SecretBox {
  /** false when no valid CREDENTIALS_KEY is configured → per-user credential storage is off. */
  readonly enabled: boolean;
  /** Seal `plaintext`, binding it to `aad`. Throws if the box is disabled. */
  encrypt: (plaintext: string, aad: string) => Sealed;
  /** Open a sealed value, verifying `aad`. Throws if disabled, or if the key/AAD/tag don't verify. */
  decrypt: (sealed: Sealed, aad: string) => string;
}
