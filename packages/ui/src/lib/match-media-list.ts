/** The slice of `MediaQueryList` the `lib/` media hooks read. `lib/` compiles without the DOM lib, so `matchMedia` is reached through this structural type. */
export interface MatchMediaListView {
  readonly matches: boolean;
  readonly addEventListener: (type: "change", listener: () => void) => void;
  readonly removeEventListener: (type: "change", listener: () => void) => void;
}
