import { tv } from "#lib";

// A chip that floats over the transcript on the popover fill, which keeps the card's edge. The overlay shadow lives on the
// chip, not on the control inside it, because a control's ring utilities own `box-shadow`.
export const floatingChipVariants = tv({
  base: `
    flex items-center rounded-full border border-tone-edge bg-popover p-0 text-popover-foreground shadow-overlay inline-fit max-inline-full tone-host-popover
  `,
  variants: {
    // A chip that comes and goes with its state: shown, it rises into place; hidden, it sinks a row step, fades out and
    // takes no pointer, so it is never a phantom target.
    presence: {
      shown: "pointer-events-auto translate-y-0 opacity-100 transition-[opacity,translate] duration-(--motion-base) ease-out-expo",
      hidden: "pointer-events-none translate-y-row opacity-0 transition-[opacity,translate] duration-(--motion-base) ease-out-expo",
    },
  },
});
