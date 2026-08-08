// CT: the badge/chip/pill seal — intent maps to the status token PAIR (computed color), sizes
// carry real padding (ui-package-design §6.1).

import { Badge } from "@orb/ui/badge";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

test("default intent is the neutral (muted) token background", async ({ mount }) => {
  const badge = await mount(<Badge>Draft</Badge>);
  await expect(badge).toHaveCSS("background-color", TOKENS["color.muted"].value);
});

test("success intent lands as the success token background", async ({ mount }) => {
  const badge = await mount(<Badge intent="success">Active</Badge>);
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.success"));
});

test("danger intent swaps to the destructive token", async ({ mount }) => {
  const badge = await mount(<Badge intent="danger">Failed</Badge>);
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
});

test("info intent lands as the real info token pair (solid)", async ({ mount }) => {
  // info now rides its OWN token pair (was borrowing the accent surface): bg-info + text-info-foreground.
  const badge = await mount(<Badge intent="info">Filtered</Badge>);
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.info"));
  await expect(badge).toHaveCSS("color", resolvedTokenColor("color.info-foreground"));
});

test("soft tone swaps the fill for a tinted background + intent-colored text + a border", async ({ mount }) => {
  // soft = `bg-info/15` (a color-mix tint, NOT the opaque solid) + `text-info` (the intent hue as text)
  // + a hairline border. Text is the info hue itself; the border is present (solid has none).
  const soft = await mount(
    <Badge intent="info" tone="soft">
      Nominated
    </Badge>,
  );
  await expect(soft).toHaveCSS("color", resolvedTokenColor("color.info"));
  const borderWidth = await soft.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(Number.parseFloat(borderWidth)).toBeGreaterThan(0);
  // the 15% tint is NOT the opaque solid fill — compare the two rendered backgrounds directly.
  const softBg = await soft.evaluate((el) => getComputedStyle(el).backgroundColor);
  await soft.unmount();
  const solid = await mount(<Badge intent="info">Filtered</Badge>);
  const solidBg = await solid.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(softBg).not.toBe(solidBg);
});

test("ghost tone drops the fill entirely, keeping the hairline outline + muted text", async ({ mount }) => {
  // The quietest tone: no background at ALL (soft still paints a 15% tint), so a dozen of them can rest
  // on a surface without competing with its one filled focal element. The fill is asserted as the
  // computed ALPHA (§4.2 clause 5 bans a color literal in a CT — and a token can't spell "no color").
  const ghost = await mount(
    <Badge intent="neutral" tone="ghost">
      noir
    </Badge>,
  );
  const alpha = await ghost.evaluate((el) => Number.parseFloat(getComputedStyle(el).backgroundColor.split(",")[3] ?? "1"));
  expect(alpha).toBe(0);
  await expect(ghost).toHaveCSS("color", resolvedTokenColor("color.muted-foreground"));
  const borderWidth = await ghost.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(Number.parseFloat(borderWidth)).toBeGreaterThan(0);
});

// ── side-eye 2026-08-08 P1-1: the SOFT tone's text must clear AA-NORMAL on its own tinted pill ─────────
// The `soft` tone is the one arm where the pill's background is NOT a token the palette suite already
// checks: it is a `bg-<intent>/15` tint composited over whatever surface the chip sits on, and the text is
// the intent hue itself. The palette suite proves `text-destructive` clears 4.5:1 on the CARD; it cannot
// see that the same red over a 15%-red tint of that card does not. Measured on the databank home tile:
// 4.28:1 at 13px/500, i.e. under AA-NORMAL, on the one chip in the app that says "this job is dead".
//
// The calculator below composites in a CANVAS (a translucent `color-mix` background is invisible to a
// naive computed-style read — the same reason a masked surface needs framebuffer sampling) and is
// VALIDATED IN-TEST against two known ratios before it is trusted for a verdict.

/** WCAG 2.x relative luminance + contrast, over sRGB 0-255 triples. */
function contrastRatio(fg: readonly number[], bg: readonly number[]): number {
  const luminance = (rgb: readonly number[]): number => {
    const channels = rgb.slice(0, 3).map((v) => {
      const c = v / 255;
      return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
  };
  const [light, dark] = [luminance(fg), luminance(bg)].toSorted((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** The element's PAINTED foreground + background as sRGB triples: every translucent background from the
 *  nearest opaque ancestor down is composited in a canvas, then the text color is composited on top of
 *  that. Returns `[fg, bg]`. */
const paintedColors = (el: Element): readonly (readonly number[])[] => {
  const layers: string[] = [];
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    layers.unshift(bg);
    const probe = document.createElement("canvas").getContext("2d");
    if (probe !== null) {
      probe.fillStyle = bg;
      // An opaque layer ends the walk — nothing below it can show through. "Transparent" is READ OFF THE
      // ENGINE (a fresh div's default background) rather than spelled as a color literal, which is both
      // the §13.7 discipline and more robust than guessing the serialization.
      const transparent = getComputedStyle(document.createElement("div")).backgroundColor;
      // biome-ignore lint/performance/useTopLevelRegex: serialized into the browser by `evaluate`
      const translucent = /\/\s*0?\.\d|,\s*0?\.\d+\)/u.test(probe.fillStyle);
      if (!translucent && probe.fillStyle !== transparent) {
        break;
      }
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return [[], []];
  }
  // The document's own canvas colour is the floor beneath every layer.
  ctx.fillStyle = getComputedStyle(document.documentElement).backgroundColor;
  ctx.fillRect(0, 0, 4, 4);
  for (const layer of layers) {
    ctx.fillStyle = layer;
    ctx.fillRect(0, 0, 4, 4);
  }
  const bg = [...ctx.getImageData(1, 1, 1, 1).data];
  ctx.fillStyle = getComputedStyle(el).color;
  ctx.fillRect(0, 0, 4, 4);
  const fg = [...ctx.getImageData(1, 1, 1, 1).data];
  return [fg, bg];
};

test("the calculator agrees with two KNOWN ratios before it is trusted", async ({ mount }) => {
  const probe = await mount(
    // The two CSS keywords whose contrast ratio is fixed by the spec at 21:1 (pure white on pure black) —
    // the calculator's known answer. Keywords, not color literals: §13.7 bans literal colors in a primitive
    // CT, and these are not design values, they are the arithmetic's fixed points.
    <div style={{ backgroundColor: "black" }}>
      <span data-testid="max" style={{ color: "white" }}>
        max
      </span>
      <span data-testid="none" style={{ color: "black" }}>
        none
      </span>
    </div>,
  );
  const measure = async (testid: string): Promise<number> => {
    const [fg, bg] = await probe.getByTestId(testid).evaluate(paintedColors);
    return contrastRatio(fg ?? [], bg ?? []);
  };
  // White on black is 21:1 and black on black is 1:1 — if either misses, the verdict below is noise.
  expect(await measure("max")).toBeCloseTo(21, 1);
  expect(await measure("none")).toBeCloseTo(1, 2);
});

test("soft-tone text clears AA-NORMAL over its own tint, on the surface it actually sits on", async ({ mount }) => {
  // Mounted on a CARD (the tile/pane surface every soft chip in the app rests on), because the tint
  // composites against whatever is under it — the ratio is a property of the PAIR, not of the token.
  const chips = await mount(
    <div className="bg-card">
      <Badge data-testid="danger" intent="danger" tone="soft">
        12 stalled
      </Badge>
      <Badge data-testid="warning" intent="warning" tone="soft">
        10 queued
      </Badge>
      <Badge data-testid="neutral" intent="neutral" tone="soft">
        11 empty
      </Badge>
      <Badge data-testid="success" intent="success" tone="soft">
        ready
      </Badge>
      <Badge data-testid="info" intent="info" tone="soft">
        info
      </Badge>
      <Badge data-testid="primary" intent="primary" tone="soft">
        primary
      </Badge>
    </div>,
  );
  const measured = await Promise.all(
    ["danger", "warning", "neutral", "success", "info", "primary"].map(async (testid) => {
      const [fg, bg] = await chips.getByTestId(testid).evaluate(paintedColors);
      return { testid, ratio: contrastRatio(fg ?? [], bg ?? []) };
    }),
  );
  // AA-NORMAL: the chip is 13px/500, which is not large text under any reading of the rule.
  for (const { testid, ratio } of measured) {
    expect(ratio, `${testid} soft-tone contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test("md size carries more horizontal padding than sm", async ({ mount }) => {
  const small = await mount(<Badge size="sm">Tag</Badge>);
  const smallPad = await small.evaluate((el) => getComputedStyle(el).paddingLeft);
  await small.unmount();
  const medium = await mount(<Badge size="md">Tag</Badge>);
  const mediumPad = await medium.evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(Number.parseFloat(mediumPad)).toBeGreaterThan(Number.parseFloat(smallPad));
});

// ── side-eye F-6 (2026-08-03): the IN-FLOW chip must not perturb the line box it lives in ──────────────
// The defect these pin: `size="sm"` inside a run of prose built a 28.25px box in a 20.15px line
// (`inline-flex` + `py-field` + its own `leading-label`), so every line carrying a `{{macro}}` shoved its
// neighbours apart, and the 8px side padding detached the following punctuation (`{{user}} 's voice`).
// Asserted as COMPUTED geometry against the SURROUNDING RUN, never against hardcoded px — a type retune
// must move both numbers together or this reds.

test("size=inline participates in the line box: display inline, zero padding, type inherited from the run", async ({ mount }) => {
  const run = await mount(
    <p data-testid="run" style={{ fontSize: "13px", lineHeight: "20px" }}>
      You are{" "}
      <Badge data-testid="chip" intent="info" size="inline">
        {"{{char}}"}
      </Badge>
      , here.
    </p>,
  );
  const chip = run.getByTestId("chip");
  await expect(chip).toHaveCSS("display", "inline");
  // NO padding on either axis — the braces the chip prints are its own optical padding, and any inline
  // padding reappears as a gap before the next character. Read in ONE evaluation: four awaits in a loop is
  // four round trips across four layout passes, and the claim is about a single resolved box.
  const padding = await chip.evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.paddingTop, style.paddingBottom, style.paddingLeft, style.paddingRight];
  });
  for (const px of padding) {
    expect(Number.parseFloat(px)).toBe(0);
  }
  // Type metrics INHERIT: the chip sets neither font-size nor line-height, so the run's rhythm is
  // arithmetically unchanged with a macro in it.
  // `run` IS the mounted <p> (the component root), so the run's own metrics come off it directly.
  const [chipSize, chipLeading, runSize, runLeading] = await Promise.all([
    chip.evaluate((el) => getComputedStyle(el).fontSize),
    chip.evaluate((el) => getComputedStyle(el).lineHeight),
    run.evaluate((el) => getComputedStyle(el).fontSize),
    run.evaluate((el) => getComputedStyle(el).lineHeight),
  ]);
  expect(chipSize).toBe(runSize);
  expect(chipLeading).toBe(runLeading);
});

test("size=inline never exceeds its line box, where size=sm does", async ({ mount }) => {
  const run = await mount(
    <p style={{ fontSize: "13px", lineHeight: "20px" }}>
      prose{" "}
      <Badge data-testid="flow" intent="info" size="inline">
        {"{{char}}"}
      </Badge>{" "}
      <Badge data-testid="pill" intent="info" size="sm">
        {"{{char}}"}
      </Badge>{" "}
      prose
    </p>,
  );
  const height = (testid: string): Promise<number> => run.getByTestId(testid).evaluate((el) => el.getBoundingClientRect().height);
  const lineBox = Number.parseFloat(await run.evaluate((el) => getComputedStyle(el).lineHeight));
  expect(await height("flow")).toBeLessThanOrEqual(lineBox);
  // The control arm: this is the shape that caused the damage, and it must still measurably overflow, or
  // the assertion above is passing for a reason other than the fix.
  expect(await height("pill")).toBeGreaterThan(lineBox);
});

test("size=inline steps the radius one below the pill", async ({ mount }) => {
  const both = await mount(
    <div>
      <Badge data-testid="pill" size="sm">
        Tag
      </Badge>
      <Badge data-testid="flow" size="inline">
        Tag
      </Badge>
    </div>,
  );
  const radius = (testid: string): Promise<number> => both.getByTestId(testid).evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius));
  const inset = await both.evaluate((el) => {
    const probe = el.ownerDocument.createElement("div");
    probe.style.borderRadius = "var(--radius-inset)";
    el.ownerDocument.body.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius);
    probe.remove();
    return px;
  });
  expect(await radius("flow")).toBe(inset);
  expect(await radius("flow")).toBeLessThan(await radius("pill"));
});
