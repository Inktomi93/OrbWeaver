// What a flex child asks of its row. `GROW` takes the room that is left (`true`) or grows from the content's own size (`content`), and `wide` and `contentNarrow` do so only above or below the `cq-28` step, where a phone-width pane stacks them;
// `double` takes twice the share of a `true` sibling. `FLOOR` is the width it starts from, so a wrapping header gives the title or
// the filter its own line before it squeezes. The `min-inline-0` that lets a child shrink below its content stays the caller's
// class, because only some children want that.
export const GROW = {
  true: "flex-1",
  false: "",
  content: "flex-auto",
  onLandscape: "dialog-short:glass-short:flex-auto",
  double: "flex-2",
  wide: "flex-1 @max-cq-28:flex-none",
  contentNarrow: "flex-auto @cq-28:flex-none",
  initial: "flex-initial",
  fill: "grow",
} as const;
export const FLOOR = {
  title: "basis-(--width-title-floor)",
  field: "basis-(--width-field-floor)",
  line: "basis-full",
  third: "basis-1/3",
} as const;

/** The inline inset of a run set in line with the labels of the controls beside it. */
export const CONTROL_INSET = { control: "px-field" } as const;

/** The insets a run takes when it is the whole of its box: `island` a quoted block, `block` a line of an announcement, `blockInline` a line in a surface's inset. */
export const RUN_INSET = { ...CONTROL_INSET, island: "p-row", block: "px-block py-row", blockInline: "px-block" } as const;

/** Children that run out of room take a second line instead of squeezing: always, only below a container step, or until a phone-width pane stacks them. */
export const WRAP = { true: "flex-wrap", false: "", "cq-20": "@max-cq-20:flex-wrap", untilCq28: "flex-wrap @max-cq-28:flex-nowrap" } as const;

/**
 * Where a flex child sends the free space of its line: to its inline start (`inlineEnd`: the child sets at the line's end), its inline end, its block
 * start, or both block sides. An auto margin is alignment, not a spacing step, so no feature picks a length.
 */
export const PUSH = { inlineEnd: "ms-auto", inlineStart: "me-auto", blockEnd: "mbs-auto", blockCentre: "my-auto" } as const;

/**
 * Where a child sets itself across its parent's line, against the parent's `align`: the child's half of that choice. `railEnd` and `railStart` hug the
 * centred column from a `1fr` rail beside it, once the container is wide enough to seat the rail.
 */
export const SELF = {
  start: "self-start",
  center: "self-center",
  end: "self-end",
  stretch: "self-stretch",
  railEnd: "@cq-56:justify-self-end",
  railStart: "@cq-56:justify-self-start",
} as const;

/** The box takes no pointer, so clicks fall through to what lies under it. */
export const PASS_THROUGH = { true: "pointer-events-none", false: "" } as const;
