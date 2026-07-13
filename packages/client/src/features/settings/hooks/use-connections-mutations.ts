// The saved-key library CRUD mutations, one createEntityMutation per verb. The credentials verbs emit no
// user-bus event, so each carries its own invalidates refetching credentials.list. The secret never
// round-trips: add takes the plaintext key, but list returns the redacted view.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Add a provider key (plaintext key in, redacted row out). Refetches `credentials.list`. */
export const useAddCredential = createEntityMutation<
  inferInput<Trpc["credentials"]["add"]>,
  unknown
>({
  options: (trpc) => trpc.credentials.add.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't save that key — check the value and try again.",
});

/** Make a stored credential the ACTIVE one for its provider (one active per provider). */
export const useSetActiveCredential = createEntityMutation<
  inferInput<Trpc["credentials"]["setActive"]>,
  unknown
>({
  options: (trpc) => trpc.credentials.setActive.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't switch the active key.",
});

/** Remove a stored credential (deletes the row + its secret material). */
export const useRemoveCredential = createEntityMutation<
  inferInput<Trpc["credentials"]["remove"]>,
  unknown
>({
  options: (trpc) => trpc.credentials.remove.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't remove the key.",
});

/** Probe a credential's live health. Its own instance so the health result/error stays per-row. */
export const useTestCredentialHealth = createEntityMutation<
  inferInput<Trpc["credentials"]["testHealth"]>,
  CredentialHealth
>({
  options: (trpc) => trpc.credentials.testHealth.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't reach that provider.",
});

/** Probe a custom-endpoint's `/models`. Best-effort — returns `[]` on failure, never throws, so no errorToast. */
export const useFetchModels = createEntityMutation<
  inferInput<Trpc["credentials"]["fetchModels"]>,
  string[]
>({
  options: (trpc) => trpc.credentials.fetchModels.mutationOptions(),
  invalidates: () => [],
});
