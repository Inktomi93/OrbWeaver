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
/** @param enabled - `false` stands the surface DOWN — another surface owns focus for this mount by an
 *  explicit INTENT decision (the character screen's LIST projection: a selection made from the list picker
 *  focuses the pane the user just transformed, so the CONTENT editor mounting beside it must not take it
 *  back). Defaults to `true`, so every other caller is unchanged. */
export function useFocusOnMount(ref: RefObject<{ readonly focus: () => void } | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const active = browserDocument?.activeElement;
    if (active === null || active === undefined || active === browserDocument?.body) {
      return;
    }
    ref.current?.focus();
  }, [ref, enabled]);
}
