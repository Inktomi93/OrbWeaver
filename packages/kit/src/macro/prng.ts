// The ONE seam that normalises an INJECTED pseudo-random draw (#1359).
//
// `ctx.random` (and `resolveUserMacroInputs`'s `opts.prng`) is caller-supplied — a seeded generator in
// tests, a per-turn deterministic one in chat, and, once plugins ship one, an ADVERSARY-supplied
// function. Every randomized handler assumed the `Math.random` contract `[0, 1)` without ever checking
// it, and each one broke differently: a generator returning exactly `1` made `{{random}}` yield `101`
// and `{{random::1::10}}` yield `11` — outside the range those macros' own documentation promises —
// negative draws yielded negative output, `NaN`/`Infinity` rendered as the literal text `"NaN"` /
// `"Infinity"`, and the array-index paths (`{{pick}}`, option-mode `{{random}}`, random-pick inputs)
// degraded through `?? ""` into a silently DELETED option that a frozen draw then replays all turn.
//
// Normalise ONCE, here, rather than guarding per handler: the handlers' arithmetic is already correct
// for a `[0, 1)` draw, and five hand-rolled guards is exactly the shape this repo calls a re-spelling.
//
// CLAMP, NOT THROW — deliberately, and this is the trade worth stating. Macro evaluation is fail-open by
// contract (a throwing handler renders its literal text rather than aborting the turn), so a hostile PRNG
// that could abort every render would be a worse outcome than one whose draws are pinned to the ends of
// the documented range. The defect being fixed is a value OUTSIDE the promised range, and a clamp closes
// exactly that.

/** The largest draw strictly below 1 that a double can represent — the clamp ceiling, so a `1` draw lands
 *  on the range's TOP member (`floor(draw * n)` = `n - 1`) instead of one past it. */
const ALMOST_ONE = 1 - Number.EPSILON / 2;

/** Normalise one draw from an untrusted generator into `Math.random`'s contract, `[0, 1)`. Non-finite
 *  draws read as `0` (the range's low end — the one value that is always in-range for any span). */
export function unitDraw(random: () => number): number {
  const raw = random();
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return raw < 1 ? raw : ALMOST_ONE;
}
