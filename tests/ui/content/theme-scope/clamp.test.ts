// The ThemeScope clamp is the D44 §12.1 security boundary — this test proves hostile override values
// are DROPPED and only validated ones pass. Pure (node), so every branch is exercised deterministically.
import { parseCssColorToSrgb } from "../../../../packages/kit/src/safe-color/index.ts";
import type { Oklch } from "../../../../packages/kit/src/theme-derivation/index.ts";
import {
  AA_NORMAL_RATIO,
  compositeSrgb,
  oklchToSrgb,
  proseInkLightness,
  READING_BAND_ALPHA,
  srgbToOklch,
  THEME_DERIVATION,
  wcagContrastRatio,
} from "../../../../packages/kit/src/theme-derivation/index.ts";
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

test.each([
  ["background", { background: "currentColor" }, "--color-background"],
  ["accent", { accent: "LinkText" }, "--color-primary"],
  ["user bubble background", { userBubble: { bg: "ActiveText" } }, "--color-user-bubble"],
] as const)("a contextual %s is rejected before any derived CSS reaches the DOM", (_field, tokens, emittedVar) => {
  const { vars } = clampThemeTokens(tokens, "oklch(0.158 0.006 60)");
  expect(vars[emittedVar]).toBeUndefined();
});

test("contextual inherited inks and direct borders retain the general safe-color contract", () => {
  const { vars } = clampThemeTokens({ speaker: "currentColor", dialogueColor: "LinkText", borderColor: "ButtonText" });
  expect(vars["--color-speaker"]).toBe("currentColor");
  expect(vars["--color-dialogue"]).toBe("LinkText");
  expect(vars["--color-border"]).toBe("ButtonText");
  expect(vars["--color-sidebar-border"]).toBe("ButtonText");
});

test("a rejected derived field drops alone while valid broad-color siblings survive", () => {
  const { vars } = clampThemeTokens({
    background: "CuRrEnTcOlOr",
    speaker: "red",
    borderColor: "ButtonText",
    dialogueColor: "burlywood",
  });
  expect(vars["--color-background"]).toBeUndefined();
  expect(vars["--color-speaker"]).toBe("red");
  expect(vars["--color-border"]).toBe("ButtonText");
  expect(vars["--color-sidebar-border"]).toBe("ButtonText");
  expect(vars["--color-dialogue"]).toBe("burlywood");
});

test("invalid bubble children drop per field without discarding valid bubbles or direct siblings", () => {
  const { vars } = clampThemeTokens({
    userBubble: { bg: "ActiveText", fg: "red" },
    aiBubble: { bg: "burlywood", fg: "LinkText" },
    systemBubble: { bg: "red", fg: "expression(alert(1))" },
    speaker: "ButtonText",
  });
  expect(vars["--color-user-bubble"]).toBeUndefined();
  expect(vars["--color-ai-bubble"]).toBe("burlywood");
  expect(vars["--color-system-bubble"]).toBe("red");
  expect(vars["--color-speaker"]).toBe("ButtonText");
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

test.each([0.62, 0.6201, 0.63] as const)("#939 a pivot-side base at L=%s emits five concrete custom chart colors", (l) => {
  const { vars } = clampThemeTokens({ background: `oklch(${l} 0.01 60)` });
  const chart = [1, 2, 3, 4, 5].map((index) => vars[`--color-chart-${index}`]);
  expect(chart).toHaveLength(5);
  for (const color of chart) {
    expect(color).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/u);
    expect(color).not.toContain("light-dark(");
    expect(color).not.toContain("var(");
  }
});

test.each([
  ["named", "red"],
  ["named containing url letters", "burlywood"],
  ["transparent", "oklch(0.98 0.004 75 / 0)"],
  ["extreme-gamut", "oklch(0.2 3.6 225)"],
] as const)("#939 an accepted %s background emits five concrete chart colors without throwing", (_spelling, background) => {
  expect(() => clampThemeTokens({ background }, "oklch(0.158 0.006 60)")).not.toThrow();
  const { vars } = clampThemeTokens({ background }, "oklch(0.158 0.006 60)");
  expect([1, 2, 3, 4, 5].map((index) => vars[`--color-chart-${index}`])).toEqual([
    expect.stringMatching(/^oklch\(/u),
    expect.stringMatching(/^oklch\(/u),
    expect.stringMatching(/^oklch\(/u),
    expect.stringMatching(/^oklch\(/u),
    expect.stringMatching(/^oklch\(/u),
  ]);
});

test("#939 an invalid safe bare word preserves authored CSS but derives from ambient; nested alpha carries the resolved pixel", () => {
  const ambient = "oklch(0.158 0.006 60)";
  const inherited = clampThemeTokens({ background: "notacolorxx" }, ambient);
  const ambientRamp = clampThemeTokens({ background: ambient }, ambient);
  expect(inherited.vars["--color-background"]).toBe("notacolorxx");
  expect([1, 2, 3, 4, 5].map((index) => inherited.vars[`--color-chart-${index}`])).toEqual(
    [1, 2, 3, 4, 5].map((index) => ambientRamp.vars[`--color-chart-${index}`]),
  );

  const outer = clampThemeTokens({ background: "oklch(0.98 0.004 75 / 0.35)" }, ambient);
  if (outer.resolvedBackground === undefined) {
    throw new Error("partial-alpha outer scope did not resolve its painted backing");
  }
  const inner = clampThemeTokens({ background: "transparent" }, outer.resolvedBackground);
  if (inner.resolvedBackground === undefined) {
    throw new Error("transparent nested scope did not retain its ambient backing");
  }
  const pixel = (color: string): readonly number[] => {
    const rgb = parseCssColorToSrgb(color);
    return rgb === null ? [] : [Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b)];
  };
  expect(pixel(inner.resolvedBackground)).toEqual(pixel(outer.resolvedBackground));
  expect([1, 2, 3, 4, 5].map((index) => inner.vars[`--color-chart-${index}`])).toEqual([1, 2, 3, 4, 5].map((index) => outer.vars[`--color-chart-${index}`]));
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

// ── #692: THE AMBIENT ACCENT — a carried room's inherited fill, judged against the card it lands on ──
// `--color-primary` is the one PICKED token no base derives, so a palette that carries a background and no
// accent INHERITS the app theme's through the cascade. Hearth's over a near-white room's card measures
// 2.5858:1 — the arc meter's VALUE arc under WCAG 1.4.11's 3:1 (kit's `accentFillLightness` owns the
// algebra; these pin the clamp's POLICY: what it judges, what it emits, and what it must leave alone).
const HEARTH_ACCENT = "oklch(0.72 0.175 52)";
const NEAR_WHITE = "oklch(0.98 0.004 75)";
const HEARTH_BASE = "oklch(0.158 0.006 60)";

test("#692 an inherited accent that FAILS against the carried room's card is re-derived (hue/chroma kept)", () => {
  const { vars } = clampThemeTokens({ background: NEAR_WHITE }, undefined, HEARTH_ACCENT);
  // Relative colour off the AUTHOR's value: only L is spelled, `c h` are theirs, and the alpha slot is
  // explicit (an omitted slot inherits the ORIGIN's — the fixed point that never passes, stickler F1).
  expect(vars["--color-primary"]).toBe(`oklch(from ${HEARTH_ACCENT} 0.68 c h / 1)`);
  expect(vars["--color-ring"]).toBe(vars["--color-primary"]);
  // The label on the corrected fill derives off the SAME origin at the CORRECTED lightness — single-level,
  // never nested off the emitted fill. The 0.68 surface is measured light, so the label stays near-black (0.22):
  // the label must track the fill it lands on, not the fill the author picked.
  expect(vars["--color-primary-foreground"]).toBe(`oklch(from ${HEARTH_ACCENT} 0.22 0 h / 1)`);
});

test("#692 BYTE-IDENTICAL PASS-THROUGH: an inherited accent that CLEARS emits nothing at all", () => {
  // The cascade must stand exactly as it did — an ambient value is a JUDGING INPUT and can carry nothing
  // into the DOM on its own. Hearth's accent in a Hearth-dark room (6.83:1) and the Light seed's own
  // accent in a near-white room (5.07:1) are both no-ops.
  for (const [background, ambientAccent] of [
    [HEARTH_BASE, HEARTH_ACCENT],
    [NEAR_WHITE, "oklch(0.55 0.16 50)"],
  ] as const) {
    const { vars } = clampThemeTokens({ background }, undefined, ambientAccent);
    expect(vars["--color-primary"]).toBeUndefined();
    expect(vars["--color-ring"]).toBeUndefined();
    expect(vars["--color-primary-foreground"]).toBeUndefined();
  }
  // …and with NO carried background there is no derived card to judge against: pre-#692 behaviour stands.
  expect(clampThemeTokens({}, undefined, HEARTH_ACCENT).vars["--color-primary"]).toBeUndefined();
});

test("#692 a PICKED accent is judged too, and a clearing pick stays byte-identical", () => {
  // The picked arm is the same rule, not a second one: a pale accent on a light room is the same defect
  // an inherited one is.
  const pale = "oklch(0.92 0.05 200)";
  const corrected = clampThemeTokens({ accent: pale, background: "oklch(0.96 0.004 75)" }).vars["--color-primary"];
  expect(corrected).toBe(`oklch(from ${pale} 0.644 c h / 1)`);
  // A pick that clears reaches the DOM UNTOUCHED — the no-op-where-the-pick-was-sensible guarantee.
  const sensible = clampThemeTokens({ accent: "oklch(0.55 0.16 50)", background: NEAR_WHITE }).vars;
  expect(sensible["--color-primary"]).toBe("oklch(0.55 0.16 50)");
  expect(sensible["--color-primary-foreground"]).toContain("oklch(from oklch(0.55 0.16 50)");
  // A HOSTILE inherited accent cannot enter through the ambient door either — it is not a schema field,
  // so it is only ever an origin for a value this clamp itself spells; an unreadable one fails open.
  expect(clampThemeTokens({ background: NEAR_WHITE }, undefined, "rebeccapurple").vars["--color-primary"]).toBeUndefined();
});

test("#692 the accent SOURCE rides the struct for the descendant chain, never the emit surface", () => {
  const carried = clampThemeTokens({ background: NEAR_WHITE }, undefined, HEARTH_ACCENT);
  // A nested room must judge the AUTHOR's pick against its own card, so what flows down is the source —
  // and it is a value a static reader resolves, which the emitted relative-colour fill is not.
  expect(carried.accentSource).toBe(HEARTH_ACCENT);
  expect(clampThemeTokens({ accent: "oklch(0.4 0.1 20)" }, undefined, HEARTH_ACCENT).accentSource).toBe("oklch(0.4 0.1 20)");
  expect(clampThemeTokens({}).accentSource).toBeUndefined();
  expect("accentSource" in carried.vars).toBe(false);
});

test("the hover/selected accent SURFACE + its foreground derive off the base (light-theme P2 fix)", () => {
  // --color-accent joins the neutral ramp so a selected row tracks the theme; --color-accent-foreground
  // is solved against that actual shifted surface and emitted single-level off the base. (#16/#969)
  // The SHIFT is the base's polarity arm (#682): a near-white base's selected row recedes (−0.05, the
  // Light seed's own 0.93) instead of the dark arm's +0.127, which clamped it to the same white as the
  // card it sits on. What this test pins is that BOTH tokens read the same delta, whichever arm it is.
  const { vars } = clampThemeTokens({ background: "oklch(0.98 0.004 75)" });
  expect(vars["--color-accent"]).toContain("oklch(from oklch(0.98 0.004 75) calc(l + -0.05)");
  expect(vars["--color-accent-foreground"]).toBe("oklch(from oklch(0.98 0.004 75) 0.22 0 h / 1)");
  // …and on a DARK base both still spell the pre-#682 rise, byte for byte.
  const dark = clampThemeTokens({ background: "oklch(0.158 0.006 60)" }).vars;
  expect(dark["--color-accent"]).toContain("oklch(from oklch(0.158 0.006 60) calc(l + 0.127)");
  expect(dark["--color-accent-foreground"]).toBe("oklch(from oklch(0.158 0.006 60) 0.96 0 h / 1)");
});

// ── #682: THE RAMP'S DARK ARM IS BYTE-IDENTICAL — a FENCE, not a defect proof (it passed pre-fix too) ──
// The two-arm ramp's landing bar: not one dark room, and not one palette whose polarity we cannot read,
// may move a byte. Spelled as the literal emitted CSS rather than as a delta comparison, because the byte
// IS the guarantee.
const DARK_RAMP_EMIT: ReadonlyArray<readonly [name: string, css: string]> = [
  ["--color-sidebar", "oklch(from oklch(0.158 0.006 60) calc(l + -0.026) c h)"],
  ["--color-surface-raised", "oklch(from oklch(0.158 0.006 60) calc(l + 0.027) c h)"],
  ["--color-card", "oklch(from oklch(0.158 0.006 60) calc(l + 0.047) c h)"],
  ["--color-popover", "oklch(from oklch(0.158 0.006 60) calc(l + 0.087) c h)"],
  ["--color-accent", "oklch(from oklch(0.158 0.006 60) calc(l + 0.127) c h)"],
  ["--color-sidebar-accent", "oklch(from oklch(0.158 0.006 60) calc(l + 0.077) c h)"],
  ["--color-secondary", "oklch(from oklch(0.158 0.006 60) calc(l + 0.097) c h)"],
  ["--color-muted", "oklch(from oklch(0.158 0.006 60) calc(l + 0.097) c h)"],
];

test("#682 a DARK base emits the pre-#682 ramp byte-for-byte", () => {
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)" });
  for (const [name, css] of DARK_RAMP_EMIT) {
    expect(vars[name], name).toBe(css);
  }
});

test("#939 a named base is standards-resolved while its authored CSS spelling stays intact", () => {
  const { vars } = clampThemeTokens({ background: "rebeccapurple" });
  expect(vars["--color-card"]).toBe("oklch(from rebeccapurple calc(l + 0.047) c h)");
  expect(vars["--color-muted"]).toBe("oklch(from rebeccapurple calc(l + 0.097) c h)");
  expect(vars["--color-accent"]).toBe("oklch(from rebeccapurple calc(l + 0.127) c h)");
});

test("unknown keys are stripped and a non-object input yields an empty map", () => {
  const { vars } = clampThemeTokens({ evil: "x", accent: "#abc" } as unknown);
  // accent now also derives --color-primary-foreground (the contrast flip), alongside primary + ring.
  expect(vars).toEqual({
    "--color-primary": "#abc",
    "--color-ring": "#abc",
    "--color-primary-foreground": "oklch(from #abc 0.22 0 h / 1)",
  });
  expect(clampThemeTokens("nope").vars).toEqual({});
  expect(clampThemeTokens(null).vars).toEqual({});
});

test("an over-long value (payload attempt) is dropped even if it looks color-ish", () => {
  const long = `#${"a".repeat(200)}`;
  expect(clampThemeTokens({ accent: long }).vars["--color-primary"]).toBeUndefined();
});

test("colorScheme is derived from measured base polarity (light-dark arm + native controls)", () => {
  expect(clampThemeTokens({ background: "oklch(0.98 0.004 75)" }).colorScheme).toBe("light");
  expect(clampThemeTokens({ background: "oklch(0.158 0.006 60)" }).colorScheme).toBe("dark");
  expect(clampThemeTokens({ background: "oklch(0.55 0.01 60)" }).colorScheme).toBe("dark");
  expect(clampThemeTokens({ background: "oklch(0.62 0.01 60)" }).colorScheme).toBe("light");
  expect(clampThemeTokens({ background: "oklch(0.6201 0.01 60)" }).colorScheme).toBe("light");
  expect(clampThemeTokens({ background: "oklch(0.63 0.01 60)" }).colorScheme).toBe("light");
  // colorScheme is NOT a custom property — it never leaks into the vars emit surface.
  expect("colorScheme" in clampThemeTokens({ background: "oklch(0.98 0.004 75)" }).vars).toBe(false);
});

// ── #204: the READING PLATE emission — the over-art text backing rides the one-base derivation, at the
// POLARITY-AWARE alpha (#217): the L shift is spelled for the browser, the alpha is SOLVED in node. ──
test("a picked background emits --color-reading-plate as base + readingPlate.deltaL at the polarity-derived alpha", () => {
  // The owner's carried LIGHT palette (the #217 room): the light plate composites over dark art, so its
  // alpha is the derived 0.921, NOT the 0.65 floor. This is the byte-pin the fix moves.
  const { vars } = clampThemeTokens({ background: "oklch(0.98 0.004 78)" });
  expect(vars["--color-reading-plate"]).toBe("oklch(from oklch(0.98 0.004 78) calc(l + -0.038) c h / 0.921)");
  // A DARK base keeps the measured floor byte-for-byte — D144(d)'s sacred dark rooms do not move.
  expect(clampThemeTokens({ background: "oklch(0.158 0.006 60)" }).vars["--color-reading-plate"]).toBe(
    "oklch(from oklch(0.158 0.006 60) calc(l + -0.038) c h / 0.65)",
  );
  // Named colors are standards-resolved, so their plate gets the same polarity-derived alpha as numeric
  // colors. The 0.713 arm includes the framebuffer-headroom target, not merely analytic AA.
  expect(clampThemeTokens({ background: "rebeccapurple" }).vars["--color-reading-plate"]).toBe("oklch(from rebeccapurple calc(l + -0.038) c h / 0.713)");
  // No base ⇒ no plate (the static token shows through) — the plate is a DERIVATION, never a default.
  expect(clampThemeTokens({ accent: "#abc" }).vars["--color-reading-plate"]).toBeUndefined();
});

test.each([
  ["oklch(0.62 0.01 60)", "0.025"],
  ["oklch(0.6201 0.01 60)", "0.033"],
] as const)("#969 %s emits the dedicated reading-plate foreground", (background, inkL) => {
  const { vars } = clampThemeTokens({ background });
  // The pivot pair spends the attainable 4.6 derivation target in both dimensions: a slightly more
  // opaque plate and the nearest neutral ink that preserves framebuffer margin.
  expect(vars["--color-reading-plate"]).toBe(`oklch(from ${background} calc(l + -0.038) c h / 0.96)`);
  expect(vars["--color-reading-plate-foreground"]).toBe(`oklch(from ${background} ${inkL} 0 h / 1)`);
});

// ── #241: the sticky attribution BAND emission — the plate's colour at alpha 1, and the CLOSE-THE-LOOP
// judgement (D144c): the guarantee is not "we spelled a 1", it is that the two EMITTED values are the
// same colour and differ only in alpha. Read the emissions, don't re-derive them. ──
const BAND_RE = /^oklch\(from (?<origin>.+) calc\(l \+ (?<delta>[-\d.]+)\) c h \/ (?<alpha>[\d.]+)\)$/u;

test("a picked background emits --color-reading-band as the SAME derivation at alpha 1 — no step against the plate", () => {
  const bands: ReadonlyArray<readonly [label: string, background: string]> = [
    ["the carried LIGHT room (#217)", "oklch(0.98 0.004 78)"],
    ["a DARK base (the sacred rooms)", "oklch(0.158 0.006 60)"],
    ["a base neither reader resolves", "rebeccapurple"],
  ];
  for (const [label, background] of bands) {
    const { vars } = clampThemeTokens({ background });
    const band = BAND_RE.exec(vars["--color-reading-band"] ?? "");
    const plate = BAND_RE.exec(vars["--color-reading-plate"] ?? "");
    expect(band?.groups, `${label}: the band is emitted in the derived form`).toBeDefined();
    expect(plate?.groups, `${label}: the plate is emitted in the derived form`).toBeDefined();
    // The colour half: same origin, same L shift, and the shift is the PLATE's, not a second constant.
    expect(band?.groups?.["origin"], `${label}: the band derives off the same base`).toBe(plate?.groups?.["origin"]);
    expect(Number(band?.groups?.["delta"]), `${label}: the band takes the plate's deltaL`).toBe(THEME_DERIVATION.readingPlate.deltaL);
    expect(Number(band?.groups?.["delta"]), `${label}: …which is the plate's own`).toBe(Number(plate?.groups?.["delta"]));
    // The alpha half: opaque, and spelled EXPLICITLY (an omitted slot would inherit the origin's).
    expect(Number(band?.groups?.["alpha"]), `${label}: the band is opaque (#168 untouched)`).toBe(READING_BAND_ALPHA);
  }
  // Non-vacuity: on the arm the ruling was filed over, the plate is NOT opaque — so "same colour, different
  // alpha" is a real claim and not two identical strings.
  expect(Number(BAND_RE.exec(clampThemeTokens({ background: "oklch(0.158 0.006 60)" }).vars["--color-reading-plate"] ?? "")?.groups?.["alpha"])).toBeLessThan(
    READING_BAND_ALPHA,
  );
  // No base ⇒ no band, exactly like the plate: a DERIVATION, never a default.
  expect(clampThemeTokens({ accent: "#abc" }).vars["--color-reading-band"]).toBeUndefined();
});

// ── #243: the ELEVATION INGREDIENT emission — the five `--color-shadow-*` colours `--shadow-overlay` /
// `--shadow-cta` are built from, derived off the picked base's POLARITY (the composite itself is inlined
// by Tailwind at build time, so a var() ingredient is the only theme-reactive form). ──
const SHADOW_VARS = [
  "--color-shadow-hairline",
  "--color-shadow-highlight",
  "--color-shadow-ambient-near",
  "--color-shadow-ambient-far",
  "--color-shadow-cta-highlight",
] as const;

test("#243 a LIGHT base emits the light elevation arm — a dark ring, no inset, a lifted ambient", () => {
  const { vars } = clampThemeTokens({ background: "oklch(0.98 0.004 75)" });
  // The exact strings, because the whole defect was a value nobody could see: a white ring and two
  // near-black drops inherited from the base palette.
  expect(vars["--color-shadow-hairline"]).toBe("oklch(from oklch(0.98 0.004 75) 0.2 0.01 h / 0.14)");
  expect(vars["--color-shadow-highlight"]).toBe("oklch(from oklch(0.98 0.004 75) 1 0 h / 0)");
  expect(vars["--color-shadow-ambient-near"]).toBe("oklch(from oklch(0.98 0.004 75) 0.35 0.02 h / 0.1)");
  expect(vars["--color-shadow-ambient-far"]).toBe("oklch(from oklch(0.98 0.004 75) 0.35 0.02 h / 0.14)");
  expect(vars["--color-shadow-cta-highlight"]).toBe("oklch(from oklch(0.98 0.004 75) 1 0 h / 0.22)");
});

test("#243 a DARK base emits the base recipe unchanged — the sacred dark rooms do not move", () => {
  // Every dark-arm ingredient is chroma 0, so these resolve to the SAME white/black the base @theme
  // tokens spell (`oklch(1 0 0 / 0.06)` etc): hue is powerless at chroma 0. A dark custom theme that
  // used to INHERIT those values now emits them, and the pixels are identical.
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)" });
  expect(SHADOW_VARS.map((name) => vars[name])).toEqual([
    "oklch(from oklch(0.158 0.006 60) 1 0 h / 0.06)",
    "oklch(from oklch(0.158 0.006 60) 1 0 h / 0.08)",
    "oklch(from oklch(0.158 0.006 60) 0 0 h / 0.4)",
    "oklch(from oklch(0.158 0.006 60) 0 0 h / 0.5)",
    "oklch(from oklch(0.158 0.006 60) 1 0 h / 0.15)",
  ]);
});

test("#243 measured polarity selects both color-scheme and elevation", () => {
  for (const [background, scheme] of [
    ["oklch(0.55 0.01 60)", "dark"],
    ["oklch(0.62 0.01 60)", "light"],
  ] as const) {
    const clamped = clampThemeTokens({ background });
    expect(clamped.colorScheme, background).toBe(scheme);
    const lightArm = clamped.vars["--color-shadow-hairline"]?.includes(" 0.2 0.01 h / 0.14)") === true;
    expect(lightArm, `${background} elevation arm agrees with its color-scheme`).toBe(scheme === "light");
  }
});

test("#243 a standards-resolved named base emits the matching elevation ingredients", () => {
  const named = clampThemeTokens({ background: "rebeccapurple" }).vars;
  for (const name of SHADOW_VARS) {
    expect(named[name]).toContain("oklch(from rebeccapurple");
  }
  // No base at all ⇒ no ingredients either: they are a DERIVATION, never a default.
  const inkOnly = clampThemeTokens({ accent: "#abc" }).vars;
  expect(SHADOW_VARS.map((name) => inkOnly[name])).toEqual([undefined, undefined, undefined, undefined, undefined]);
});

// ── #204 §7a: the prose-ink clamp — the four author-picked inks judged against the picked base. ──
const PROSE_VARS = ["--color-speaker", "--color-dialogue", "--color-narration", "--color-prose-body"] as const;

test.each([
  ["LIGHT", "oklch(0.96 0.01 80)", "oklch(0.158 0.006 60)", 0.22],
  ["DARK", "oklch(0.18 0.01 60)", "oklch(0.98 0.004 75)", 0.96],
] as const)("#985 a background-only %s palette emits all four AA prose inks under the opposite ambient theme", (_polarity, background, ambient, inkL) => {
  const { vars } = clampThemeTokens({ background }, ambient);
  const emitted = PROSE_VARS.map((name) => vars[name]);

  // Four declarations are the inverse control: deleting any one fallback emission leaves an undefined
  // slot here and fails this exact base-only arm instead of silently inheriting the hostile outer ink.
  expect(emitted).toEqual(PROSE_VARS.map(() => `oklch(from ${background} ${inkL} 0 h / 1)`));

  const baseRgb = parseCssColorToSrgb(background);
  if (baseRgb === null) {
    throw new Error(`the planted #985 base did not parse: ${background}`);
  }
  const base = srgbToOklch(baseRgb);
  const ink = { l: inkL, c: 0, h: base.h };
  for (const [index, name] of PROSE_VARS.entries()) {
    expect(wcagContrastRatio(oklchToSrgb(ink), oklchToSrgb(base)), `${name} at slot ${String(index)}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  }
});

test("#985 no carried background preserves prose inheritance even when an ambient base is known", () => {
  const { vars } = clampThemeTokens({}, "oklch(0.98 0.004 75)");
  expect(PROSE_VARS.map((name) => vars[name])).toEqual([undefined, undefined, undefined, undefined]);
});

test("a SENSIBLE authored ink passes through BYTE-IDENTICAL (the no-op-where-the-card-was-sensible arm)", () => {
  // Birdie's real palette: dialogue L 0.4 on base L 0.98 clears AA (~8.5:1) — the clamp must not move it.
  const { vars } = clampThemeTokens({ background: "oklch(0.98 0.004 78)", dialogueColor: "oklch(0.4 0.1 40)" });
  expect(vars["--color-dialogue"]).toBe("oklch(0.4 0.1 40)");
});

test("an ILLEGIBLE authored ink keeps its hue+chroma and gets the derived lightness (the #204 worst-case card)", () => {
  // A dark ink on a dark base — the exact divorce class: L re-derives (0.96, the dark-base arm of the
  // pivot flip), the author's chroma/hue ride the relative-color form untouched.
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)", dialogueColor: "oklch(0.3 0.1 40)" });
  expect(vars["--color-dialogue"]).toBe("oklch(from oklch(0.3 0.1 40) 0.96 c h / 1)");
  // …and all four ink fields ride the same clamp.
  const light = clampThemeTokens({
    background: "oklch(0.98 0.004 78)",
    speaker: "oklch(0.9 0.05 60)",
    narrationColor: "oklch(0.92 0.02 60)",
    bodyColor: "oklch(0.95 0.01 60)",
  });
  // Light inks on a light base all fail AA and re-derive to the light-base arm (0.22).
  expect(light.vars["--color-speaker"]).toBe("oklch(from oklch(0.9 0.05 60) 0.22 c h / 1)");
  expect(light.vars["--color-narration"]).toBe("oklch(from oklch(0.92 0.02 60) 0.22 c h / 1)");
  expect(light.vars["--color-prose-body"]).toBe("oklch(from oklch(0.95 0.01 60) 0.22 c h / 1)");
});

test("the ink clamp judges hex/rgb()/hsl()/oklch()/oklab(), and fails open only for a value no reader resolves", () => {
  // No base: nothing to judge against — pass through (same rule as colorSchemeFor).
  expect(clampThemeTokens({ dialogueColor: "oklch(0.3 0.1 40)" }).vars["--color-dialogue"]).toBe("oklch(0.3 0.1 40)");
  // A NAMED color has no statically-readable value (kit's parser is numeric-only) — pass through.
  const named = clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: "wheat" });
  expect(named.vars["--color-narration"]).toBe("wheat");
  // `oklab()` is judged too (stickler F4, 2026-08-18 — it used to fail open): an isSafeColor-legal OKL
  // spelling, read through kit's lab→lch math, so a dark oklab ink on a dark base clamps like any other.
  const oklabDark = clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: "oklab(0.3 0.02 0.01)" });
  expect(oklabDark.vars["--color-narration"]).toBe("oklch(from oklab(0.3 0.02 0.01) 0.96 c h / 1)");
  const oklabLight = clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: "oklab(0.86 0.02 0.01)" });
  expect(oklabLight.vars["--color-narration"]).toBe("oklab(0.86 0.02 0.01)");
  // The residual fail-open (MEASURED, not assumed): modern unitless hsl — kit's hsl reader requires the
  // `%`. Named colors were never the only one, and the exotic spellings the review named as fail-opens
  // (`oklch(… 40deg)`, `hsl(-30, 40%, 20%)`) are DROPPED by isSafeColor before the clamp ever sees them.
  const unitlessHsl = clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: "hsl(30 40 20)" });
  expect(unitlessHsl.vars["--color-narration"]).toBe("hsl(30 40 20)");
  for (const dropped of ["oklch(0.3 0.1 40deg)", "hsl(-30, 40%, 20%)"]) {
    expect(clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: dropped }).vars["--color-narration"]).toBeUndefined();
  }
  // An hsl() ink over a dark base (#204 format widening): a LIGHT hsl ink passes; a DARK one clamps —
  // the format is parsed via kit's parseCssColorToSrgb + srgbToOklch, never failed-open on spelling.
  const hslLight = clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: "hsl(30, 40%, 60%)" });
  expect(hslLight.vars["--color-narration"]).toBe("hsl(30, 40%, 60%)");
  const hslDark = clampThemeTokens({ background: "oklch(0.158 0.006 60)", narrationColor: "hsl(30, 40%, 20%)" });
  expect(hslDark.vars["--color-narration"]).toBe("oklch(from hsl(30, 40%, 20%) 0.96 c h / 1)");
  // An rgb() BASE is judged too: dark base + dark oklch ink ⇒ the clamp fires.
  const rgbBase = clampThemeTokens({ background: "rgb(20, 20, 30)", dialogueColor: "oklch(0.3 0.1 40)" });
  expect(rgbBase.vars["--color-dialogue"]).toBe("oklch(from oklch(0.3 0.1 40) 0.96 c h / 1)");
  // …and a hex ink on a hex base: light-on-light clamps to the dark arm.
  const hexPair = clampThemeTokens({ background: "#f5f0e8", dialogueColor: "#e0d8c8" });
  expect(hexPair.vars["--color-dialogue"]).toBe("oklch(from #e0d8c8 0.22 c h / 1)");
});

test("a TRANSLUCENT authored ink is composited over the base before judging (a naive ratio on alpha lies)", () => {
  // A light ink at 50% alpha over a dark base composites to a mid tone that fails AA — the clamp fires
  // even though the ink's own opaque value would have passed.
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)", dialogueColor: "oklch(0.75 0.05 60 / 0.35)" });
  expect(vars["--color-dialogue"]).toBe("oklch(from oklch(0.75 0.05 60 / 0.35) 0.96 c h / 1)");
});

// The CORRECTED emission, read the way the BROWSER reads it: `oklch(from <picked> <L> c h[ / <A>])`
// keeps the origin's chroma/hue, and — when the alpha slot is OMITTED — the ORIGIN'S ALPHA (the CSS
// relative-color default). Resolving it here rather than trusting the string is what makes the
// close-the-loop assertions below measure the pixels, not the mechanism.
const CORRECTED_RE = /^oklch\(from .+ ([\d.]+) c h(?:\s*\/\s*([\d.]+))?\)$/;
const OKLCH_LITERAL_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/;
function renderedInk(picked: string, emitted: string): { readonly ink: Oklch; readonly alpha: number } {
  const author = parseOklchLiteral(picked) ?? srgbAuthor(picked);
  const m = CORRECTED_RE.exec(emitted);
  if (m?.[1] === undefined) {
    throw new Error(`not a corrected emission: ${emitted}`);
  }
  return { ink: { l: Number(m[1]), c: author.c, h: author.h }, alpha: m[2] === undefined ? author.alpha : Number(m[2]) };
}
function parseOklchLiteral(picked: string): { readonly c: number; readonly h: number; readonly alpha: number } | null {
  const m = OKLCH_LITERAL_RE.exec(picked);
  return m?.[2] === undefined || m[3] === undefined ? null : { c: Number(m[2]), h: Number(m[3]), alpha: m[4] === undefined ? 1 : Number(m[4]) };
}
function srgbAuthor(picked: string): { readonly c: number; readonly h: number; readonly alpha: number } {
  const srgb = parseCssColorToSrgb(picked);
  if (srgb === null) {
    throw new Error(`unreadable authored ink: ${picked}`);
  }
  const o = srgbToOklch(srgb);
  return { c: o.c, h: o.h, alpha: srgb.alpha };
}

test("a CORRECTED ink CLOSES THE LOOP: the emission itself clears AA, even when the author's ink was translucent", () => {
  // The guarantee, not the mechanism (stickler F1, 2026-08-18): the pre-fix emission kept the origin's
  // alpha, so a translucent failing ink was re-composited at 0.35 and still measured 2.89:1 — and
  // re-judging it returned the SAME clamped L, a fixed point that never passes.
  const darkBase = { l: 0.158, c: 0.006, h: 60 };
  const darkBaseRgb = oklchToSrgb(darkBase);
  const translucent = "oklch(0.75 0.05 60 / 0.35)";
  const dark = clampThemeTokens({ background: "oklch(0.158 0.006 60)", dialogueColor: translucent });
  const rendered = renderedInk(translucent, dark.vars["--color-dialogue"] ?? "");
  const painted = compositeSrgb(oklchToSrgb(rendered.ink), rendered.alpha, darkBaseRgb);
  expect(wcagContrastRatio(painted, darkBaseRgb)).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  // …and the clamp's OWN judge now passes the corrected ink: one correction settles, never a fixed point.
  expect(proseInkLightness(rendered.ink, rendered.alpha, darkBase)).toBeNull();

  // The ST-import population is rgba()-heavy: same guarantee for a translucent rgba ink on a hex base.
  const lightBase = srgbToOklch(parseCssColorToSrgb("#f5f0e8") ?? { r: 0, g: 0, b: 0 });
  const lightBaseRgb = oklchToSrgb(lightBase);
  const rgba = "rgba(240, 230, 200, 0.4)";
  const light = clampThemeTokens({ background: "#f5f0e8", dialogueColor: rgba });
  const lightRendered = renderedInk(rgba, light.vars["--color-dialogue"] ?? "");
  const lightPainted = compositeSrgb(oklchToSrgb(lightRendered.ink), lightRendered.alpha, lightBaseRgb);
  expect(wcagContrastRatio(lightPainted, lightBaseRgb)).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  expect(proseInkLightness(lightRendered.ink, lightRendered.alpha, lightBase)).toBeNull();
});

// ── #236: the AMBIENT-BASE arm of §7a — an ink-only card judged against the app theme it lands on. ──
// The population is the ST-imported library: a card carries `--color-speaker/dialogue/narration` and NO
// background (a 113-116 byte theme-scope payload, measured on 4/4 probed rooms), so the pre-#236 clamp
// failed open and a dark-authored ink landed raw on the Light seed base at 2.11-2.43:1.
const LIGHT_SEED_BASE = "oklch(0.98 0.004 75)"; // SEED_THEME_VALUE_SETS.light --color-background
const ST_DARK_INK = "oklch(0.72 0.16 174)"; // the measured ST ink (all three voices carry it)

test("an INK-ONLY override is judged against the AMBIENT app base — the emitted correction closes the loop at AA", () => {
  const { vars } = clampThemeTokens({ speaker: ST_DARK_INK, dialogueColor: ST_DARK_INK, narrationColor: ST_DARK_INK }, LIGHT_SEED_BASE);
  // Not the mechanism, the GUARANTEE (D144c): re-judge the EMITTED value against the ambient base.
  const ambient = { l: 0.98, c: 0.004, h: 75 };
  const ambientRgb = oklchToSrgb(ambient);
  for (const name of ["--color-speaker", "--color-dialogue", "--color-narration"]) {
    const emitted = vars[name] ?? "";
    const rendered = renderedInk(ST_DARK_INK, emitted);
    const painted = compositeSrgb(oklchToSrgb(rendered.ink), rendered.alpha, ambientRgb);
    expect(wcagContrastRatio(painted, ambientRgb), `${name} over the ambient Light base`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    expect(proseInkLightness(rendered.ink, rendered.alpha, ambient), `${name} settles in ONE correction`).toBeNull();
  }
  // A SENSIBLE ink against the ambient still passes through byte-identical — the ambient arm judges, it
  // does not repaint: a dark ink authored for a dark card is legible on the dark app base.
  expect(clampThemeTokens({ dialogueColor: ST_DARK_INK }, "oklch(0.158 0.006 60)").vars["--color-dialogue"]).toBe(ST_DARK_INK);
});

test("the ambient base NEVER emits and NEVER overrides a CARRIED background (the owner arm cannot move)", () => {
  // The ambient is a JUDGING input only: no surface ramp, no plate, no --color-background, no colorScheme.
  const inkOnly = clampThemeTokens({ narrationColor: ST_DARK_INK }, LIGHT_SEED_BASE);
  expect(inkOnly.vars["--color-background"]).toBeUndefined();
  expect(inkOnly.vars["--color-reading-plate"]).toBeUndefined();
  expect(inkOnly.vars["--color-reading-band"]).toBeUndefined();
  expect(inkOnly.vars["--color-sidebar"]).toBeUndefined();
  expect(inkOnly.vars["--color-foreground"]).toBeUndefined();
  expect(inkOnly.colorScheme).toBeUndefined();
  // A carried background wins OUTRIGHT: the full-palette rooms (Rust/Ashen) are byte-identical with or
  // without an ambient, every var, both polarities. This is the D144 "theme-immune transcript" pin.
  const carried = { background: "oklch(0.158 0.006 60)", speaker: "oklch(0.9 0.05 60)", dialogueColor: ST_DARK_INK, narrationColor: "oklch(0.3 0.1 40)" };
  expect(clampThemeTokens(carried, LIGHT_SEED_BASE)).toStrictEqual(clampThemeTokens(carried));
  const carriedLight = { background: "oklch(0.98 0.004 78)", dialogueColor: "oklch(0.4 0.1 40)", narrationColor: "oklch(0.92 0.02 60)" };
  expect(clampThemeTokens(carriedLight, "oklch(0.158 0.006 60)")).toStrictEqual(clampThemeTokens(carriedLight));
});

test("the TRUE fail-open survives only where no deterministic color or ambient exists", () => {
  // No ambient at all (a provider-less mount / a caller that cannot name the base) — the pre-#236 rule.
  expect(clampThemeTokens({ dialogueColor: "oklch(0.3 0.1 40)" }).vars["--color-dialogue"]).toBe("oklch(0.3 0.1 40)");
  // Standards named colors are readable on both sides and therefore receive the same guarantee.
  expect(clampThemeTokens({ dialogueColor: ST_DARK_INK }, "rebeccapurple").vars["--color-dialogue"]).toContain("oklch(from");
  expect(clampThemeTokens({ background: "rebeccapurple", dialogueColor: ST_DARK_INK }, LIGHT_SEED_BASE).vars["--color-dialogue"]).toContain("oklch(from");
  // An invalid safe bare word has no deterministic color and stays untouched.
  expect(clampThemeTokens({ narrationColor: "notacolorxx" }, LIGHT_SEED_BASE).vars["--color-narration"]).toBe("notacolorxx");
});

test("colorScheme derives for every standards-readable base spelling", () => {
  const named = clampThemeTokens({ background: "ivory" });
  expect(named.vars["--color-background"]).toBe("ivory");
  expect(named.colorScheme).toBe("light");
  // #204 format widening: rgb()/hex/hsl() bases resolve their polarity through kit's sRGB→OKLCH inverse.
  expect(clampThemeTokens({ background: "rgb(20, 20, 30)" }).colorScheme).toBe("dark");
  expect(clampThemeTokens({ background: "#f5f0e8" }).colorScheme).toBe("light");
  expect(clampThemeTokens({ background: "hsl(30, 40%, 10%)" }).colorScheme).toBe("dark");
  expect(clampThemeTokens({ background: "notacolorxx" }, "oklch(0.158 0.006 60)").colorScheme).toBe("dark");
  // No base at all ⇒ nothing to derive from.
  expect(clampThemeTokens({ accent: "#abc" }).colorScheme).toBeUndefined();
});

// #2424 — THE INHERITED-INK AXIS. A scope that CARRIES a surface owns both halves of the pairing, so it
// must restate the `color` its descendants take by inheritance; a scope that carries none must emit
// nothing, or an ink-only ST override would repaint its host's prose. The value is the var reference, not
// a resolved colour: the emitted `--color-foreground` is relative-colour syntax and only the engine
// resolves it.
test("#2424 `color` is emitted exactly where the scope carries its own surface", () => {
  const carried = clampThemeTokens({ background: "oklch(0.158 0.006 60)" });
  expect(carried.vars["--color-foreground"]).toBeDefined();
  expect(carried.color).toBe("var(--color-foreground)");
  // Ink-only (the #236 ST population): no surface, no restatement, cascade intact.
  const inkOnly = clampThemeTokens({ narrationColor: ST_DARK_INK }, LIGHT_SEED_BASE);
  expect(inkOnly.vars["--color-foreground"]).toBeUndefined();
  expect(inkOnly.color).toBeUndefined();
  // An ambient background is a JUDGING input only — it can carry nothing into the DOM, this axis included.
  expect(clampThemeTokens({ accent: "#abc" }, LIGHT_SEED_BASE).color).toBeUndefined();
});
