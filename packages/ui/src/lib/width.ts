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
