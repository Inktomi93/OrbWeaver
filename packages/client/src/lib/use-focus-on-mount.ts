import type { RefObject } from "react";
import { useEffect } from "react";

// `document` is reached via a `globalThis` cast with an inline structural type — NOT the bare `document`
// global. This hook is re-exported through the `#lib` barrel and is import-reachable from the DOM-LESS
// root aggregator program (`tsconfig.json`, a node lib with no lib.dom), where the `document` NAME isn't
// declared (TS2584). Keeping the file DOM-TYPE-free lets it survive that program; the browser supplies the
// real `document` at runtime (the hook only ever runs inside a mounted React tree, i.e. the browser).
interface MinimalDocument {
  readonly activeElement: unknown;
  readonly body: unknown;
}
const browserDocument = (globalThis as { document?: MinimalDocument }).document;

/** Focus a freshly-mounted surface — keyboard/SR focus management for when the user NAVIGATES to it.
 *
 *  Skips the INITIAL page load. On first render nothing is focused yet (`activeElement` is `<body>`/null),
 *  and stealing focus into the content region THERE moves the browser's start-of-tab-order PAST the rail
 *  nav — a keyboard user's first Tab would skip the entire primary navigation (WCAG 2.4.3 Focus Order /
 *  2.1.1 Keyboard). On a real navigation or modal-open the user has activated a control (or `SectionContent`
 *  focused the content anchor on the section change first), so `activeElement` is a real element ⇒ we DO
 *  move focus into the new surface. The `<body>`/null check is the exact initial-load ⇄ navigation
 *  discriminator, with no timing flag. */
export function useFocusOnMount(ref: RefObject<{ readonly focus: () => void } | null>): void {
  useEffect(() => {
    const active = browserDocument?.activeElement;
    if (active === null || active === undefined || active === browserDocument?.body) {
      return;
    }
    ref.current?.focus();
  }, [ref]);
}
