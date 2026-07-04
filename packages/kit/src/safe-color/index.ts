// The D44 §12.1 color-safety predicate — the ONE clamp every raw-color acceptor shares. Kit-homed
// (isomorphic, pure, zero-dep) because its consumers span the CAKE: the `@orb/ui` render clamps
// (`<ThemeScope>`, `sandbox-frame` token injection, `color-field`) AND the `@orb/contracts/theme`
// WIRE schema — ui and contracts cannot import each other (D44 §12.5: the two Zod clamps are a
// deliberate cake-forced pair, pairing-test-pinned), but both reach kit, so the PREDICATE itself
// never forks. Moved ui/lib → kit at the §12.8 contracts pass.

// A color must be one of these SAFE forms. Deliberately NO url()/expression()/var()/gradient — a value
// that could carry a network fetch or a CSS escape is rejected outright (not sanitized). Hex, rg[b]a(),
// hsl[a](), oklch()/oklab(), and the bare CSS named colors are the whole permitted surface.
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const RGB = /^rgba?\(\s*[0-9., %/]+\)$/iu;
const HSL = /^hsla?\(\s*[0-9., %/deg]+\)$/iu;
const OKL = /^okl(?:ch|ab)\(\s*[0-9.\-% /]+\)$/iu;
const NAMED = /^[a-z]{3,20}$/iu; // transparent, currentColor, red, … (letters only — no separators)
// Belt: reject anything carrying a CSS-escape or fetch vector even if it slipped a shape test.
const INJECTION = /[;{}<>()\\]|url|expression|javascript:|@import|\/\*/iu;

// A legit color value (oklch(...), #rrggbbaa, rgba(...)) is well under this; longer = a payload attempt.
const MAX_COLOR_LEN = 64;

/**
 * The D44 §12.1 color-safety predicate: a color must parse as one of the safe CSS color forms
 * (hex / rgb[a]() / hsl[a]() / oklch()/oklab() / a bare named color) and never carry an
 * injection vector (`url()`, `expression()`, `javascript:`, `@import`, a `{`/`;` escape). The ONE
 * clamp every raw-color acceptor shares (`ThemeScope`, `sandbox-frame`, `color-field`) — never
 * re-derive a color regex (UI-Primitives-and-Reuse.md §13.9).
 */
export function isSafeColor(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_COLOR_LEN) {
    return false;
  }
  // url()/expression() contain "(" so the INJECTION guard catches them; the shape guards below allow
  // the "(" ONLY inside the known color-function forms, which the guard would also flag — so check the
  // shape FIRST and only run the injection guard on the named/hex path (functional forms are exact).
  if (HEX.test(value) || NAMED.test(value)) {
    return !INJECTION.test(value);
  }
  return RGB.test(value) || HSL.test(value) || OKL.test(value);
}
