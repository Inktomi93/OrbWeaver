// How a row says when its entity was made or last edited. A zero-import leaf, so a spec's node side reads the leads without
// loading the component graph. The caller passes the time as the display seam wrote it.

/** The lead of an edit stamp, over how long ago the entity was last edited. */
export const EDITED_STAMP_LEAD = "edited";

/** The lead of a creation stamp, over how long ago the entity was made. */
export const CREATED_STAMP_LEAD = "created";

export function editedStamp(when: string): string {
  return `${EDITED_STAMP_LEAD} ${when}`;
}

export function createdStamp(when: string): string {
  return `${CREATED_STAMP_LEAD} ${when}`;
}
