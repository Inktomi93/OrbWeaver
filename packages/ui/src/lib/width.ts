// The box's own inline size, where a `cap` is only the widest it may grow. `full` is the parent's width and `fit` its content's. `control`,
// `controlMd` and `checkbox` hold the width of the control a slot stands in for; `avatarMd`, `avatarLg`, `avatarHero` and `ripplePortrait` the picture a box stands in for or a column sits
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
  avatarMd: "inline-(--size-avatar-md)",
  avatarLg: "inline-(--size-avatar-lg)",
  avatarHero: "inline-(--size-avatar-hero)",
  ripplePortrait: "inline-(--immersive-ripple-portrait-width) @max-cq-28:inline-(--immersive-ripple-portrait-width-phone)",
  lane: "@max-cq-64:inline-full @cq-64:inline-(--width-lane)",
  flankFit: "inline-(--dimension-room-flank-fit)",
  numberInline: "inline-(--width-number-inline)",
} as const;

/** The widest a box grows, by meaning: `fit` is the parent's own width (a wrapping row in a flex row never pushes the pane wider), `reading`, `prose`, `code` and `column` are the measures, and the rest are the named caps a surface sets once. A feature picks the meaning, never a width. */
export const CAP = {
  fit: "max-inline-full",
  fitNarrow: "@max-cq-20:max-inline-full",
  reading: "max-inline-(--reading-measure)",
  prose: "max-inline-(--reading-measure-prose)",
  readingMin: "max-inline-(--reading-measure-min)",
  code: "max-inline-(--reading-measure-code)",
  column: "max-inline-(--width-content-col)",
  columnWide: "max-inline-(--width-content-col) @cq-64:max-inline-(--width-content-col-wide)",
  control: "max-inline-(--width-control-col)",
  surface: "max-inline-(--width-surface-cap)",
  shell: "max-inline-(--width-shell-content)",
  pane: "max-inline-(--container-cq-48)",
  paneSm: "max-inline-cq-24",
  avatarHero: "max-inline-(--size-avatar-hero)",
  controlMd: "max-inline-(--size-control-md)",
  paneXs: "max-inline-cq-20",
  available: "max-inline-(--available-width)",
  sidebar: "max-inline-(--width-sidebar-sm) @max-cq-32:max-inline-none",
} as const;

/** The box sets in the middle of its line, with the free space on both sides. */
export const CENTRED = { true: "mx-auto", false: "" } as const;

/** A named block size: the parent's whole one, the viewport, or the height of the control a placeholder or a row stands in for. */
export const HEIGHT = {
  fill: "block-full",
  viewport: "block-dvh",
  control: "block-(--size-control-sm)",
  controlMd: "block-(--size-control-md)",
  controlLg: "block-(--size-control-lg)",
  scrollMd: "block-(--height-scroll-md)",
} as const;

/** The most block size a box takes before it scrolls: a scroll region's step, what the popup's anchor leaves, or a pane's. */
export const MAX_HEIGHT = {
  scrollSm: "max-block-(--height-scroll-sm)",
  scrollMd: "max-block-(--height-scroll-md)",
  scrollLg: "max-block-(--height-scroll-lg)",
  scrollMdWide: "max-block-(--height-scroll-md) @cq-28:max-block-(--height-scroll-lg)",
  paneSm: "max-block-(--container-cq-24)",
  available: "max-block-(--available-height)",
  // On a phone-width pane the box takes at most half of it, so the column it sits above stays in sight.
  halfNarrow: "@max-cq-32:max-block-1/2",
} as const;

/** A picture's box, by what it stands for: its host's whole box, or the hero step on both sides. */
export const PICTURE_SIZE = { fill: "block-full inline-full", hero: "block-(--size-avatar-hero) inline-(--size-avatar-hero)" } as const;

/** The least block size a box holds, by what must fit in it: the control it seats, a scroll region's floor, or a named surface. */
export const MIN_HEIGHT = {
  shrinks: "min-block-0",
  shrinksOnLandscape: "dialog-short:glass-short:min-block-0",
  holdsPickerOnLandscape: "dialog-short:glass-short:min-block-(--height-picker-floor)",
  // A truncating box has no automatic minimum, so a scrolling column squeezes its line to nothing; this holds the line.
  holdsLineOnLandscape: "dialog-short:glass-short:min-block-min",
  viewport: "min-block-dvh",
  full: "min-block-full",
  control: "min-block-(--size-control-sm)",
  nameRow: "min-block-(--size-name-row-min)",
  // The first tile of a shelf floors at the control height, so a shelf that starts on a short tile keeps its line.
  firstTile: "group-first/tile:min-block-(--size-control-sm)",
  controlMd: "min-block-(--size-control-md)",
  scrollSm: "min-block-(--height-scroll-sm)",
  scrollMd: "min-block-(--height-scroll-md)",
  scrollLg: "min-block-(--height-scroll-lg)",
  roomThread: "min-block-(--height-room-thread-min)",
  homeRecents: "min-block-(--height-home-recents-empty)",
  pageLastRow: "min-block-(--immersive-document-last-row-min-height)",
} as const;

/** The least inline size a box holds, by what must fit in it: a control, a popup's content, the composer's field, or a title. */
export const MIN_WIDTH = {
  controlMd: "min-inline-(--size-control-md)",
  popupNarrow: "min-inline-(--width-popup-narrow)",
  popupFloor: "min-inline-(--width-popup-floor)",
  composerField: "min-inline-(--dimension-composer-field-min)",
  title: "min-inline-(--width-title-floor)",
  // The longest word: a flex line breaks before the box would split one. A landscape phone's dialog header holds one line, so there the box truncates.
  word: "min-inline-min dialog-short:glass-short:min-inline-0",
} as const;
