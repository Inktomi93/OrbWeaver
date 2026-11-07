import { FIELD_LABEL, FIELD_STACK, tv } from "#lib";

// The grouped-controls skin — a reset <fieldset> (native border/padding/margin stripped) with a
// Legend styled like the field label (ui-package-design §5).
export const fieldsetVariants = tv({
  slots: {
    root: `m-0 ${FIELD_STACK} border-0 p-0 inline-full min-inline-0`,
    legend: `${FIELD_LABEL} data-disabled:opacity-disabled`,
  },
});
