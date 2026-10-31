import { tv } from "#lib";

// The stripe and glow of a region's one focal treatment (CD3): the speaker-ink leading edge and a glow behind the box.
export const focalSectionVariants = tv({
  variants: {
    focal: {
      true: `
        relative isolate rounded-(--radius-base) [border-inline-start-width:var(--immersive-stripe-width)] [border-inline-start-style:solid]
        [border-inline-start-color:var(--color-speaker)] p-row
        before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-(--radius-base) before:opacity-40 before:shadow-glow
        before:content-['']
      `,
      false: "",
    },
  },
});
