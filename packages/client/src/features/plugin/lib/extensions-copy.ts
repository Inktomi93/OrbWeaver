// The Extensions section's COPY, in one place (plugin-ui-plane #679 U5, §4.5b) — the section placeholder, the
// teaching empty, and the switcher's own labels.
//
// THE EMPTY STATE IS THE ADVERTISEMENT, and that is the argued position, not a default. The rail section ships
// VISIBLE with an honest empty rather than hidden-until-populated: a hidden entry makes the whole platform
// undiscoverable — a person who has never installed a plugin with pages would never learn that pages exist. The
// byte-identical-when-off law governs CONTRIBUTIONS (zero registrants ⇒ the host renders its own default); a
// rail SECTION is house chrome, and the house ships visible sections in honest empty states by law (the
// three-states law: EMPTY teaches, with an action). The hide-when-empty variant is a RECORDED owner knob, priced
// with per-plugin rail promotion — deliberately NOT built here.

/** The section's placeholder (title, description) — DISTINCT from every sibling's by the
 *  `placeholder-copy-registry` gate, and it doubles as the home-tile gloss, so it says what the section IS
 *  rather than pointing at a pane the tile has no left rail for. */
export const EXTENSIONS_PLACEHOLDER = {
  title: "Extensions",
  description: "Full-page surfaces the plugins you installed provide — browsers, dashboards, whatever they bring, drawn by the app.",
} as const;

/** The teaching EMPTY (§4.5b) — names the next step, which is why the action exists (`empty-state-has-action`). */
export const EXTENSIONS_EMPTY_TITLE = "No extension pages yet";
export const EXTENSIONS_EMPTY_BODY = "Install a plugin with page surfaces and it will appear here.";
export const EXTENSIONS_EMPTY_ACTION = "Open Plugins";

/** The CONTENT pane's no-selection state — a switcher with rows but nothing picked. Distinct copy from the
 *  empty above: "pick one" and "there are none" are different facts and collapsing them is the generic-filler
 *  defect the house sweeps for. */
export const EXTENSIONS_NO_SELECTION_TITLE = "Pick an extension page";
export const EXTENSIONS_NO_SELECTION_BODY = "Choose a page on the left to open it here.";

/** The CONTENT pane's DANGLING state — the selected page's plugin was disabled or removed while it was open. */
export const EXTENSIONS_GONE_TITLE = "That page is no longer available";
export const EXTENSIONS_GONE_BODY = "Its plugin was disabled or removed. Pick another page, or turn it back on in Plugins.";
