// The Connections pane's mutations, one createEntityMutation per verb. The connection verbs emit
// `connectionsChanged` on the user bus (the invalidation map refetches `connection.*`), and the credential
// verbs emit `credentialsChanged`; each still names its own invalidates so a dropped bus stream never leaves
// the pane stale. The secret never round-trips: `credentials.add` takes the plaintext key, list returns the
// redacted view.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type ConnectionView = inferOutput<Trpc["connection"]["get"]>;
type DraftModelListing = inferOutput<Trpc["connection"]["draftCatalogModels"]>;
type CredentialView = inferOutput<Trpc["credentials"]["add"]>;

const connectionReads = (trpc: Trpc): ReturnType<Trpc["connection"]["pathFilter"]>[] => [trpc.connection.pathFilter()];

const createConnectionOptions = (trpc: Trpc): ReturnType<Trpc["connection"]["create"]["mutationOptions"]> => trpc.connection.create.mutationOptions();

/** Create a connection row (label auto-minted server-side when omitted). */
export const useCreateConnection = createEntityMutation<inferInput<Trpc["connection"]["create"]>, ConnectionView>({
  options: createConnectionOptions,
  invalidates: connectionReads,
  errorToast: "Couldn't add that connection.",
});

/** The add dialog's create. No toast: the dialog states every failure of its submit inline, in the
 *  dialog, because a toast sits under the modal's scrim and a second one says the same thing again. */
export const useCreateConnectionOwned = createEntityMutation<inferInput<Trpc["connection"]["create"]>, ConnectionView>({
  options: createConnectionOptions,
  invalidates: connectionReads,
});

/** A FIELD-WISE patch on one row (ground5 M6: never a GET→whole-blob PUT). */
export const useUpdateConnection = createEntityMutation<inferInput<Trpc["connection"]["update"]>, ConnectionView>({
  options: (trpc) => trpc.connection.update.mutationOptions(),
  invalidates: connectionReads,
  errorToast: "Couldn't save that connection.",
});

/** Delete a row — every binding on it SET-NULLs to `no-connection`; history keeps its attribution. */
export const useRemoveConnection = createEntityMutation<inferInput<Trpc["connection"]["remove"]>, unknown>({
  options: (trpc) => trpc.connection.remove.mutationOptions(),
  invalidates: connectionReads,
  errorToast: "Couldn't remove that connection.",
});

/** Write ONE `user` binding (`connectionId: null` clears it). */
export const useSetBinding = createEntityMutation<inferInput<Trpc["connection"]["setBinding"]>, unknown>({
  options: (trpc) => trpc.connection.setBinding.mutationOptions(),
  invalidates: connectionReads,
  errorToast: "Couldn't change that role.",
});

/** §5.3a's one-click survivor: write every compatible `user` binding to this row at once. */
export const useUseForEverything = createEntityMutation<inferInput<Trpc["connection"]["useForEverything"]>, unknown>({
  options: (trpc) => trpc.connection.useForEverything.mutationOptions(),
  invalidates: connectionReads,
  errorToast: "Couldn't apply that connection to your roles.",
});

/** The add dialog's model list for a draft that has no row yet (§7.4): an endpoint's SERVER-SIDE
 *  `GET <baseUrl>/v1/models`, or the built-in provider's own list. A failed dial is the typed-id fallback WITH
 *  its reason and never throws; what does throw is a refusal before the dial (a URL that is not http(s), a
 *  private address this deployment does not admit, a key that is not the caller's), which the toast names
 *  while the picker shows the same message inline. */
export const useDraftCatalogModels = createEntityMutation<inferInput<Trpc["connection"]["draftCatalogModels"]>, DraftModelListing>({
  // `gcTime: 0` for the same reason as `useAddCredential`: the variables can carry a draft key.
  options: (trpc) => ({ ...trpc.connection.draftCatalogModels.mutationOptions(), gcTime: 0 }),
  invalidates: () => [],
  errorToast: "Couldn't list that provider's models.",
});

/** `gcTime: 0`: the mutation cache keeps a settled mutation's VARIABLES — here the plaintext key — for the
 *  default five minutes after its form unmounts, so this one is dropped the moment nothing observes it. */
const addCredentialOptions = (trpc: Trpc): ReturnType<Trpc["credentials"]["add"]["mutationOptions"]> => ({
  ...trpc.credentials.add.mutationOptions(),
  gcTime: 0,
});

/** Add a provider key (plaintext key in, redacted row out). */
export const useAddCredential = createEntityMutation<inferInput<Trpc["credentials"]["add"]>, CredentialView>({
  options: addCredentialOptions,
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't save that key — check the value and try again.",
});

/** The add dialog's key mint — `useCreateConnectionOwned`'s twin: the dialog states the failure inline. */
export const useAddCredentialOwned = createEntityMutation<inferInput<Trpc["credentials"]["add"]>, CredentialView>({
  options: addCredentialOptions,
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
});

/** The USER-FACING revoke (invariant #6) — the user pre-empts the next turn's 401 when they know a key was
 *  rotated/leaked. */
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

/** The editor's reachability check (§5.3a's Diagnostics tier). A `.mutation()` despite being read-shaped —
 *  it DIALS a user-supplied endpoint, so it keeps the CSRF gate tRPC applies to mutations (the router's
 *  esoteric #9). Invalidates nothing: the verdict is the mutation's own data, not a cached read. */
export const useProbeConnection = createEntityMutation<inferInput<Trpc["connection"]["probe"]>, inferOutput<Trpc["connection"]["probe"]>>({
  options: (trpc) => trpc.connection.probe.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't reach that server.",
});

/** The inline "Admit `<host>`" write (§5.3a) — the deployment's private-endpoint allowlist, OWNER-gated at
 *  the verb (`domain/settings/verbs/app-settings.ts::OWNER_GATED_FIELDS`). It lives here rather than being
 *  imported from `features/user-admin`: a feature imports no other feature (UI-Arch §2.1), and the
 *  cross-domain read rides `trpc.settings.*` like every other. */
export const useAdmitPrivateEndpoint = createEntityMutation<
  inferInput<Trpc["settings"]["updateAppSettings"]>,
  inferOutput<Trpc["settings"]["updateAppSettings"]>
>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.pathFilter()],
  errorToast: "Couldn't admit that host — only the box owner can change the allowed endpoints.",
});

/** Remove a stored credential (deletes the row + its secret material); connections on it read `no-connection`. */
export const useRemoveCredential = createEntityMutation<inferInput<Trpc["credentials"]["remove"]>, unknown>({
  options: (trpc) => trpc.credentials.remove.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter(), trpc.connection.pathFilter()],
  errorToast: "Couldn't remove the key.",
});
