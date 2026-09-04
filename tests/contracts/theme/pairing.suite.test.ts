// The D44 §12.5 STRUCTURAL-PAIRING suite (mirror-exempt `.suite` kind — one property spanning two
// packages): the `@orb/contracts/theme` WIRE clamp and the `@orb/ui` `<ThemeScope>` RENDER clamp
// are a DELIBERATE two-copy (the cake forbids either importing the other); this suite is what
// keeps the copies byte-equivalent — identical field-key sets, identical enum members, identical
// font allowlist. Tests may import both packages; the packages never import each other.

import { THEME_DENSITIES, THEME_FONT_ALLOWLIST, THEME_RADII, themeOverrideSchema } from "@orb/contracts/theme";
import { THEME_SCOPE_DENSITIES, THEME_SCOPE_RADII, themeScopeTokensSchema, THEME_FONT_ALLOWLIST as UI_FONTS } from "@orb/ui/theme-scope";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("ThemeOverride wire ↔ ThemeScope render pairing (D44 §12.5)", () => {
  test("identical field-key sets", () => {
    const wireKeys = Object.keys(themeOverrideSchema.shape).sort();
    const renderKeys = Object.keys(themeScopeTokensSchema.shape).sort();
    expect(wireKeys).toEqual(renderKeys);
  });

  test("identical font allowlists", () => {
    expect([...THEME_FONT_ALLOWLIST]).toEqual([...UI_FONTS]);
  });

  test("identical enum members: density, radius", () => {
    expect([...THEME_DENSITIES]).toEqual([...THEME_SCOPE_DENSITIES]);
    expect([...THEME_RADII]).toEqual([...THEME_SCOPE_RADII]);
  });

  // `chatStyle` is deliberately NOT an axis on either side (TD/O-4) — it is the viewer's own appearance
  // setting, whose vocabulary contracts still homes. Pinned both ways so a re-add cannot land on one side.
  test("neither clamp carries a chatStyle axis", () => {
    expect("chatStyle" in themeOverrideSchema.shape).toBe(false);
    expect("chatStyle" in themeScopeTokensSchema.shape).toBe(false);
  });

  // #1358 — THE ONE DELIBERATE DIVERGENCE, pinned so it cannot become an accident. The clamps stay
  // byte-mirrored on SHAPE (keys, enums, fonts) and on the hostile-value verdict, but they answer the
  // RENDERABILITY question differently ON PURPOSE, because they sit at different boundaries:
  //   • the WIRE clamp is a WRITE boundary — storing a value the renderer cannot resolve is the #1358
  //     defect (it saves cleanly and then emits nothing, with no error and no fallback), so it refuses.
  //   • the RENDER clamp is a PAINT boundary with a load-bearing fail-open (#939): our parser is narrower
  //     than the browser's, and a value it cannot read still emits its authored spelling while the ramp
  //     derives from ambient. Tightening it was measured to DELETE the ambient-derived ramp outright.
  // The user never meets the divergence: the write boundary refuses first, by name, in the ColorField.
  test("the clamps diverge ONLY on renderability — the wire refuses to STORE what the renderer would merely ignore", () => {
    const unrenderable = { accent: "notacolorxx", speaker: "notacolorxx", bodyColor: "red" };
    const wire = themeOverrideSchema.parse(unrenderable);
    const render = themeScopeTokensSchema.parse(unrenderable);
    expect(wire.accent).toBeUndefined();
    expect(wire.speaker).toBeUndefined();
    expect(render.accent).toBe("notacolorxx");
    expect(render.speaker).toBe("notacolorxx");
    // …and everything renderable still parses identically on both sides.
    expect(wire.bodyColor).toBe("red");
    expect(render.bodyColor).toBe("red");
  });

  test("the clamps AGREE on a hostile value (both drop it; both keep the safe sibling)", () => {
    const hostile = { accent: "url(https://evil.example/x)", bodyColor: "red" };
    const wire = themeOverrideSchema.parse(hostile);
    const render = themeScopeTokensSchema.parse(hostile);
    expect(wire.accent).toBeUndefined();
    expect(wire.bodyColor).toBe("red");
    expect(render).toEqual(wire);
  });
});
