// The one number the home-tile RESERVATION story and its CT must agree on (F14 boot CLS): the height
// "last boot" measured for the story's slow tile. It lives in its own module because a Playwright CT
// import statement that mixes a mounted COMPONENT with a plain value re-declares the identifier in the
// transformed test file ("Identifier … has already been declared") — the story module exports components.

/** Deliberately far from the 3-row skeleton's own height, so a dropped reservation is unmistakable. */
export const RESERVED_TILE_PX = 420;
