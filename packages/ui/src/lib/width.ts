// The box's own inline size, where a `cap` is only the widest it may grow. `full` is the parent's width and `fit` its content's. `control`,
// `controlMd` and `checkbox` hold the width of the control a slot stands in for; `avatarHero` and `ripplePortrait` the picture a column sits
// under; the rest are the named column widths. `lane` is a lane's width once the container can seat it beside another lane, and the whole
// width until then. `flankFit` is the width a room needs to seat its plugin column beside the transcript's reading floor.
export const WIDTH = {
  full: "inline-full",
  fit: "inline-fit",
  control: "inline-(--size-control-sm)",
  controlMd: "inline-(--size-control-md)",
  checkbox: "inline-(--size-checkbox)",
  gutter: "inline-gutter",
  controlCol: "inline-(--width-control-col)",
  sidebarSm: "inline-(--width-sidebar-sm)",
  avatarHero: "inline-(--size-avatar-hero)",
  ripplePortrait: "inline-(--immersive-ripple-portrait-width) @max-cq-28:inline-(--immersive-ripple-portrait-width-phone)",
  lane: "@max-cq-64:inline-full @cq-64:inline-(--width-lane)",
  flankFit: "inline-(--dimension-room-flank-fit)",
} as const;

/** The widest a box grows, by meaning: `fit` is the parent's own width (a wrapping row in a flex row never pushes the pane wider), `reading`, `prose` and `column` are the measures, and the rest are the named caps a surface sets once. A feature picks the meaning, never a width. */
export const CAP = {
  fit: "max-inline-full",
  fitNarrow: "@max-cq-20:max-inline-full",
  reading: "max-inline-(--reading-measure)",
  prose: "max-inline-(--reading-measure-prose)",
  readingMin: "max-inline-(--reading-measure-min)",
  column: "max-inline-(--width-content-col)",
  columnWide: "max-inline-(--width-content-col) @cq-64:max-inline-(--width-content-col-wide)",
  control: "max-inline-(--width-control-col)",
  surface: "max-inline-(--width-surface-cap)",
  shell: "max-inline-(--width-shell-content)",
  pane: "max-inline-(--container-cq-48)",
  avatarHero: "max-inline-(--size-avatar-hero)",
  sidebar: "max-inline-(--width-sidebar-sm) @max-cq-32:max-inline-none",
} as const;

/** A named fixed block size: the viewport, or the height of the control a placeholder or a row stands in for. */
export const HEIGHT = { viewport: "block-dvh", control: "block-(--size-control-sm)", controlMd: "block-(--size-control-md)" } as const;
