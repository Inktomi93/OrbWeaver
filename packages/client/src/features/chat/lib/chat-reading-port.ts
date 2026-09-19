// THE TRANSCRIPT'S READING-PORT BUDGET — one number, its derivation, and nothing else (#2426, owner-ruled
// 2026-09-19).
//
// WHY IT IS ITS OWN MODULE AND NOT A CONST IN `chat-controls-band.tsx`, where it is spent. Its ONE enforcer
// is a playwright-ct spec, and a CT spec's node side cannot import a `.tsx`: playwright-ct rewrites every
// named import from a component file into a generated component const, so a VALUE imported alongside — or
// instead of — a component comes back as a stub and the spec collects ZERO tests (measured: `UNFED PATH …
// the runner collected NO tests from it`, exit 2). A zero-import `.ts` leaf is imported for real, so the
// budget has one home the assertion can actually read.

/**
 * The floor, in CSS px, under the transcript's rendered scroll port on a phone — the budget the chat
 * control band's coarse resting strip exists to protect (`chat-controls-band.tsx`'s `ControlChips`).
 *
 * THE DERIVATION, measured at `device=coarse:dpr3:430x740` on da5516cd8 (run
 * `reports/runs/snap/agent-a1b6c68f161df615e-1828300-…/evidence/evals.json`):
 *   · the room COLUMN is 610px — the 740px viewport less the shell's 60px topbar and 70px tab bar, both of
 *     which live outside `main`;
 *   · inside it the room spends the character bar (56), the control band, the composer (212), three
 *     `gap-block` steps (36) and the room Stack's own `pb-block` (12);
 *   · so the transcript's share is `610 − 56 − 212 − 36 − 12 − <band> = 294 − <band>`.
 * With the band wrapped to three chip rows (127px measured) that share was **185px** — four lines of prose,
 * hard-clipped mid-glyph, with the tax GROWING as more rules fired. With the coarse strip the band is one
 * control row, so this is what the transcript keeps whatever the chip count.
 *
 * WHY THIS NUMBER: it is the composer's own measured height. The rule it states is one a reader can check
 * with their eyes — **the thing you read is never smaller than the thing you type into** — and it is the
 * strongest floor the ruled fix actually buys at this viewport, with the residual as headroom against a
 * retune of the chip row's control height.
 *
 * IT IS A CONSTANT, DELIBERATELY NOT A VAULT TOKEN (deviation stated to the coordinator and approved,
 * 2026-09-19). A DTCG token nothing paints is a dead token and the build reds it; and a real `min-height`
 * on the scroller would push the composer below the fold on a shorter viewport instead of failing loudly.
 * This is an assertion BUDGET, not a painted value, so its enforcer is a test:
 * `tests/client/features/chat/components/chat-controls-band.ct.tsx` mounts the room in a 610px column at
 * 430×740 with a coarse pointer and measures the rendered `[data-slot=message-list-scroll]` against it.
 */
export const CHAT_READING_PORT_MIN_PX = 212;
