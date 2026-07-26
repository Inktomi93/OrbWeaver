// The stream-display SCROLL-MODE axis — `follow | pin-prompt` — shared by `@orb/ui`'s `message-list`
// `scrollMode` prop and `@orb/contracts`'s user-settings wire schema.
//
// This is THE single home for the axis (PD-147). It lives in `kit` — not `contracts` — because BOTH
// consumers must reach it and `ui` may import `kit` ONLY (never `contracts`, D54): homing it in contracts
// forces the ui prop to re-spell `"follow" | "pin-prompt"` inline, and the `no-inline-union-redecl`
// reach-guard can only EXEMPT that re-spell (ui can't legally derive from a contracts tuple) rather than
// kill it. Homed here, the ui prop derives `ScrollMode` and the contracts `z.enum(SCROLL_MODES)` wire
// schema imports the tuple DOWN — the kit↔contracts tuple rule (mirrors `message-role`, shared-dissolution §5).
//
// `follow` = the sealed sticky-tail behavior (default; byte-identical for untouched users). `pin-prompt` =
// ChatGPT-style: on send, pin the just-sent message to the viewport top and hold it while the reply
// streams below. Pure / isomorphic.

export const SCROLL_MODES = ["follow", "pin-prompt"] as const;
export type ScrollMode = (typeof SCROLL_MODES)[number];
