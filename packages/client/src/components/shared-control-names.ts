// The accessible names of controls that more than one feature mounts through a shared component. A zero-import leaf, so a
// spec's node side reads them without loading the component graph.

/** The tag picker dialog's name field. */
export const TAG_NAME_FIELD_NAME = "Tag name";

/** The background picker's door to the URL entry. */
export const BACKGROUND_FROM_URL_NAME = "From a URL…";

/** The background picker's URL entry field. */
export const BACKGROUND_URL_FIELD_NAME = "Background image URL";

/** The corner radius select on the theme editor and the character look tab. */
export const CORNER_RADIUS_NAME = "Corner radius";

/** The tag chip editor's dismiss. */
export const TAG_EDITOR_CLOSE_NAME = "Close tag editor";

/** The font select on the theme editor and the character look tab. */
export const FONT_FIELD_NAME = "Font";

/** A tag chip's edit door and the editor it opens, named for the tag. */
export function editTagName(tag: string): string {
  return `Edit tag ${tag}`;
}

/** The tag picker's submit when the typed name is a new tag. */
export function createTagName(tag: string): string {
  return `Create "${tag}"`;
}
