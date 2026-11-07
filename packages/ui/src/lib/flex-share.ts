// What a flex child asks of its row. `GROW` takes the room that is left (`true`) or grows from the content's own size (`content`);
// `double` takes twice the share of a `true` sibling. `FLOOR` is the width it starts from, so a wrapping header gives the title or
// the filter its own line before it squeezes. The `min-inline-0` that lets a child shrink below its content stays the caller's
// class, because only some children want that.
export const GROW = { true: "flex-1", false: "", content: "flex-auto", double: "flex-2" } as const;
export const FLOOR = {
  title: "basis-(--width-title-floor)",
  field: "basis-(--width-field-floor)",
  line: "basis-full",
} as const;
