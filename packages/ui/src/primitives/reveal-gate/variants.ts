import { FOCUS_RING, tv } from "#lib";

/**
 * Slot classes for the reveal-gate (ui-package-design §6.1 / work-order #17). This is a
 * shared-screen PRIVACY primitive, not a disclosure/density control (`@orb/ui/collapsible` is that
 * job): pre-reveal the placeholder is a neutral masked panel carrying the Reveal trigger;
 * post-reveal the content sits above an optional Hide trigger.
 */
export const revealGateVariants = tv({
  slots: {
    root: "flex flex-col gap-field",
    placeholder: "flex items-center gap-row rounded-control border border-dashed border-border bg-muted p-row text-muted-foreground",
    trigger: `inline-flex cursor-pointer items-center gap-field rounded-control text-label leading-label font-medium text-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo hover:text-primary disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`,
    // tabIndex={-1} focus target when !hideable — no visible focus ring of its own (the reveal
    // already gave the user the result; this is a silent landing spot, not a control).
    content: "flex flex-col items-start gap-field outline-none",
    hideTrigger: `inline-flex cursor-pointer items-center gap-field self-start text-label leading-label text-muted-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`,
    srOnly: "sr-only",
  },
});
