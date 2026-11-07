import { cn, tv, FIELD_LABEL, FIELD_STACK } from "#lib";

export const a = tv({
  slots: {
    // The whole string is the cluster, in the token order the constant does not use.
    bare: FIELD_STACK,
    // The cluster with a neighbour on either side.
    after: `${FIELD_STACK} inline-full`,
    before: `relative ${FIELD_STACK}`,
    label: `${FIELD_LABEL} data-disabled:opacity-disabled`,
    // A multi-line template keeps the lines around the run.
    block: `
      relative ${FIELD_STACK} overflow-hidden
      p-field
    `,
    onlyRun: FIELD_STACK,
    withSubstitution: `flex ${cn("a")} flex-col gap-field p-field`,
    both: `${FIELD_STACK} ${FIELD_LABEL}`,
  },
});
