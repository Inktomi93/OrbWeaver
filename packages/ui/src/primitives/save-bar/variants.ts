import { tv } from "#lib";

/**
 * Slot classes for SaveBar (ui-package-design §6.1, work-order #22). Layout chrome ONLY: title +
 * kind label left, an actions slot right. `sticky` docks the bar to the footer or header edge of
 * its nearest scrolling ancestor — `z-raised` keeps it above ordinary content without competing
 * with overlays/modals (UI-Arch §4b z scale).
 */
export const saveBarVariants = tv({
  slots: {
    // `flex-wrap` + `@container/save-bar` are what make the `meta` slot's narrow arm possible: the DIAGNOSTIC
    // drops to a line of its own below the identity instead of eating it (see the `meta` slot).
    root: "@container/save-bar sticky z-(--z-raised) flex flex-wrap items-center justify-between gap-row border-border bg-card px-block py-row",
    // `flex-1`: the identity CLAIMS the free width rather than merely being allowed to shrink into it.
    label: "flex min-w-0 flex-1 items-baseline gap-field",
    title: "truncate font-medium text-body leading-body text-foreground",
    kind: "shrink-0 text-label leading-label text-muted-foreground",
    // THE DIAGNOSTIC SLOT, AND WHY IT IS NOT `actions` (side-eye 2026-08-18 P1-4). At 430px the character
    // editor's bar rendered `Sabin…  Character  1257 total · 1017 permanent  Saved`: the NAME — the only
    // thing telling a phone reader which character they are editing — got 54px while the token census got
    // 231px, 54% of the viewport, because the whole trailing block was `shrink-0` and the title was the one
    // box allowed to yield. Inverted priority, and truncating the census instead would only trade one
    // unreadable datum for another.
    //
    // So the census gets its OWN slot with a width-keyed arm: inline at the end of the bar once there is
    // room (`@md`), and BELOW the identity on its own full-width line when there is not. `order-last` +
    // `basis-full` is the whole mechanism — a full-width flex item on a wrapping row takes a line of its
    // own — so nothing is hidden, abbreviated or put behind a tap: the full census stays on screen and
    // readable, it simply stops competing with the name for the same 430px.
    meta: "order-last basis-full text-start @md/save-bar:order-none @md/save-bar:basis-auto @md/save-bar:text-end",
    actions: "flex shrink-0 items-center gap-row",
  },
  variants: {
    sticky: {
      footer: { root: "bottom-0 border-t" },
      header: { root: "top-0 border-b" },
    },
  },
  defaultVariants: {
    sticky: "footer",
  },
});
