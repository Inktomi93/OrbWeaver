// The names the host prints on a plugin surface's declared nodes, beside the labels the guest supplies. A zero-import
// leaf, so a spec's node side reads them without loading the component graph.

/** A search bar's submit, which the host draws when the guest names the action it fires. */
export const PLUGIN_SEARCH_SUBMIT_NAME = "Search";

/** What a grid with no tiles says when its guest names no empty line, or binds one that resolves to no text. */
export const PLUGIN_GRID_EMPTY_DEFAULT = "Nothing here yet.";

/** What a selected plugin page or dialog says when its guest has booted and published nothing for it. */
export const PLUGIN_SURFACE_EMPTY_TITLE = "This plugin has no content to show here yet.";

/** The empty plugin surface's way out: it boots the guest again. */
export const PLUGIN_SURFACE_RELOAD_NAME = "Reload";
