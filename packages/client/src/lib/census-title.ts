// The phone screen name carries the roster's census once the ONE-NAME rule sheds the LIST band's title.

/** A census as the list bands print it: a count, a filtered `n of m` string, or `undefined` while unread or failed. */
type ScreenCensus = number | string | undefined;

/** What the phone topbar calls a screen: its name, and the roster's census beside it while the screen is a roster. The
 *  topbar keeps the name whole and cuts the census first. */
export interface ScreenTitle {
  readonly name: string;
  readonly census?: number | string;
}

/**
 * The roster's screen name with its census, or `null` when the census says nothing about size.
 *
 * @remarks A zero census is suppressed in the band's own spelling (`ListPaneHeader`: a zero census is noise, not
 * information), and an unread or failed census is not a size claim either. A filtered `0 of 5` is a real statement
 * about the filter and is printed.
 */
export function censusTitle(label: string, census: ScreenCensus): ScreenTitle | null {
  if (census === undefined || census === 0) {
    return null;
  }
  return { name: label, census };
}

/** The census as it follows the name on the screen: the topbar lays it out as its own part, so it can cut it alone. */
export function censusSuffix(census: number | string): string {
  return ` · ${String(census)}`;
}

/** The screen title as one line of text, the way the topbar reads it. */
export function screenTitleText({ name, census }: ScreenTitle): string {
  return census === undefined ? name : `${name}${censusSuffix(census)}`;
}
