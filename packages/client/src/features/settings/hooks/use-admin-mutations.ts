// The Admin pane's mutations, one createEntityMutation per verb. None are busDriven: the admin verbs act
// on other users' rows so the actor's own bus never carries them, so each self-invalidates its read on
// settle.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Mint a loginable local human (handle + password + role). Invalidates the user table. */
export const useCreateUser = createEntityMutation<inferInput<Trpc["admin"]["createUser"]>, unknown>(
  {
    options: (trpc) => trpc.admin.createUser.mutationOptions(),
    invalidates: (trpc) => [trpc.admin.listUsers.queryFilter()],
    errorToast: "Couldn't create the user — that handle may already be taken.",
  },
);

/** Grant/revoke the delegated `admin` role (owner-only server-side — `requireOwner`). */
export const useSetRole = createEntityMutation<inferInput<Trpc["admin"]["setRole"]>, unknown>({
  options: (trpc) => trpc.admin.setRole.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listUsers.queryFilter()],
  errorToast: "Couldn't change the role.",
});

/** Enable/disable an account (disable also revokes the target's live sessions server-side). */
export const useSetEnabled = createEntityMutation<inferInput<Trpc["admin"]["setEnabled"]>, unknown>(
  {
    options: (trpc) => trpc.admin.setEnabled.mutationOptions(),
    invalidates: (trpc) => [
      trpc.admin.listUsers.queryFilter(),
      trpc.admin.listSessions.pathFilter(),
    ],
    errorToast: "Couldn't change the account's enabled state.",
  },
);

/** Set a user's local password (revokes all of their live sessions server-side). */
export const useResetPassword = createEntityMutation<
  inferInput<Trpc["admin"]["resetPassword"]>,
  unknown
>({
  options: (trpc) => trpc.admin.resetPassword.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't reset the password.",
});

/** Revoke ONE session (the per-device kick). */
export const useRevokeSession = createEntityMutation<
  inferInput<Trpc["admin"]["revokeSession"]>,
  unknown
>({
  options: (trpc) => trpc.admin.revokeSession.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't revoke the session.",
});

/** Revoke EVERY live session for a user (the kick-all sweep). */
export const useRevokeUserSessions = createEntityMutation<
  inferInput<Trpc["admin"]["revokeUserSessions"]>,
  unknown
>({
  options: (trpc) => trpc.admin.revokeUserSessions.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.listSessions.pathFilter()],
  errorToast: "Couldn't revoke the sessions.",
});

/** Bounce a vLLM engine through the supervisor (PD-3). Resolves to a human status line. */
export const useRestartEngine = createEntityMutation<
  inferInput<Trpc["admin"]["restartVllmEngine"]>,
  string
>({
  options: (trpc) => trpc.admin.restartVllmEngine.mutationOptions(),
  invalidates: (trpc) => [trpc.admin.vllmEngines.queryFilter()],
  errorToast: "Couldn't restart the engine.",
});
