// The ThemeScope clamp is the D44 §12.1 security boundary — this test proves hostile override values
// are DROPPED and only validated ones pass. Pure (node), so every branch is exercised deterministically.
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp";
import { expect, test } from "../../../support/fixtures";

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

test("radius maps to a token var; chatStyle/density ride the attribute axes, not vars", () => {
  const clamped = clampThemeTokens({ radius: "full", chatStyle: "flat", density: "compact" });
  expect(clamped.vars["--radius-card"]).toBe("var(--radius-full)");
  expect(clamped.chatStyle).toBe("flat");
  expect(clamped.density).toBe("compact");
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

test("unknown keys are stripped and a non-object input yields an empty map", () => {
  const { vars } = clampThemeTokens({ evil: "x", accent: "#abc" } as unknown);
  expect(vars).toEqual({ "--color-primary": "#abc", "--color-ring": "#abc" });
  expect(clampThemeTokens("nope").vars).toEqual({});
  expect(clampThemeTokens(null).vars).toEqual({});
});

test("an over-long value (payload attempt) is dropped even if it looks color-ish", () => {
  const long = `#${"a".repeat(200)}`;
  expect(clampThemeTokens({ accent: long }).vars["--color-primary"]).toBeUndefined();
});
