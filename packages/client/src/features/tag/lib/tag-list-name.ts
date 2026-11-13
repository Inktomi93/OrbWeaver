// The accessible names the Labels finder prints, in one import-free module so a spec's node side can import them.

export const TAG_LIST_NAME = "Tags";

/** The Labels finder's filter box. */
export const TAG_FILTER_NAME = "Filter tags";
export const TAG_SKIP_NAME = "Skip to tags";
export const TAG_MORE_ACTIONS_NAME = "More tag actions";
export const TAG_PRUNE_NAME = "Prune unused tags";

/** A suggestion group, named for the tag it suggests, and one suggestion's row, named for the tag and the character. */
export function tagSuggestionGroupName(tag: string): string {
  return `Suggested ${tag}`;
}
export function tagSuggestionRowName(tag: string, character: string): string {
  return `${tagSuggestionGroupName(tag)} for ${character}`;
}

/** The suggestions table's decline press, and the line it shows with nothing to review. */
export const TAG_REJECT_NAME = "Reject";
export const TAG_SUGGESTIONS_EMPTY_TEXT = "No suggested tags awaiting review.";

/** The Labels context pane's one tab, which names the region its body is. */
export const TAG_USAGE_TAB_NAME = "Usage";

/** The Labels finder's reading-order Select. */
export const TAG_SORT_NAME = "Sort tags";
