// The saved-KEY library CRUD mutations (Settings → Connections → Saved keys), one `createEntityMutation`
// per verb — the same module-scope factory pattern as use-tag-settings-mutations.ts. The credentials
// verbs are NOT chat events (no user-bus emit), so each carries its own `invalidates` refetching
// `credentials.list` (the pane's only read). The secret NEVER round-trips: `add` takes the plaintext key,
// but `list` returns the redacted `CredentialView` (no ciphertext/key), so the surface renders only
// metadata (05-observability §5 — never render a credential secret).

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

/** Probe a credential's live health (an outbound provider call — a `.mutation()` for the CSRF gate,
 *  credentials-router esoteric #9). Its own instance so the health result/error stays per-row. */
export const useTestCredentialHealth = createEntityMutation<
  inferInput<Trpc["credentials"]["testHealth"]>,
  CredentialHealth
>({
  options: (trpc) => trpc.credentials.testHealth.mutationOptions(),
  invalidates: (trpc) => [trpc.credentials.list.pathFilter()],
  errorToast: "Couldn't reach that provider.",
});

/** Probe a custom-endpoint's `/models` (an outbound SSRF-surfaced call — a `.mutation()` for the CSRF gate,
 *  esoteric #9). Best-effort: the verb returns `[]` on any failure (never throws), so no errorToast — a `[]`
 *  keeps the picker's free-text row usable. Used BOTH by the custom model picker (on open, by `credentialId`)
 *  and the add-dialog's pre-save draft check (by `draft`). No `invalidates`: it reads nothing cached. */
export const useFetchModels = createEntityMutation<
  inferInput<Trpc["credentials"]["fetchModels"]>,
  string[]
>({
  options: (trpc) => trpc.credentials.fetchModels.mutationOptions(),
  // Reads nothing cached — a probe of the live endpoint returned to the caller's own state.
  invalidates: () => [],
});
