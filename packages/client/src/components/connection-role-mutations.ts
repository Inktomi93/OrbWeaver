// The two connection writes a role slot makes, homed below the features that render slots (Model roles, a
// rule's editor): bind a role for an actor, and patch a row (the slot's background repair). The connection
// verbs emit `connectionsChanged`; each still names its own invalidates so a dropped bus never leaves a slot stale.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { connectionWriteReads, createEntityMutation } from "#data";
import { connectionBindingRefusalOf, connectionFieldRefusalOf, embedRefusalOf } from "#lib";

/** The toast for a failed connection edit, except a refusal the editor says on its own field: an embedder refusal under
 *  the row that made it, any other field refusal under the field that holds the fix. A refusal no one field holds (the
 *  connection is gone) says so in the toast. */
function unlessSaidOnField(toast: string): (error: unknown) => string | null {
  return (error) => {
    if (embedRefusalOf(error) !== null) {
      return null;
    }
    const refusal = connectionFieldRefusalOf(error);
    if (refusal === null) {
      return toast;
    }
    return refusal.target === "connection" ? refusal.copy : null;
  };
}

/** The toast for a failed role binding: an embedder refusal is said under the control that made it, a binding refusal
 *  says why this connection cannot take the role, and any other failure is the generic line. */
function bindingToast(toast: string): (error: unknown) => string | null {
  return (error) => (embedRefusalOf(error) === null ? (connectionBindingRefusalOf(error) ?? toast) : null);
}

type ConnectionView = inferOutput<Trpc["connection"]["get"]>;

/** A FIELD-WISE patch on one row (ground5 M6: never a GET→whole-blob PUT). */
export const useUpdateConnection = createEntityMutation<inferInput<Trpc["connection"]["update"]>, ConnectionView>({
  options: (trpc) => trpc.connection.update.mutationOptions(),
  invalidates: connectionWriteReads,
  errorToast: unlessSaidOnField("Couldn't save that connection."),
});

/** Write ONE binding for an actor — the caller's own `user` arm when `actor` is absent, else a rule's or a
 *  plugin's. `connectionId: null` clears it. */
export const useSetBinding = createEntityMutation<inferInput<Trpc["connection"]["setBinding"]>, unknown>({
  options: (trpc) => trpc.connection.setBinding.mutationOptions(),
  invalidates: connectionWriteReads,
  errorToast: bindingToast("Couldn't change that role."),
});
