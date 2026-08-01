// The Admin pane's mutations, one createEntityMutation per verb. None are busDriven: the admin verbs act
// on other users' rows so the actor's own bus never carries them, so each self-invalidates its read on
// settle.

import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Mint a loginable local human (handle + password + role). Invalidates the user table. */
export const useCreateUser = createEntityMutation<inferInput<Trpc["admin"]["createUser"]>, unknown>({
  options: (trpc) => trpc.admin.createUser.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listUsers.queryFilter()],
  errorToast: "Couldn't create the user — that handle may already be taken.",
});

/** Grant/revoke the delegated `admin` role (owner-only server-side — `requireOwner`). */
export const useSetRole = createEntityMutation<inferInput<Trpc["admin"]["setRole"]>, unknown>({
  options: (trpc) => trpc.admin.setRole.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listUsers.queryFilter()],
  errorToast: "Couldn't change the role.",
});

/** Enable/disable an account (disable also revokes the target's live sessions server-side). */
export const useSetEnabled = createEntityMutation<inferInput<Trpc["admin"]["setEnabled"]>, unknown>({
  options: (trpc) => trpc.admin.setEnabled.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listUsers.queryFilter(), trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't change the account's enabled state.",
});

/** Set a user's local password (revokes all of their live sessions server-side). */
export const useResetPassword = createEntityMutation<inferInput<Trpc["admin"]["resetPassword"]>, unknown>({
  options: (trpc) => trpc.admin.resetPassword.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't reset the password.",
});

/** Revoke ONE session (the per-device kick). */
export const useRevokeSession = createEntityMutation<inferInput<Trpc["admin"]["revokeSession"]>, unknown>({
  options: (trpc) => trpc.admin.revokeSession.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't revoke the session.",
});

/** Revoke EVERY live session for a user (the kick-all sweep). */
export const useRevokeUserSessions = createEntityMutation<inferInput<Trpc["admin"]["revokeUserSessions"]>, unknown>({
  options: (trpc) => trpc.admin.revokeUserSessions.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't revoke the sessions.",
});

/** Bounce a vLLM engine through the supervisor (PD-3). Resolves to a human status line. */
export const useRestartEngine = createEntityMutation<inferInput<Trpc["admin"]["restartVllmEngine"]>, string>({
  options: (trpc) => trpc.admin.restartVllmEngine.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.vllmEngines.queryFilter()],
  errorToast: "Couldn't restart the engine.",
});

/** Save the vLLM engine LAUNCH config (a partial AppSettings.engineLaunch patch, #14). Rides the SAME
 *  admin-gated settings.updateAppSettings path (which stamps the schema version) — no new subsystem. The
 *  new flags apply only on the NEXT engine restart, so the surface shows a "restart to apply" affordance. */
export const useUpdateAppSettings = createEntityMutation<{ readonly partial: AppSettings }, EffectiveAppConfig>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getAppSettings.queryFilter()],
  errorToast: "Couldn't save the engine launch config.",
});

/** Write an AppSettings-override PATCH from an admin settings SECTION (Phase B ③: memory tuning, summarizer,
 *  rate limits). Same admin-gated `updateAppSettings` path; a field value = an override, `null` = clear it
 *  to the floor. Invalidates BOTH admin reads — `getAppSettings` (the engine-launch surface) AND
 *  `getAppSettingsWithOverrides` (these sections' floor-vs-override read). */
export const useUpdateAppOverrides = createEntityMutation<{ readonly partial: AppSettings }, EffectiveAppConfig>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getAppSettings.queryFilter(), trpc.settings.getAppSettingsWithOverrides.queryFilter()],
  errorToast: "Couldn't save the setting.",
});

/** Refresh the OpenRouter model catalog (fetch `/models` → write the KV snapshot, warm the cache).
 *  Invalidates the reads that actually DERIVE from the snapshot — the picker facade and the capability
 *  descriptor — not `getCatalog` (no client consumer; that proc's client-side value is the server-side
 *  cache warm). */
export const useRefreshCatalog = createEntityMutation<inferInput<Trpc["connection"]["refreshCatalog"]>, unknown>({
  options: (trpc) => trpc.connection.refreshCatalog.mutationOptions(),
  invalidates: (trpc) => [trpc.connection.getModelsForSource.queryFilter(), trpc.connection.resolveChatCapability.queryFilter()],
  errorToast: "Couldn't refresh the model catalog.",
});

/** Refresh the agent-SDK daemon model catalog (run `supportedModels()` → write the KV snapshot).
 *  Same targets as the OR refresh: the picker facade + capability read both snapshots. */
export const useRefreshAgentSdkCatalog = createEntityMutation<inferInput<Trpc["connection"]["refreshAgentSdkCatalog"]>, unknown>({
  options: (trpc) => trpc.connection.refreshAgentSdkCatalog.mutationOptions(),
  invalidates: (trpc) => [trpc.connection.getModelsForSource.queryFilter(), trpc.connection.resolveChatCapability.queryFilter()],
  errorToast: "Couldn't refresh the agent-SDK catalog.",
});

/** PD-90 — the inline single-card embed (admin-only; drives the GPU embed engine). Reconciles nothing;
 *  the caller renders the returned ok inline. */
export const useEmbedCharacterCard = createEntityMutation<inferInput<Trpc["admin"]["embedCharacterCard"]>, { readonly ok: true }>({
  options: (trpc) => trpc.admin.embedCharacterCard.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't embed the card — check the character id.",
});
