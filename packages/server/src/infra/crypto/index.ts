// infra/crypto — front door. The sealed credential cipher, the boot secrets path, and the replaced owner-only secret
// files (the IP certificate's, D269). node:crypto and node:fs only; reads foundation/env DOWN for the explicit
// keys and the secrets dir. Constructed at entry/ and injected into the domains that need it (credentials ←
// SecretBox; sessions ← the SESSION_SECRET pepper). The peppered session-token hasher RELOCATED to `domain/sessions/tokens/` (D38 — it is a sessions-resolution concern,
// not infra crypto). NEVER imports @orb/db or any domain (the sealed-executor invariant).

export type { BootSecretResolution, BootSecretSource } from "./contract.ts";
export { bootSecretProvenance, decode32Bytes, loadOrCreateKeyfile, readSessionSecretKeyfile, resolveCredentialsKey, resolveSessionSecret } from "./key.ts";
export { readSecretFile, removeSecretFile, writeSecretFile } from "./secret-file.ts";
export { createSecretBox, type Sealed, type SecretBox } from "./secrets.ts";
