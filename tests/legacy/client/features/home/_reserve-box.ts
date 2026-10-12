// The one number the home-tile RESERVATION story and its CT must agree on (F14 boot CLS): the height
// "last boot" measured for the story's slow tile. It lives in its own module because a Playwright CT
// import statement that mixes a mounted COMPONENT with a plain value re-declares the identifier in the
// transformed test file ("Identifier … has already been declared") — the story module exports components.

/** Deliberately far from the 3-row skeleton's own height, so a dropped reservation is unmistakable. */
export const RESERVED_TILE_PX = 420;

/** The FIRST-BOOT arm (#92): the row count a tile DECLARES via `HomeTileContribution.skeletonRows` when
 *  this device has no measured box. Eight — the real `chat.recents` limit, and far enough from the frame's
 *  3-row default that a dropped declaration moves the tile below it by five rows. */
export const FIRST_BOOT_SKELETON_ROWS = 8;
