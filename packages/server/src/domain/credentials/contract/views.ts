// domain/credentials/contract/views — the credential read-models. `CredentialView` is a wire shape whose one
// home is `@orb/contracts/credentials` (its strict schema is the tRPC output parser); it is re-exported here
// type-only so the domain's verbs and service contract keep one import site. `toCredentialView` in
// persistence/queries.ts is its only producer.

export type { CredentialView } from "@orb/contracts/credentials";

/** The DEPLOYMENT's credential-storage capability (`storageStatus`) — `false` when no `CREDENTIALS_KEY` is
 *  configured, in which case every write verb refuses (`credentials_disabled`) and the UI must refuse the
 *  INPUT rather than collect a live secret into a form that cannot keep it. An object, not a bare boolean, so
 *  a future reason/remedy field is additive. */
export interface CredentialStorageStatus {
  readonly enabled: boolean;
}
