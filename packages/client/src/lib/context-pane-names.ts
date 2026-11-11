// The names the shell prints on a side pane and its exits. A zero-import leaf, so a spec's node side reads them without
// loading the shell graph.

/** A floating pane's dismiss when it carries no label of its own. */
export const PANEL_CLOSE_FALLBACK_NAME = "Close panel";

/** The phone topbar's back control while it closes the Context sheet. */
export const CONTEXT_SHEET_BACK_NAME = "Close details";

/** The landmark every floating menu, select and popover mounts inside, so none of them sits outside every landmark. */
export const POPUP_LAYER_NAME = "Popups";

/** The Context pane's own name for `section`. */
export function contextPaneLabel(section: string): string {
  return `${section} details`;
}

/** A floating pane's dismiss, named for the pane it closes. */
export function panelCloseName(paneLabel: string): string {
  return `Close ${paneLabel}`;
}

/** A back control, named for where it returns: the phone topbar's and a drilled member's. */
export function sectionBackName(target: string): string {
  return `Back to ${target}`;
}

/** The nouns the desktop edge controls name the list and Context panes by. */
export const LIST_PANEL_NOUN = "list panel";
export const DETAILS_PANEL_NOUN = "details";

/** A side panel's edge control, which names the panel and the verb a press performs. */
export function panelEdgeName(noun: string, expanded: boolean): string {
  return `${expanded ? "Hide" : "Show"} ${noun}`;
}

/** The list pane's own name for `section`. */
export function listPaneLabel(section: string): string {
  return `${section} list`;
}

/** The phone topbar's swap to `screen`'s roster. */
export function screenListDoorName(screen: string): string {
  return `Show ${listPaneLabel(screen)}`;
}

/** The phone topbar's swap from `screen`'s roster to its overview. */
export function screenOverviewDoorName(screen: string): string {
  return `Show ${screen} overview`;
}
