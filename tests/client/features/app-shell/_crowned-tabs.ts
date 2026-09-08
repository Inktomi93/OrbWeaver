// THE META RAIL'S CROWNED SET — ONE home, read by the story that renders it and by the node pin that
// checks it against the live definitions (#1629; the `_reserve-box.ts` precedent for a non-story helper
// beside a `_ct-stories.tsx`).
//
// WHY IT IS NOT DECLARED INSIDE THE STORY. `_ct-stories.tsx` is a BROWSER module — playwright-ct mounts it,
// and no node test can import it, so a crown set spelled there is a fixture nothing can check. #898 caught
// exactly that: the story crowned `Game` ALONE, three live cells actually carry `crown: true`, and a
// partition on the flag that could not move anything went green because the fixture agreed with the fix
// rather than with the product. The rule #898 wrote down (`_ct-stories.tsx`, the `CTX_META_RAIL_TABS`
// header) is that a fixture's AXIS DATA must be DERIVED from the live definitions or CHECKED against them.
// This module is the "checked against them" arm: the ids live here, the story reads them, and
// `tests/client/lib/registry-contracts.dom.test.ts` derives the live set from the three OWNING definitions and asserts the
// two are equal — so the next definition that gains or loses a crown REDS instead of quietly re-greening.
//
// The set is spelled here rather than live-derived because the story would otherwise pull the chat, rpg and
// automation feature graphs (and a tRPC client) into every app-shell CT bundle to learn three strings; the
// node pin pays that cost once, off the browser's critical path.

/** The context-tab ids that carry `crown: true` in the live definitions — chat's `Preview`
 *  (`chats-section.tsx`), rpg's `Game` (`rpg-context-section.tsx`) and automation's `Activity`
 *  (`activity-context-tab.tsx`). Checked against those three modules by
 *  `tests/client/lib/registry-contracts.dom.test.ts`; never edited without that pin agreeing. */
export const CT_META_RAIL_CROWNED_IDS: readonly string[] = ["preview", "rpg.game", "automation.activity"];
