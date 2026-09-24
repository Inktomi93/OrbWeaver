// infra/crypto — front door. The sealed credential cipher + the boot secrets path. Pure node:crypto; reads
// foundation/env DOWN for the explicit keys and the db location. Constructed at entry/ and injected into the
// domains that need it (credentials ← SecretBox; sessions ← the SESSION_SECRET pepper). The peppered
// session-token hasher RELOCATED to `domain/sessions/tokens/` (D38 — it is a sessions-resolution concern,
// not infra crypto). NEVER imports @orb/db or any domain (the sealed-executor invariant).

export {
  credentialsKeyFromEnv,
  dataDirFromDbUrl,
  decode32Bytes,
  loadOrCreateKeyfile,
  SESSION_SECRET_KEYFILE,
  sessionSecretFromEnv,
} from "./key.ts";
export { createSecretBox, type Sealed, type SecretBox } from "./secrets.ts";
