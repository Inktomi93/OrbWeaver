// The two connection writes a role slot makes, homed below the features that render slots (Model roles, a
// rule's editor): bind a role for an actor, and patch a row (the slot's background repair). The connection
// verbs emit `connectionsChanged`; each still names its own invalidates so a dropped bus never leaves a slot stale.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type ConnectionView = inferOutput<Trpc["connection"]["get"]>;

const connectionReads = (trpc: Trpc): ReturnType<Trpc["connection"]["pathFilter"]>[] => [trpc.connection.pathFilter()];

/** A FIELD-WISE patch on one row (ground5 M6: never a GET→whole-blob PUT). */
export const useUpdateConnection = createEntityMutation<inferInput<Trpc["connection"]["update"]>, ConnectionView>({
  options: (trpc) => trpc.connection.update.mutationOptions(),
  invalidates: connectionReads,
  errorToast: "Couldn't save that connection.",
});

/** Write ONE binding for an actor — the caller's own `user` arm when `actor` is absent, else a rule's or a
 *  plugin's. `connectionId: null` clears it. */
export const useSetBinding = createEntityMutation<inferInput<Trpc["connection"]["setBinding"]>, unknown>({
  options: (trpc) => trpc.connection.setBinding.mutationOptions(),
  invalidates: connectionReads,
  errorToast: "Couldn't change that role.",
});
