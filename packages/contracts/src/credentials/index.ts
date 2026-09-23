// The credential cross-boundary wire surface — home of the provider-source axis and the
// brand-protected `ResolvedCredential` the `infra/providers` runners consume.
// Two axes: CredentialSource is the DISPATCH axis (resolver+runner arm); CredentialProvider is the
// broader STORAGE axis (a row may persist with no resolver arm yet).
// AES-256-GCM AAD invariant: at-rest ciphertext is bound to `${userId}|${provider}`, so CRED_PROVIDERS
// must stay byte-stable. The BYO model profile is the flat `model`/`contextWindow` metadata pair (no
// nested `CustomModelProfile` type — the runner reads the resolved `ModelCapability`, never a
// baked profile object); the per-endpoint request/response transforms are `includeBody`/`excludeBody`/
// `responseMap`.

import type { UserCredentialId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { providerIdSchema } from "#inference";

// Dispatch axis: every member needs a resolver arm + an infra/providers runner (tsc's assertNever
// red-flags a gap). `@orb/contracts/connection` re-exports this verbatim (under its own name).
/** WHAT KIND of secret a row seals, spelled from the provider row's `auth` (inference program §8.4-1): the
 *  metadata union is keyed on it. An `endpoint` row's transforms (headers / includeBody / excludeBody /
 *  responseMap) are NOT here any more — they are the CONNECTION's `transport` column (§5.3); a credential row
 *  is a sealed secret with a label, and connections give it meaning. `.nullable()`: most rows carry none. */
export const providerMetadataSchema = z
  .discriminatedUnion("auth", [
    z.object({ auth: z.literal("apiKey") }).loose(),
    z.object({ auth: z.literal("oauthToken") }).loose(),
    /** An `auth: endpoint` row's OPTIONAL bearer (`vllm --api-key`, a proxied Ollama); the plaintext is the key. */
    z.object({ auth: z.literal("endpoint") }).loose(),
  ])
  .nullable();
/** Provider-specific metadata, inferred from the schema so the type and the runtime gate can't drift. */
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;
/** Parse a raw `metadata` column value into the typed shape, or `null` when it matches no arm. */
export function parseProviderMetadata(raw: unknown): ProviderMetadata {
  const parsed = providerMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
/** Result of a credential health probe; `throttled` is a domain-only state the provider can't see.
 *
 *  `ok` is an EARNED green — it means a probe went out and the credential was accepted, nothing else.
 *  `unchecked` is the honest answer when no such probe happened or its answer did not classify: a provider
 *  with no probe arm (SID-01 — the verb used to report a bare `ok` for those, so "Test" was green for a
 *  credential nobody had ever dialled), a row with no usable endpoint metadata, or a reachable endpoint
 *  answering a non-auth non-2xx. `unchecked` carries NO revocation/strike side-effect — it is not a
 *  failure, it is the absence of a verdict, and it must never be rendered as a pass. */
export type CredentialHealth =
  | { status: "ok"; checkedAt: number }
  | { status: "revoked"; checkedAt: number; reason: string }
  | { status: "unreachable"; checkedAt: number; reason: string }
  | { status: "throttled"; checkedAt: number }
  | { status: "unchecked"; checkedAt: number; reason: string };

/** WHY a credential is revoked — the ONE home of the vocabulary (`user_credentials.revoked_reason` derives
 *  its enum from this tuple, and `CredentialView` carries the member to the Connections pane). Read together
 *  with `revokedAt`: a null reason on a live row is "not revoked", never "revoked for an unknown cause" —
 *  every writer of `revokedAt` names its reason in the same statement (`setRevokedById` takes it as a
 *  required argument, so tsc enumerates the writer set).
 *
 *  The members are the three DISTINCT facts the user is owed, and they must not be collapsed: an
 *  `auth_failed` says the provider looked at the key and rejected it; `unreachable` says the endpoint never
 *  answered (the health probe's strike limit — evidence about a box being off, NOT about the key); `user`
 *  says the owner revoked it themselves. Telling someone "the provider rejected your key" when nothing ever
 *  answered is the exact product lie the honest `unchecked` health arm already exists to prevent. */
export const CRED_REVOKED_REASONS = ["auth_failed", "unreachable", "user"] as const;
export type CredRevokedReason = (typeof CRED_REVOKED_REASONS)[number];

/** The credential read-model the `credentials.list`/`credentials.add` procedures return. It never carries a
 *  secret column (`ciphertext`/`iv`/`tag`) or the plaintext key; `toCredentialView` in the credentials domain
 *  is its only producer. STRICT, and installed as those procedures' tRPC output parser: an extra key fails the
 *  call as an internal error instead of reaching the browser or being stripped without a trace. */
export const credentialViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.userCredential),
  /** The provider REGISTRY id the key was sealed for (half the AAD). */
  provider: providerIdSchema,
  /** Nullable at the column; add always writes one (default "default"). */
  label: z.string().nullable(),
  revokedAt: z.number().nullable(),
  /** WHY it was revoked, so the Connections pane can say which of the three things happened instead of a
   *  bare Revoked chip. Non-null exactly when `revokedAt` is (both are written in one statement and cleared
   *  together) — a null here on a revoked row means a writer bypassed `setRevokedById`, and the surface
   *  renders NOTHING rather than guessing a cause. */
  revokedReason: z.enum(CRED_REVOKED_REASONS).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type CredentialView = z.infer<typeof credentialViewSchema>;

// Phantom `unique symbol` brand: an arbitrary `{ source, ... }` literal can't satisfy it, so the ONLY
// way to produce a `ResolvedCredential` is the domain `resolve.ts` factory's encapsulated cast.
declare const secretBrand: unique symbol;

/** WHAT the secret is, spelled from the provider row's `auth`: an API key, a pasted `claude setup-token`,
 *  an optional bearer for an `auth: endpoint` row, or nothing (`auth: none` / an open box). */
export const RESOLVED_SECRET_KINDS = ["apiKey", "oauthToken", "bearer", "none"] as const;
export type ResolvedSecretKind = (typeof RESOLVED_SECRET_KINDS)[number];

/** The decrypted secret a resolved connection carries. Brand-protected for the same reason
 *  the retired `ResolvedCredential` union was: the ONLY producer is the credentials domain's resolve factory, so a
 *  `{ secret: "…" }` literal cannot impersonate a row that was actually decrypted under its AAD.
 *  `credentialId` is `null` and `kind` is `none` exactly together. */
export interface ResolvedSecret {
  readonly [secretBrand]: true;
  readonly credentialId: UserCredentialId | null;
  readonly kind: ResolvedSecretKind;
  readonly secret: string | null;
}
