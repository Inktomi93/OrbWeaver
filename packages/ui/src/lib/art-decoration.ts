// Art reservations share their width with the adjoining text inset and the edge-reaching header.
export const ART_DECORATION = {
  stripeStart: "[border-inline-start-width:var(--immersive-stripe-width)] [border-inline-start-style:solid] [border-inline-start-color:var(--color-speaker)]",
  stripeTop: "[border-block-start-width:var(--immersive-stripe-width)] [border-block-start-style:solid] [border-block-start-color:var(--color-speaker)]",
  portraitStart: "orb-art-reservation max-inline-(--column-measure) ps-(--art-pane-width) [--art-reach-left:var(--art-pane-width)]",
  portraitEnd: "orb-art-reservation max-inline-(--column-measure) pe-(--art-pane-width) [--art-reach-right:var(--art-pane-width)]",
} as const;
