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
  await expect.poll(async () => Number.parseFloat(await soft.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
  // the 15% tint is NOT the opaque solid fill — compare the two rendered backgrounds directly.
  const softBg = await soft.evaluate((el) => getComputedStyle(el).backgroundColor);
  await soft.unmount();
  const solid = await mount(<Badge intent="info">Filtered</Badge>);
  const solidBg = await solid.evaluate((el) => getComputedStyle(el).backgroundColor);
  // ONESHOT-OK: the preceding web-first CSS assertions settled both badges before this cross-mount comparison.
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
  await expect.poll(async () => await ghost.evaluate((el) => Number.parseFloat(getComputedStyle(el).backgroundColor.split(",")[3] ?? "1"))).toBe(0);
  await expect(ghost).toHaveCSS("color", resolvedTokenColor("color.muted-foreground"));
  await expect.poll(async () => Number.parseFloat(await ghost.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
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
  // "Transparent" is READ OFF THE ENGINE (a fresh div's default background) rather than spelled as a
  // color literal — the §13.7 discipline, and more robust than guessing the serialization. The probe must
  // be IN THE DOCUMENT to read it: `getComputedStyle` on a DETACHED element resolves nothing and returns
  // `""`, so the opaque-layer test below compared against the empty string and the walk broke on its FIRST
  // iteration every time, silently reducing every composite to the document floor. That was invisible
  // while the CT page had no background of its own (floor = transparent = black, and the two known ratios
  // came out right for the wrong reason); it surfaced the moment the harness began loading the client
  // styles tier, whose `:root`/`body` rules give the page a real background (#114, 2026-08-16).
  const transparentProbe = document.body.appendChild(document.createElement("div"));
  const transparent = getComputedStyle(transparentProbe).backgroundColor;
  transparentProbe.remove();
  const layers: string[] = [];
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    layers.unshift(bg);
    const probe = document.createElement("canvas").getContext("2d");
    if (probe !== null) {
      probe.fillStyle = bg;
      // An opaque layer ends the walk — nothing below it can show through.
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
// ── THE LIGHT ARM of the pin above (2026-09-01) ────────────────────────────────────────────────────
// The test above mounts THEMELESS, which is the base (dark) palette — so for its whole life it judged
// one polarity, and the defect it exists to catch shipped in the other one. Measured by the variant-arm
// matrix: `intent=primary tone=soft` under `[data-theme=light]` was 3.97:1 at every size, because the
// light seed's `--color-primary` was a FILL lightness (oklch 0.55) doing INK duty — bare `text-primary`
// on the light background had only 4.86:1 to spend, so ANY tint under it fell through the floor. The
// other four accents never had that problem: destructive/success/warning/info each carry a hand-tuned
// polarity-aware LIGHT arm at L 0.47-0.50 (tokens.json), which is exactly what buys their soft chips
// their margin. The seed now puts primary in that same band.
//
// So the polarity is an ARM of this assertion, not a second suite: same chips, same composite, mounted
// under the light [data-theme] scope (the variant-arm-matrix wrapper pattern; the emitted block carries
// `color-scheme: light`, so the four light-dark() intents resolve their light arms here and their dark
// arms above). The broad per-arm sweep stays the matrix suite's job.
test("soft-tone text clears AA-NORMAL under the LIGHT theme too — the polarity this pin shipped blind on", async ({ mount }) => {
  const chips = await mount(
    <div className="bg-card" data-theme="light">
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
  for (const { testid, ratio } of measured) {
    expect(ratio, `${testid} soft-tone contrast (light)`).toBeGreaterThanOrEqual(4.5);
  }
});

// ── THE INTERACTIVE GROUND (2026-09-01) — the composition neither pin above could see ───────────────
// Both pins above measure a chip at REST on a card. But a ListRow and a Card paint `bg-accent` on HOVER
// (list-row/variants.ts:107,188,212 · card/variants.ts:34) UNDER whatever the row contains — and rows
// contain exactly this: status glosses (`text-destructive` in workload-row.tsx:212) and soft chips. The
// hover ground is a lighter/darker step away from the surface the tokens were tuned against, so it
// spends contrast that the card never charged for, and nobody had priced it: measured across all three
// seeds it put 42 (ink, ground) pairs under AA-NORMAL, worst 3.40:1.
//
// The fix was two-sided and is pinned here at BOTH ends: the soft tint dropped to 8% family-wide
// (badge/variants.ts) and `color.destructive`'s DARK arm joined the family band (tokens.json 0.65 ->
// 0.72), because destructive was the one ink with nothing to spend — at 0.65 it failed the hover ground
// even BARE, with no tint involved at all.
//
// The planted control is the historical value itself: the same chip with `--color-destructive` pinned
// back to oklch(0.65 0.19 25) inline MUST still fail, or this pin has gone blind and its green means
// nothing. That is the red-first receipt made permanent.
test("status ink and soft chips clear AA-NORMAL on the INTERACTIVE (hover) ground, in both polarities", async ({ mount }) => {
  for (const theme of ["hearth", "light"] as const) {
    const row = await mount(
      <div className="bg-accent" {...(theme === "light" ? { "data-theme": "light" } : {})}>
        <span className="text-destructive" data-testid="gloss">
          2 failed
        </span>
        <Badge data-testid="danger" intent="danger" tone="soft">
          12 stalled
        </Badge>
        <Badge data-testid="warning" intent="warning" tone="soft">
          10 queued
        </Badge>
        <Badge data-testid="primary" intent="primary" tone="soft">
          primary
        </Badge>
        <Badge data-testid="info" intent="info" tone="soft">
          info
        </Badge>
        <Badge data-testid="success" intent="success" tone="soft">
          ready
        </Badge>
      </div>,
    );
    const measured = await Promise.all(
      ["gloss", "danger", "warning", "primary", "info", "success"].map(async (testid) => {
        const [fg, bg] = await row.getByTestId(testid).evaluate(paintedColors);
        return { testid, ratio: contrastRatio(fg ?? [], bg ?? []) };
      }),
    );
    for (const { testid, ratio } of measured) {
      expect(ratio, `${testid} on the hover ground (${theme})`).toBeGreaterThanOrEqual(4.5);
    }
    await row.unmount();
  }
});

test("PLANTED CONTROL: a token that cannot pass on that ground still measures BELOW AA through this path", async ({ mount }) => {
  // The pin above is only worth its green if this exact measurement path can still go RED. The control is
  // a SURFACE token painted as ink — `text-muted` is one ramp step from the grounds it sits on, so it is
  // sub-AA by construction in every palette, no authored colour literal required (§13.7 bans those in a
  // primitive CT, and rightly: a literal control would drift from the palette it claims to represent).
  // The HISTORICAL arm — destructive at oklch(0.65) measuring 4.07:1 here — is pinned instead where a raw
  // value belongs, as the `seed-theme-ink-contrast` gate's own mustFlag row.
  const row = await mount(
    <div className="bg-accent">
      <span className="text-muted" data-testid="unreadable">
        2 failed
      </span>
    </div>,
  );
  const [fg, bg] = await row.getByTestId("unreadable").evaluate(paintedColors);
  expect(contrastRatio(fg ?? [], bg ?? []), "a surface token as ink must measure below AA — if this passes, the measurement has gone blind").toBeLessThan(4.5);
});

test("md size carries more horizontal padding than sm", async ({ mount }) => {
  const small = await mount(<Badge size="sm">Tag</Badge>);
  const smallPad = await small.evaluate((el) => getComputedStyle(el).paddingLeft);
  await small.unmount();
  const medium = await mount(<Badge size="md">Tag</Badge>);
  await expect
    .poll(async () => Number.parseFloat(await medium.evaluate((el) => getComputedStyle(el).paddingLeft)))
    .toBeGreaterThan(Number.parseFloat(smallPad));
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

// ── side-eye 2026-08-19 N-1: A BLOCK CHILD SPLITS AN INLINE BOX ────────────────────────────────────
// `size="inline"` is `display:inline`, and Tailwind's preflight blockifies every `svg`. So the icon+label
// chip the primitive's own doc invites ("compose a leading <Icon> as the first child") BREAKS on this arm:
// the block glyph splits the inline box in two, the mark lands alone on its own line, and the row grows
// ~74%. It is width-independent and structural — no `whitespace-nowrap` can reach it, because it is not a
// wrap. Measured on the databank list's `Empty` chip (28.25px against its 16.25px `Queued` sibling).
// Asserted as the GEOMETRY, never the class: the glyph chip's box must match its glyph-less sibling's, and
// the mark must sit ON the same line as the word it marks.
test("size=inline keeps a leading glyph ON the line — it does not split the inline box", async ({ mount }) => {
  const run = await mount(
    <p style={{ fontSize: "13px", lineHeight: "20px" }}>
      <Badge data-testid="marked" intent="warning" size="inline" tone="soft">
        {/* A RAW 12px svg, not `<Icon>`: playwright-ct rewrites a CT file's named component imports into
            generated consts and a second one here collides ("Identifier … has already been declared"). The
            mechanism under test is the ELEMENT — Tailwind's preflight blockifies every `svg`, whatever
            renders it — so the raw glyph is the faithful subject, not a stand-in. */}
        <svg aria-hidden={true} height="12" viewBox="0 0 12 12" width="12">
          <path d="M6 0 12 12H0z" />
        </svg>
        Empty
      </Badge>{" "}
      <Badge data-testid="plain" intent="warning" size="inline" tone="soft">
        Queued
      </Badge>
    </p>,
  );
  // ONE evaluate, AFTER `document.fonts.ready` — both facts are read from the same paint (2026-09-01).
  // Two sequential evaluates flaked: Geist ships `font-display: swap`, so the webfont could land BETWEEN
  // them and `marked` was measured with FALLBACK metrics (18px) against a `plain` measured with Geist
  // (17px). Nothing about the chips differed; the two reads simply disagreed about which font was live.
  const { marked, plain } = await run.evaluate(async (root) => {
    await root.ownerDocument.fonts.ready;
    const rect = (testid: string): { height: number; top: number } => {
      const box = root.querySelector(`[data-testid="${testid}"]`)?.getBoundingClientRect();
      return { height: box?.height ?? 0, top: box?.top ?? 0 };
    };
    return { marked: rect("marked"), plain: rect("plain") };
  });
  // The chip carrying a mark is the same line-box height as the chip that carries none.
  expect(marked.height).toBeCloseTo(plain.height, 1);
  // …and the mark rides beside its word rather than above it: the glyph's own box sits inside the chip's.
  let glyph = await run.getByTestId("marked").evaluate((el) => {
    const svg = el.querySelector("svg")?.getBoundingClientRect();
    const range = el.ownerDocument.createRange();
    const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (svg === undefined || text === undefined) {
      return null;
    }
    range.selectNodeContents(text);
    const label = range.getBoundingClientRect();
    return { labelCenter: label.top + label.height / 2, svgCenter: svg.top + svg.height / 2 };
  });
  await expect
    .poll(async () => {
      glyph = await run.getByTestId("marked").evaluate((el) => {
        const svg = el.querySelector("svg")?.getBoundingClientRect();
        const range = el.ownerDocument.createRange();
        const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (svg === undefined || text === undefined) {
          return null;
        }
        range.selectNodeContents(text);
        const label = range.getBoundingClientRect();
        return { labelCenter: label.top + label.height / 2, svgCenter: svg.top + svg.height / 2 };
      });
      return glyph;
    })
    .not.toBeNull();
  expect(Math.abs((glyph?.svgCenter ?? 0) - (glyph?.labelCenter ?? 0))).toBeLessThan(2);
});

// ── THE INDICATOR ARM (#1798) — the childless dot ────────────────────────────────────────────────────
// `size="dot"` exists because the topbar bell's unread mark was a full status pill printing a COUNT
// (owner: "ugly as fuck"). The claim this pin makes is that the arm is a real geometric shape and not a
// squashed pill: a fixed square from the spacing belt, fully circular, and — the property that made this
// an axis rather than a call-site className — carrying NONE of the `sm` pill's padding, because the size
// axis is exclusive. It still takes its fill from the intent axis, which is what keeps ONE dot in the app
// rather than a family of hand-painted spans.
test("size=dot is a childless square circle with none of the pill's padding", async ({ mount }) => {
  const dot = await mount(<Badge intent="primary" size="dot" aria-hidden={true} />);
  await expect(dot).toBeVisible();

  // ONE retrying read reduced to the claims (the `ct-no-oneshot-live-read-assert` settle rule); a failure
  // prints the whole verdict object, so the receipt names which property broke and at what pixels.
  await expect
    .poll(async () =>
      dot.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          // The belt step (`size-field`), read as a square rather than against a px literal.
          square: box.width === box.height,
          small: box.width > 0 && box.width <= 8,
          // Circular: `rounded-full` resolves to a huge px radius in Tailwind v4, so the claim is an inequality.
          circular: Number.parseFloat(style.borderRadius) >= box.width / 2,
          // NO padding — the `sm` arm's `px-row py-field` is not applied at all (the size axis is
          // exclusive), so the box is exactly the declared square and cannot be half-overridden into a
          // lozenge. This is the property that made `dot` an AXIS rather than a call-site className.
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(" "),
          box: { w: box.width, h: box.height },
        };
      }),
    )
    .toMatchObject({ square: true, small: true, circular: true, padding: "0px 0px 0px 0px" });

  // …and the fill is the intent's own token, not a hand-picked colour.
  await expect(dot).toHaveCSS("background-color", resolvedTokenColor("color.primary"));
});
