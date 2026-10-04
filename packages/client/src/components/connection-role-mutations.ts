// The two connection writes a role slot makes, homed below the features that render slots (Model roles, a
// rule's editor): bind a role for an actor, and patch a row (the slot's background repair). The connection
// verbs emit `connectionsChanged`; each still names its own invalidates so a dropped bus never leaves a slot stale.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { connectionWriteReads, createEntityMutation } from "#data";
import { embedRefusalOf } from "#lib";

/** The toast for a failed connection write, except an embedder refusal, which the control that made it says inline. */
function unlessEmbedRefusal(toast: string): (error: unknown) => string | null {
  return (error) => (embedRefusalOf(error) === null ? toast : null);
}

type ConnectionView = inferOutput<Trpc["connection"]["get"]>;

/** A FIELD-WISE patch on one row (ground5 M6: never a GET→whole-blob PUT). */
export const useUpdateConnection = createEntityMutation<inferInput<Trpc["connection"]["update"]>, ConnectionView>({
  options: (trpc) => trpc.connection.update.mutationOptions(),
  invalidates: connectionWriteReads,
  errorToast: unlessEmbedRefusal("Couldn't save that connection."),
});

/** Write ONE binding for an actor — the caller's own `user` arm when `actor` is absent, else a rule's or a
 *  plugin's. `connectionId: null` clears it. */
export const useSetBinding = createEntityMutation<inferInput<Trpc["connection"]["setBinding"]>, unknown>({
  options: (trpc) => trpc.connection.setBinding.mutationOptions(),
  invalidates: connectionWriteReads,
  errorToast: unlessEmbedRefusal("Couldn't change that role."),
});
