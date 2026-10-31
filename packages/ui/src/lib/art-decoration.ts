// Art reservations share their width with the adjoining text inset and the edge-reaching header.
export const ART_DECORATION = {
  // A short speaker-colour bar flush to the inline end, drawn by a pseudo-element so it takes no room from the text.
  tickEnd:
    "relative after:absolute after:inset-e-0 after:inset-bs-(--immersive-tick-offset) after:inline-(--immersive-stripe-width) after:block-(--immersive-tick-length) after:bg-(--color-speaker) after:content-['']",
  portraitStart: "orb-art-reservation max-inline-(--column-measure) ps-(--art-pane-width) [--art-reach-left:var(--art-pane-width)]",
  portraitEnd: "orb-art-reservation max-inline-(--column-measure) pe-(--art-pane-width) [--art-reach-right:var(--art-pane-width)]",
} as const;
