// The saved-key library CRUD mutations, one createEntityMutation per verb. The credentials verbs emit no
// user-bus event, so each carries its own invalidates refetching credentials.list. The secret never
// round-trips: add takes the plaintext key, but list returns the redacted view.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Add a provider key (plaintext key in, redacted row out). Refetches `credentials.list`. */
export const useAddCredential = createEntityMutation<inferInput<Trpc["credentials"]["add"]>, unknown>({
  options: (trpc) => trpc.credentials.add.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't save that key — check the value and try again.",
});

/** The USER-FACING revoke (invariant #6) — the user pre-empts the next turn's 401 when they know a key was
 *  rotated/leaked. Flips `revoked_at`; refetches `credentials.list`. */
export const useMarkRevokedByUser = createEntityMutation<inferInput<Trpc["credentials"]["markRevokedByUser"]>, unknown>({
  options: (trpc) => trpc.credentials.markRevokedByUser.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't mark the key revoked.",
});

/** Clear a transient/stale revoked flag — the user overrides the auto-revoke when the key is valid again. */
export const useClearRevokedCredential = createEntityMutation<inferInput<Trpc["credentials"]["clearRevoked"]>, unknown>({
  options: (trpc) => trpc.credentials.clearRevoked.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't clear the revoked flag.",
});

/** Make a stored credential the ACTIVE one for its provider (one active per provider). */
export const useSetActiveCredential = createEntityMutation<inferInput<Trpc["credentials"]["setActive"]>, unknown>({
  options: (trpc) => trpc.credentials.setActive.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't switch the active key.",
});

/** Remove a stored credential (deletes the row + its secret material). */
export const useRemoveCredential = createEntityMutation<inferInput<Trpc["credentials"]["remove"]>, unknown>({
  options: (trpc) => trpc.credentials.remove.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't remove the key.",
});

/** Probe a credential's live health. Its own instance so the health result/error stays per-row. */
export const useTestCredentialHealth = createEntityMutation<inferInput<Trpc["credentials"]["testHealth"]>, CredentialHealth>({
  options: (trpc) => trpc.credentials.testHealth.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't reach that provider.",
});

/** Probe a custom-endpoint's `/models`. Best-effort — returns `[]` on failure, never throws, so no errorToast. */
export const useFetchModels = createEntityMutation<inferInput<Trpc["credentials"]["fetchModels"]>, string[]>({
  options: (trpc) => trpc.credentials.fetchModels.mutationOptions(),
  invalidates: () => [],
});

/** Send the ACTUAL shaped round-trip to a custom endpoint and return the redacted request + raw response
 *  (the "Test endpoint" inspector, distinct from the /models reachability probe). The verb resolves a
 *  transport failure into a `response: null` inspection rather than throwing, so a red result still renders;
 *  the errorToast covers only the domain refusals (no such credential / not a custom endpoint). */
export const useInspectEndpoint = createEntityMutation<inferInput<Trpc["credentials"]["inspectEndpoint"]>, EndpointInspection>({
  options: (trpc) => trpc.credentials.inspectEndpoint.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't run the endpoint test — check the saved endpoint.",
});
