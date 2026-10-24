// The phone screen name carries the roster's census once the ONE-NAME rule sheds the LIST band's title.

/** A census as the list bands print it: a count, a filtered `n of m`, or `undefined` while unread or failed. */
type ScreenCensus = number | string | undefined;

/**
 * The roster's screen name with its census, or `null` when the census says nothing about size.
 *
 * @remarks A zero census is suppressed in the band's own spelling (`ListPaneHeader`: a zero census is noise, not
 * information), whether a hook counted it or formatted it, and an unread or failed census is not a size claim
 * either. A filtered `0 of 5` is a real statement about the filter and is printed.
 */
export function censusTitle(label: string, census: ScreenCensus): string | null {
  if (census === undefined || census === 0 || census === "0") {
    return null;
  }
  return `${label} · ${String(census)}`;
}
