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

/** Focus a freshly-mounted surface UNCONDITIONALLY — for an IN-PLACE swap, where the control the user just
 *  activated is REMOVED by the same render that mounts this surface.
 *
 *  Why the sibling exists: `useFocusOnMount`'s `<body>` check is an initial-load discriminator, and it
 *  cannot tell "the page just loaded" from "the button I was standing on was destroyed" — both leave
 *  `activeElement` at `<body>`. The preset section/template drill-ins are exactly the second case (the
 *  chevron that opened the editor unmounts with the list), so the guarded hook silently declined and focus
 *  stayed on `<body>` in BOTH directions (side-eye F-04). The caller opts in per site because the guard is
 *  what protects the rail's tab order on a cold load; a surface using THIS hook must only mount as the
 *  direct result of a user activation. */
export function useFocusOnSwap(ref: RefObject<{ readonly focus: () => void } | null>, enabled = true): void {
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [ref, enabled]);
}
