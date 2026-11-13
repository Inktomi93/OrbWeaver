// The screen's one h1, which the shell owns, handed to a feature that must return focus to the screen's name when a
// control it would return to is not mounted in the current layout (the way `shell-content-focus-store.ts` hands off the
// content landmark, for a feature that asks and lets the shell move focus). Not reactive: a caller reads it at the moment
// focus must land.

let heading: HTMLElement | null = null;

/** The shell's ref callback for its heading: holds the node while it is mounted. */
export function shellHeadingRef(node: HTMLElement | null): (() => void) | undefined {
  if (node === null) {
    return undefined;
  }
  heading = node;
  return (): void => {
    if (heading === node) {
      heading = null;
    }
  };
}

/** The screen heading, focusable by script, or `null` before the shell has mounted it. */
export function shellHeading(): HTMLElement | null {
  return heading;
}
