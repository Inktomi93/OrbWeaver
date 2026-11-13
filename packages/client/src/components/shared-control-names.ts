// The accessible names, and the notices, of controls that more than one feature mounts through a shared component. A leaf with type imports only, so a
// spec's node side reads them without loading the component graph.

import type { UserMacroInputKind } from "@orb/kit/macro";

/** The tag picker dialog's name field. */
export const TAG_NAME_FIELD_NAME = "Tag name";

/** The tag editor page's rename field. */
export const TAG_EDITOR_NAME_FIELD_NAME = "Name";

/** The background picker's door to the URL entry. */
export const BACKGROUND_FROM_URL_NAME = "From a URL…";

/** The background picker's tile grid, mounted by the character look tab and the chat room overrides. */
export const BACKGROUND_GRID_NAME = "Background";

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

/** The tag editor's switch that keeps a tag's chip off character cards. */
export const TAG_HIDE_ON_CARDS_NAME = "Hide chip on cards";

/** The tag editor's door to the merge picker. */
export const TAG_MERGE_DOOR_NAME = "Merge into…";

/** The merge picker's target select. */
export const TAG_MERGE_TARGET_NAME = "Merge target tag";

/** The merge picker's confirm. */
export const TAG_MERGE_CONFIRM_NAME = "Merge";

/** The toast a refused merge raises. */
export const TAG_MERGE_FAILED_TOAST = "Couldn't merge the tags.";

/** The toast a refused setting reset raises. */
export const SETTING_RESET_FAILED_TOAST = "Couldn't reset the setting.";

/** What a chip's editor shows when its tag is gone from the library. */
export const TAG_DELETED_TEXT = "This tag was deleted.";

/** The merge picker's legend, named for the tag it folds away. */
export function mergeTagLegend(tag: string): string {
  return `Merge "${tag}" into another tag`;
}

/** The user-macro editor's title, on the preset's Macros tab and the game's macros section. */
export const USER_MACRO_EDITOR_TITLE = "Edit macro";

/** The user-macro editor's template body field. */
export const USER_MACRO_TEMPLATE_NAME = "Template";

/** A declared argument's name field. */
export const USER_MACRO_ARG_NAME_FIELD_NAME = "Name";

/** A typed input's kind select. */
export const USER_MACRO_INPUT_KIND_NAME = "Kind";

/** A typed input's question field. */
export const USER_MACRO_INPUT_QUESTION_NAME = "Question";

export const USER_MACRO_ADD_ARGUMENT_NAME = "Add argument";
export const USER_MACRO_ADD_INPUT_NAME = "Add input";
export const USER_MACRO_ADD_OPTION_NAME = "Add option";

/** What each typed-input kind is called in the kind select. */
export const USER_MACRO_INPUT_KIND_LABELS = {
  "single-select": "Single select: pick one option",
  "boolean-toggle": "Toggle: on/off",
  "multi-select": "Multi select: pick several, joined",
  "random-pick": "Random pick: draw one from your pool each turn",
} as const satisfies Record<UserMacroInputKind, string>;

/** The group of the `ordinal`th declared argument, counted from 1. */
export function userMacroArgumentGroupName(ordinal: number): string {
  return `Argument ${ordinal}`;
}

/** The group of the `ordinal`th typed input, counted from 1. */
export function userMacroInputGroupName(ordinal: number): string {
  return `Macro input ${ordinal}`;
}

/** The group of an input's `ordinal`th option, counted from 1. */
export function userMacroOptionGroupName(ordinal: number): string {
  return `Input option ${ordinal}`;
}

/** A role slot's connection picker, named for the role it binds. */
export function connectionRolePickerName(role: string): string {
  return `${role} connection`;
}

/** The tag picker's submit when the typed name is a new tag. */
export function createTagName(tag: string): string {
  return `Create "${tag}"`;
}

/** The character picker's footer while it holds only part of the library: how many rows it shows of how many exist. */
export function pickerShowingLine(shown: string, total: string): string {
  return `Showing ${shown} of ${total}`;
}

/** The character search box: the character library, a world book's character attachments and the Insights leaderboard. */
export const CHARACTER_SEARCH_NAME = "Search characters";
