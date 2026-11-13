// The screen's focus anchors, which the shell owns, handed to a feature that must return focus to the screen when a control it
// would return to is not mounted in the current layout (the way `shell-content-focus-store.ts` hands off the content landmark, for a
// feature that asks and lets the shell move focus). Two anchors: the topbar's lead control (the Back or list-door button), which a
// keyboard reader sees take focus, and the screen's one h1, which is visually hidden and so shows no focus ring. A feature prefers the
// lead control and falls back to the heading where the screen draws none. Not reactive: a caller reads them at the moment focus must land.

let heading: HTMLElement | null = null;
let leadControl: HTMLElement | null = null;

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

/** The shell's ref callback for its topbar lead control: holds the node while it is mounted. */
export function shellLeadControlRef(node: HTMLElement | null): (() => void) | undefined {
  if (node === null) {
    return undefined;
  }
  leadControl = node;
  return (): void => {
    if (leadControl === node) {
      leadControl = null;
    }
  };
}

/** The screen heading, focusable by script, or `null` before the shell has mounted it. */
export function shellHeading(): HTMLElement | null {
  return heading;
}

/** The topbar's lead control, or `null` where the screen draws none. */
export function shellLeadControl(): HTMLElement | null {
  return leadControl;
}
