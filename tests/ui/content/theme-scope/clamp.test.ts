// The ThemeScope clamp is the D44 §12.1 security boundary — this test proves hostile override values
// are DROPPED and only validated ones pass. Pure (node), so every branch is exercised deterministically.
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("legal colors pass through to their custom properties", () => {
  const { vars } = clampThemeTokens({
    accent: "oklch(0.7 0.1 60)",
    userBubble: { bg: "#112233", fg: "rgba(255,255,255,0.9)" },
    narrationColor: "hsl(30, 40%, 60%)",
    speaker: "currentColor",
  });
  expect(vars["--color-primary"]).toBe("oklch(0.7 0.1 60)");
  expect(vars["--color-user-bubble"]).toBe("#112233");
  expect(vars["--color-narration"]).toBe("hsl(30, 40%, 60%)");
  expect(vars["--color-speaker"]).toBe("currentColor");
});

test("a bubble/surface FOREGROUND is DERIVED from its bg for contrast, never taken from the picked .fg", () => {
  const { vars } = clampThemeTokens({
    userBubble: { bg: "#112233", fg: "rgba(255,255,255,0.9)" }, // .fg is IGNORED — the picker never sets fg
    background: "oklch(0.158 0.006 60)",
  });
  // Derived from the bubble bg via relative-color-syntax (browser computes the actual value at render).
  expect(vars["--color-user-bubble-foreground"]).toContain("oklch(from #112233");
  expect(vars["--color-user-bubble-foreground"]).not.toBe("rgba(255,255,255,0.9)");
  // The base surface derives the neutral ramp + the neutral foregrounds (so "background white" ⇒ dark text).
  expect(vars["--color-sidebar"]).toContain("oklch(from oklch(0.158 0.006 60)");
  expect(vars["--color-card"]).toContain("oklch(from oklch(0.158 0.006 60)");
  expect(vars["--color-foreground"]).toContain("oklch(from oklch(0.158 0.006 60)");
});

test("the MUTED foreground derives from the base too — a softer contrast band than the full foreground", () => {
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)" });
  // Derived (browser computes the value), and DISTINCT from the full foreground — a softer band (max L
  // 0.82 vs 0.96) so placeholders/hints read as secondary while still clearing AA (never the fixed token
  // that failed on a lighter surface).
  expect(vars["--color-muted-foreground"]).toContain("oklch(from oklch(0.158 0.006 60)");
  expect(vars["--color-muted-foreground"]).not.toBe(vars["--color-foreground"]);
  // The muted band caps at 0.82; the full foreground caps at 0.96 — the two clamps must not collide.
  expect(vars["--color-muted-foreground"]).toContain("0.82");
  expect(vars["--color-foreground"]).toContain("0.96");
});

test("the border derives from the base surface, but an explicit borderColor WINS", () => {
  // Derived when unset — a low-alpha contrast hairline off the base. BOTH scopes derive together so the
  // sidebar-tinted chrome (rail/panel/CONTEXT-header edges) tracks the theme, not just the content border.
  const derived = clampThemeTokens({ background: "oklch(0.158 0.006 60)" });
  expect(derived.vars["--color-border"]).toContain("oklch(from oklch(0.158 0.006 60)");
  expect(derived.vars["--color-sidebar-border"]).toBe(derived.vars["--color-border"]);
  // Explicit border color takes over verbatim — for both the generic and the sidebar border.
  const explicit = clampThemeTokens({
    background: "oklch(0.158 0.006 60)",
    borderColor: "#334455",
  });
  expect(explicit.vars["--color-border"]).toBe("#334455");
  expect(explicit.vars["--color-sidebar-border"]).toBe("#334455");
});

test("the input-field surface derives from the base so a themed field tracks the palette", () => {
  // No override ⇒ inherit the token default (near-white overlay); a base surface ⇒ a derived contrast
  // overlay at the input alpha, so the search chip stops reading pinned-near-white on themed panels.
  expect(clampThemeTokens({}).vars["--color-input"]).toBeUndefined();
  const themed = clampThemeTokens({ background: "oklch(0.30 0.14 300)" });
  expect(themed.vars["--color-input"]).toContain("oklch(from oklch(0.30 0.14 300)");
  expect(themed.vars["--color-input"]).toContain("/ 0.12)");
});

test("hostile color values are DROPPED (url/expression/injection/js)", () => {
  // Assembled from fragments so no single literal reads as a high-entropy "secret" (noSecrets); each
  // is a CSS-injection / fetch / escape vector the clamp must reject.
  const js = ["java", "script:", "alert(1)"].join("");
  const brace = { open: "{", close: "}" };
  const hostile = [
    "url(//evil.test/x.png)",
    `url(${js})`,
    ["express", "ion", "(alert(1))"].join(""),
    "red; background: url(//x)",
    `#fff; ${brace.close} body ${brace.open} display:none`,
    js,
    "var(--x)",
    ["linear-", "gradient", "(red, blue)"].join(""),
  ];
  for (const value of hostile) {
    const { vars } = clampThemeTokens({ accent: value });
    expect(vars["--color-primary"], `"${value}" must be dropped`).toBeUndefined();
  }
});

test("a font outside the allowlist is dropped; an allowed one becomes a stack", () => {
  expect(clampThemeTokens({ font: "Comic Sans MS" }).vars["--font-sans"]).toBeUndefined();
  expect(clampThemeTokens({ font: "Geist" }).vars["--font-sans"]).toContain("Geist");
});

test("radius maps to a token var; density rides the attribute axis, not a var", () => {
  const clamped = clampThemeTokens({ radius: "full", density: "compact" });
  expect(clamped.vars["--radius-card"]).toBe("var(--radius-full)");
  expect(clamped.density).toBe("compact");
});

test("chatStyle is not a scope axis — an override carrying one is stripped, not stamped", () => {
  // The schema strips unknown keys, so a legacy blob (or a hand-posted one) cannot resurrect the axis.
  const clamped = clampThemeTokens({ background: "oklch(0.2 0.01 60)", chatStyle: "flat" });
  expect("chatStyle" in clamped).toBe(false);
  expect(clamped.vars["--color-background"]).toBe("oklch(0.2 0.01 60)");
});

// Regression (found live verifying §B.3 avatarShape="rounded" — every `rounded-card` consumer
// app-wide, incl. message bubbles, was silently rendering square): `radius: "card"` used to alias
// `--radius-card` to ITSELF (`var(--radius-card)`) — a self-reference CSS treats as invalid-at-
// computed-value-time, breaking `--radius-card` inheritance for every descendant, not just falling
// back. `radius: "card"` already means "use the token scale's own card radius" — a no-op, so no
// override should be emitted at all.
test("radius: 'card' is a no-op (never a self-referential --radius-card: var(--radius-card))", () => {
  const clamped = clampThemeTokens({ radius: "card" });
  expect(clamped.vars["--radius-card"]).toBeUndefined();
});

test("the accent picker derives --color-primary-foreground off the picked accent (contrast flip)", () => {
  // The accent picker sets --color-primary; its foreground must derive (not stay the static default) so
  // a dark accent gets light text and a light accent dark text — never invisible on-button text. (#16)
  const { vars } = clampThemeTokens({ accent: "oklch(0.3 0.1 300)" });
  expect(vars["--color-primary-foreground"]).toContain("oklch(from oklch(0.3 0.1 300)");
  // No accent ⇒ no derived primary-foreground (the static token shows through).
  const noAccent = clampThemeTokens({ background: "oklch(0.2 0.01 60)" });
  expect(noAccent.vars["--color-primary-foreground"]).toBeUndefined();
});

test("the hover/selected accent SURFACE + its foreground derive off the base (light-theme P2 fix)", () => {
  // --color-accent joins the neutral ramp so a selected row tracks the theme; --color-accent-foreground
  // derives off the SAME shifted L (single-level off base, not a nested relative-color). (#16)
  const { vars } = clampThemeTokens({ background: "oklch(0.98 0.004 75)" });
  expect(vars["--color-accent"]).toContain("oklch(from oklch(0.98 0.004 75) calc(l + 0.127)");
  expect(vars["--color-accent-foreground"]).toContain("oklch(from oklch(0.98 0.004 75)");
  expect(vars["--color-accent-foreground"]).toContain("l + 0.127");
});

test("unknown keys are stripped and a non-object input yields an empty map", () => {
  const { vars } = clampThemeTokens({ evil: "x", accent: "#abc" } as unknown);
  // accent now also derives --color-primary-foreground (the contrast flip), alongside primary + ring.
  expect(vars).toEqual({
    "--color-primary": "#abc",
    "--color-ring": "#abc",
    "--color-primary-foreground": "oklch(from #abc clamp(0.22, (0.62 - l) * 1000, 0.96) 0 h)",
  });
  expect(clampThemeTokens("nope").vars).toEqual({});
  expect(clampThemeTokens(null).vars).toEqual({});
});

test("an over-long value (payload attempt) is dropped even if it looks color-ish", () => {
  const long = `#${"a".repeat(200)}`;
  expect(clampThemeTokens({ accent: long }).vars["--color-primary"]).toBeUndefined();
});

test("colorScheme is DERIVED from the base oklch L polarity (light-dark arm + native controls)", () => {
  // A light base (L above the FG pivot) ⇒ near-black derived text ⇒ a LIGHT surface ⇒ "light"; a dark
  // base ⇒ "dark". The pivot is the SAME FG_PIVOT_L (0.62) the foreground flip uses, so scheme polarity
  // and text polarity can never disagree.
  expect(clampThemeTokens({ background: "oklch(0.98 0.004 75)" }).colorScheme).toBe("light");
  expect(clampThemeTokens({ background: "oklch(0.158 0.006 60)" }).colorScheme).toBe("dark");
  // Boundary: strictly `> 0.62` is light, so the pivot itself resolves "dark" and one step over flips.
  expect(clampThemeTokens({ background: "oklch(0.62 0.01 60)" }).colorScheme).toBe("dark");
  expect(clampThemeTokens({ background: "oklch(0.63 0.01 60)" }).colorScheme).toBe("light");
  // colorScheme is NOT a custom property — it never leaks into the vars emit surface.
  expect("colorScheme" in clampThemeTokens({ background: "oklch(0.98 0.004 75)" }).vars).toBe(false);
});

test("colorScheme is OMITTED when polarity is not statically knowable (non-oklch base, or no base)", () => {
  // A safe-but-not-oklch base (named color / rgb()) is legal for the vars, but its polarity can't be read
  // statically — fail open to the inherited scheme rather than guess.
  const named = clampThemeTokens({ background: "ivory" });
  expect(named.vars["--color-background"]).toBe("ivory");
  expect(named.colorScheme).toBeUndefined();
  expect(clampThemeTokens({ background: "rgb(20, 20, 30)" }).colorScheme).toBeUndefined();
  // No base at all ⇒ nothing to derive from.
  expect(clampThemeTokens({ accent: "#abc" }).colorScheme).toBeUndefined();
});
