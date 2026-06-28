// infra/crypto — front door. The sealed credential cipher + the boot key path. Pure node:crypto; reads
// foundation/env DOWN for the key/auto-key boot path. Constructed at entry/ and injected into the domains
// that need it (credentials ← SecretBox). The peppered session-token hasher RELOCATED to
// `domain/sessions/tokens/` (D38 — it is a sessions-resolution concern, not infra crypto). NEVER imports
// @orb/db or any domain (the sealed-executor invariant).

export {
  credentialsKeyFromEnv,
  dataDirFromDbUrl,
  decode32Bytes,
  loadOrCreateKeyfile,
  resolveAutoKey,
} from "./key";
export { createSecretBox, type Sealed, type SecretBox } from "./secrets";
