import { tv } from "#lib";

// The edge ring and glow of a region's one focal treatment (CD3): a speaker-ink ring around the box and a glow behind it. The ring is
// a shadow, not a border, so a rounded box carries no one-sided border.
export const focalSectionVariants = tv({
  variants: {
    focal: {
      true: `
        relative isolate rounded-(--radius-base) p-row ring ring-(--color-speaker)
        before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-(--radius-base) before:opacity-faint
        before:shadow-glow before:content-['']
      `,
      false: "",
    },
  },
});
