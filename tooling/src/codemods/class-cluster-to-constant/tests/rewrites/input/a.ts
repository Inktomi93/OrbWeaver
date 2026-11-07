import { cn, tv } from "#lib";

export const a = tv({
  slots: {
    // The whole string is the cluster, in the token order the constant does not use.
    bare: "gap-field flex flex-col",
    // The cluster with a neighbour on either side.
    after: "flex flex-col gap-field inline-full",
    before: "relative flex flex-col gap-field",
    label: "text-label leading-label font-medium text-foreground data-disabled:opacity-disabled",
    // A multi-line template keeps the lines around the run.
    block: `
      relative flex flex-col gap-field overflow-hidden
      p-field
    `,
    onlyRun: `
      flex flex-col gap-field
    `,
    withSubstitution: `flex ${cn("a")} flex-col gap-field p-field`,
    both: "flex flex-col gap-field font-medium text-label leading-label text-foreground",
  },
});
