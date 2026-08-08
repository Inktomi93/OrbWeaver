// The CAPPED-FIELD grammar's non-component half — the threshold, the geometry ceiling, and the "is the
// counter showing?" predicate. Split from `capped-field.tsx` because a JSX module may export components ONLY
// (`useComponentExportOnlyModules`; the `save-status-seam.ts` / `section-save-status.tsx` precedent).

/** Show the counter from 80% of the cap — the `hint-editor` grammar ("a quiet counter from 80% full"). A
 *  counter that is always on is chrome; one that appears as the ceiling approaches IS the warning. */
export const DEFAULT_COUNTER_AT = 0.8;

/** The autosize ceiling (in lines) for a capped multi-line editor field. Twelve lines is a paragraph of
 *  breathing room — enough that the common override is never scrolled at all, short enough that the box plus
 *  its footer clear an 800px fold. The text past it is never lost: the field scrolls.
 *
 *  WHY THE CEILING EXISTS AT ALL: `field-sizing: content` grows without bound, so a capped-but-long value
 *  (a 4500-character prose override) rendered a 2333px box in a 720px viewport and pushed the field's own
 *  counter, error and save status ~900px below the fold — the affordances that state the cap, hidden by the
 *  value the cap is about (side-eye PROSE-LIMIT P1). */
export const CAPPED_FIELD_MAX_ROWS = 12;

/** Is the counter visible at this length? Exported because a footer that WRAPS the counter needs the same
 *  answer to decide whether it has anything to draw at all — re-spelling the comparison at the call site is
 *  how a footer ends up rendering an empty row (or hiding a visible counter) one threshold change later. */
export function showsCappedFieldCounter(length: number, max: number, counterAt: number = DEFAULT_COUNTER_AT): boolean {
  return length >= max * counterAt;
}
