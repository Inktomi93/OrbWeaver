// CT: the density tier MECHANISM, asserted by COMPUTED VALUE (UI-Density-Law.md §4.2 build step 0 +
// §5.3). This is the second lens the `density-tier` gate structurally cannot be: that gate reads literal
// class shapes, so a computed className, a `cn(cond && X)`, or a stylesheet regression is INVISIBLE to it
// and reports a silent GREEN. Everything here reads back what the browser actually resolved.
//
// The two properties under test (the whole seal rests on them):
//   1. UNLAYERED BEATS LAYERED — tiers.css is imported outside `@layer`, Tailwind emits utilities INTO
//      `@layer utilities`, so `[data-surface-tier] [data-slot="card-root"]` overrides Card's own `p-block`
//      utility default regardless of specificity. If Tailwind ever changed that, every tier step would
//      silently fall back to the primitive default and this suite is what says so.
//   2. THE NEAREST TIER WINS — the steps ride INHERITED custom properties, so a form island inside an
//      instrument surface (and the reverse) resolves ITS OWN tier, not source order.
//
// Every expected value is resolved FROM THE SAME DOCUMENT (`resolveToken`), never a hardcoded px: a token
// retune must not red this file, and an authored-string assertion would stay green through a visual
// regression (the Waystone lesson). One `mount()` per test — a second throws.
import { Avatar } from "@orb/ui/avatar";
import { Card } from "@orb/ui/card";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Input } from "@orb/ui/input";
import { Surface } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MessageMedia } from "@orb/ui/message-media";
import { SandboxFrame } from "@orb/ui/sandbox-frame";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { ReactElement } from "react";

/** The px a token resolves to IN THE LIVE DOCUMENT — a throwaway probe node, so the value is whatever the
 *  cascade (theme.css, a theme value-set, a density re-binding) actually produced, not what tokens.json says. */
function resolveToken(el: Locator, token: string): Promise<number> {
  return el.evaluate((node, name) => {
    const probe = node.ownerDocument.createElement("div");
    probe.style.padding = `var(${name})`;
    node.ownerDocument.body.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    return px;
  }, token);
}

/** Resolve a token inside the locator's inherited scope rather than at the document root. */
function resolveInheritedToken(el: Locator, token: string): Promise<number> {
  return el.evaluate((node, name) => {
    const probe = node.ownerDocument.createElement("div");
    probe.style.padding = `var(${name})`;
    node.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    return px;
  }, token);
}

/** The computed px of one longhand on one element. */
function computedPx(el: Locator, property: "paddingTop" | "borderTopLeftRadius"): Promise<number> {
  return el.evaluate((node, prop) => Number.parseFloat(getComputedStyle(node)[prop]), property);
}

test("instrument tier resolves the Card's padding to --spacing-row (unlayered beats the p-block utility)", async ({ mount }) => {
  const surface = await mount(
    <Surface tier="instrument">
      <Card>Instrument island</Card>
    </Surface>,
  );
  const card = surface.locator('[data-slot="card-root"]');
  expect(await computedPx(card, "paddingTop")).toBe(await resolveToken(card, "--spacing-row"));
});

test("RELATIONAL: form-tier padding EXCEEDS instrument-tier padding for the same primitive", async ({ mount }) => {
  // The relation is what the tier map promises (form is airy, instrument is dense); it survives any future
  // token retune, which an absolute assertion does not. Both tiers mount in ONE tree — one mount per test.
  const both = await mount(
    <div>
      <Surface tier="instrument">
        <Card>Instrument island</Card>
      </Surface>
      <Surface tier="form">
        <Card>Form island</Card>
      </Surface>
    </div>,
  );
  const instrument = await computedPx(both.locator('[data-surface-tier="instrument"] [data-slot="card-root"]'), "paddingTop");
  const form = await computedPx(both.locator('[data-surface-tier="form"] [data-slot="card-root"]'), "paddingTop");
  expect(form).toBeGreaterThan(instrument);
});

test("instrument radius is --radius-base; an elevated card inside it is --radius-card", async ({ mount }) => {
  const surface = await mount(
    <Surface tier="instrument">
      <Card data-testid="plain">Grouped content</Card>
      <Card data-testid="floating" elevated={true}>
        Floating island
      </Card>
    </Surface>,
  );
  const plain = surface.getByTestId("plain");
  const floating = surface.getByTestId("floating");
  expect(await computedPx(plain, "borderTopLeftRadius")).toBe(await resolveToken(plain, "--radius-base"));
  expect(await computedPx(floating, "borderTopLeftRadius")).toBe(await resolveToken(floating, "--radius-card"));
});

test("NESTING: a form Surface inside an instrument Surface resolves FORM steps for its own subtree", async ({ mount }) => {
  // Proves the inherited-custom-property design, not merely a descendant selector: with the spec's
  // illustrative equal-specificity pair, this subtree would resolve by source order instead of by nesting.
  const outer = await mount(
    <Surface tier="instrument">
      <Card data-testid="outer">Instrument island</Card>
      <Surface tier="form">
        <Card data-testid="inner">Form island nested inside the instrument surface</Card>
      </Surface>
    </Surface>,
  );
  const inner = outer.getByTestId("inner");
  const outerCard = outer.getByTestId("outer");
  expect(await computedPx(inner, "paddingTop")).toBe(await resolveToken(inner, "--spacing-block"));
  expect(await computedPx(outerCard, "paddingTop")).toBe(await resolveToken(outerCard, "--spacing-row"));
});

test("NESTING, the reverse: an instrument Surface inside a form Surface resolves INSTRUMENT steps", async ({ mount }) => {
  // The direction source-order would get wrong (form is declared later in tiers.css).
  const outer = await mount(
    <Surface tier="form">
      <Card data-testid="outer">Form island</Card>
      <Surface tier="instrument">
        <Card data-testid="inner">Instrument island nested inside the form surface</Card>
      </Surface>
    </Surface>,
  );
  const inner = outer.getByTestId("inner");
  const outerCard = outer.getByTestId("outer");
  expect(await computedPx(inner, "paddingTop")).toBe(await resolveToken(inner, "--spacing-row"));
  expect(await computedPx(outerCard, "paddingTop")).toBe(await resolveToken(outerCard, "--spacing-block"));
});

test("Surface adds no box: display:contents, so a tier declaration can't break a layout chain", async ({ mount }) => {
  const surface = await mount(
    <Surface tier="instrument">
      <Card>Instrument island</Card>
    </Surface>,
  );
  await expect(surface).toHaveCSS("display", "contents");
});

test("outside every Surface the primitive keeps its own tier-less default (--spacing-block)", async ({ mount }) => {
  // The fallback arm: the tier rules are SCOPED to `[data-surface-tier] …`, so an un-tiered card must not
  // resolve an unset var (which would collapse its padding to 0 — the exact silent-pixel defect).
  const card = await mount(<Card>Untiered</Card>);
  expect(await computedPx(card, "paddingTop")).toBe(await resolveToken(card, "--spacing-block"));
});

test("D9: the user-pref density axis re-binds the SAME spacing vars a tier step resolves through", async ({ mount }) => {
  // Drive BOTH preference arms through the real ThemeScope carrier. The four variables live in tiers.css,
  // so this proves the actual selector reaches any descendant (including a portal root) and that a tier
  // still picks WHICH re-bound variable it consumes.
  const density = await mount(
    <div>
      <ThemeScope tokens={{ density: "comfortable" }}>
        <div data-testid="comfortable">
          <Surface tier="instrument">
            <Card>Comfortable instrument island</Card>
          </Surface>
        </div>
      </ThemeScope>
      <ThemeScope tokens={{ density: "compact" }}>
        <div data-testid="compact">
          <Surface tier="instrument">
            <Card>Compact instrument island</Card>
          </Surface>
        </div>
      </ThemeScope>
    </div>,
  );
  const intents = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"] as const;
  const read = (testId: string): Promise<readonly number[]> =>
    density.getByTestId(testId).evaluate((node, names) => {
      const probe = node.ownerDocument.createElement("div");
      node.append(probe);
      const resolved = names.map((name) => {
        probe.style.padding = `var(${name})`;
        return Number.parseFloat(getComputedStyle(probe).paddingTop);
      });
      probe.remove();
      return resolved;
    }, intents);
  const comfortable = await read("comfortable");
  const compact = await read("compact");
  for (let index = 0; index < intents.length; index += 1) {
    expect(compact[index]).toBeLessThan(comfortable[index] ?? 0);
  }
  const compactCard = density.getByTestId("compact").locator('[data-slot="card-root"]');
  expect(await computedPx(compactCard, "paddingTop")).toBe(compact[1]);
});

test("#938: nested density scopes restore all four intents in both directions", async ({ mount }) => {
  const density = await mount(
    <div>
      <ThemeScope tokens={{ density: "compact" }}>
        <div data-testid="outer-compact">
          <ThemeScope tokens={{ density: "comfortable" }}>
            <Surface tier="instrument">
              <Card data-testid="inner-comfortable">Comfortable below compact</Card>
            </Surface>
          </ThemeScope>
        </div>
      </ThemeScope>
      <ThemeScope tokens={{ density: "comfortable" }}>
        <div data-testid="outer-comfortable">
          <ThemeScope tokens={{ density: "compact" }}>
            <Surface tier="instrument">
              <Card data-testid="inner-compact">Compact below comfortable</Card>
            </Surface>
          </ThemeScope>
        </div>
      </ThemeScope>
    </div>,
  );
  const intents = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"] as const;
  const read = (testId: string): Promise<readonly string[]> =>
    density.getByTestId(testId).evaluate((node, names) => {
      const style = getComputedStyle(node);
      return names.map((name) => style.getPropertyValue(name).trim());
    }, intents);

  const [outerCompact, innerComfortable, outerComfortable, innerCompact] = await Promise.all([
    read("outer-compact"),
    read("inner-comfortable"),
    read("outer-comfortable"),
    read("inner-compact"),
  ]);
  expect(innerComfortable).toEqual(outerComfortable);
  expect(innerCompact).toEqual(outerCompact);
  expect(innerComfortable).not.toEqual(innerCompact);

  const comfortableCard = density.getByTestId("inner-comfortable");
  const compactCard = density.getByTestId("inner-compact");
  expect(await computedPx(comfortableCard, "paddingTop")).toBe(await resolveInheritedToken(comfortableCard, "--spacing-row"));
  expect(await computedPx(compactCard, "paddingTop")).toBe(await resolveInheritedToken(compactCard, "--spacing-row"));
});

test("VOICE: each of the four voices resolves its own type step, and BEATS the size default it overrides", async ({ mount }) => {
  // The merge-order risk this pins: `defaultVariants` always supplies size/weight/tone, so a voice's own
  // font-size/leading/tracking/weight must WIN. `datum` is the sharpest probe — it overrides the family
  // (mono), the size (label), AND the leading, so a regression in the tv key order or in the registered
  // tailwind-merge class groups shows up here as body-sized sans text.
  const voices = await mount(
    <div>
      <Text data-testid="kicker" voice="kicker">
        Roster
      </Text>
      <Text data-testid="label" voice="label">
        Vitality
      </Text>
      <Text data-testid="datum" voice="datum">
        42/60
      </Text>
      <Text data-testid="gloss" voice="gloss">
        she has not slept
      </Text>
    </div>,
  );
  const resolved = await voices.evaluate((root) => {
    const probe = root.ownerDocument.createElement("div");
    root.ownerDocument.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const out = { micro: px("var(--text-micro)"), label: px("var(--text-label)"), body: px("var(--text-body)") };
    probe.remove();
    return out;
  });
  const read = (testid: string): Promise<{ size: string; family: string; weight: string; transform: string }> =>
    voices.getByTestId(testid).evaluate((el) => {
      const style = getComputedStyle(el);
      return { size: style.fontSize, family: style.fontFamily, weight: style.fontWeight, transform: style.textTransform };
    });

  const kicker = await read("kicker");
  expect(kicker.size).toBe(resolved.micro);
  expect(kicker.transform).toBe("uppercase");

  const label = await read("label");
  expect(label.size).toBe(resolved.label);
  expect(label.weight).toBe("500");

  const datum = await read("datum");
  expect(datum.size).toBe(resolved.label);
  expect(datum.size).not.toBe(resolved.body); // the size default did NOT leak through
  expect(datum.family).toContain("Mono");

  const gloss = await read("gloss");
  expect(gloss.size).toBe(resolved.micro);
});

test("VOICE: `hero` is THE number a surface exists to produce — display step, mono, tabular, and NOT `datum`", async ({ mount }) => {
  // The sixth voice (added 2026-08-09, side-eye P1-13). `datum` is the voice for A value; `hero` is the
  // voice for THE value — a run's overall score. It existed as `voice="datum"` at 13px, i.e. the
  // refinery's entire reason-for-being set at the same step as the field labels beside it.
  //
  // `tabular-nums` is the load-bearing half and is asserted, not assumed: the hero numeral COUNTS UP on
  // settle (`use-count-up.ts`), and proportional digits make the figure jitter horizontally mid-ramp —
  // a per-frame layout, which is exactly what guide §3.7 forbids.
  const mounted = await mount(
    <div>
      <Text data-testid="hero" as="span" voice="hero">
        7.5
      </Text>
      <Text data-testid="hero-datum" as="span" voice="datum">
        7.5
      </Text>
    </div>,
  );
  const resolved = await mounted.evaluate((root) => {
    const probe = root.ownerDocument.createElement("div");
    root.ownerDocument.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const out = { display: px("var(--text-display)"), label: px("var(--text-label)") };
    probe.remove();
    return out;
  });
  const hero = await mounted.getByTestId("hero").evaluate((el) => {
    const style = getComputedStyle(el);
    return { size: style.fontSize, family: style.fontFamily, weight: style.fontWeight, variant: style.fontVariantNumeric };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(hero.size).toBe(resolved.display);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(hero.family).toContain("Mono");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(hero.weight).toBe("600");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(hero.variant).toContain("tabular-nums");
  // The whole point of the voice: it is NOT the `datum` step. A regression that collapsed them would
  // silently restore the 13px hero the review filed.
  let datumSize = await mounted.getByTestId("hero-datum").evaluate((el) => getComputedStyle(el).fontSize);
  await expect
    .poll(async () => {
      datumSize = await mounted.getByTestId("hero-datum").evaluate((el) => getComputedStyle(el).fontSize);
      return datumSize;
    })
    .toBe(resolved.label);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(hero.size).not.toBe(datumSize);
});

test('VOICE: `ink="inherit"` hands the color back to a filled control — the P1-1 contrast fix, at the root', async ({ mount }) => {
  // Every voice re-spells its own COLOR, which is correct on a surface and wrong inside a filled
  // control. Measured on the refinery stepper before the fix: `voice="label"` on `bg-primary` was
  // **1.14:1**. `tone` cannot express the fix (it is declared BEFORE `voice`, so the voice wins the
  // merge); `ink` is declared last precisely so it wins.
  // The ancestor's ink is set by a TOKEN utility, never a literal: the assertion is "the child equals
  // whatever its control decided", which is the actual contract — pinning a hex would only prove that
  // one hex still exists.
  const mounted = await mount(
    <div className="text-primary">
      <Text data-testid="inherited" as="span" ink="inherit" voice="gloss">
        inherited
      </Text>
      <Text data-testid="own" as="span" voice="gloss">
        own
      </Text>
    </div>,
  );
  const readColor = (id: string): Promise<string> => mounted.getByTestId(id).evaluate((el) => getComputedStyle(el).color);
  // The mounted locator IS the ancestor — `getByTestId` scopes INSIDE it, so the wrapper's own color is
  // read off `mounted` directly (reading it by testid times out looking for a descendant of itself).
  const ancestor = await mounted.evaluate((el) => getComputedStyle(el).color);
  const inherited = await readColor("inherited");
  const own = await readColor("own");
  // It takes the ancestor's currentColor, whatever the theme resolved that to…
  expect(inherited).toBe(ancestor);
  // …and the untouched sibling still paints the voice's own muted ink, so this is an OPT-IN, not a
  // change to what every voice does. (This is also the assertion that would have caught the P1-1
  // defect: `gloss` on a filled control painting its own muted ink at 1.14:1.)
  expect(own).not.toBe(inherited);
});

test("VOICE: `monogram` is the decorative display glyph — title step, semibold, and it leaves COLOR to the skin", async ({ mount }) => {
  // The fifth voice (UI-Density-Law.md §2.3 as amended, S6): a single-letter mark an immersive row skin
  // paints on its own band fill. None of the four CONTENT voices fits it — they would all shrink a glyph
  // whose entire job is to be large — and the feature-side alternative was spelling `size`/`weight` through
  // className, a dodge the density gate structurally cannot see. It deliberately sets NO color: the skin
  // that owns the band owns the ink, so the tone default stays overridable by one className.
  const glyphs = await mount(
    <div>
      <Text data-testid="monogram" as="span" voice="monogram">
        A
      </Text>
      <Text data-testid="prose">body</Text>
    </div>,
  );
  const resolved = await glyphs.evaluate((root) => {
    const probe = root.ownerDocument.createElement("div");
    root.ownerDocument.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const out = { title: px("var(--text-title)"), body: px("var(--text-body)") };
    probe.remove();
    return out;
  });
  const glyph = await glyphs.getByTestId("monogram").evaluate((el) => {
    const style = getComputedStyle(el);
    return { size: style.fontSize, weight: style.fontWeight, transform: style.textTransform, color: style.color };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(glyph.size).toBe(resolved.title);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(glyph.size).not.toBe(resolved.body); // the size default did NOT leak through
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(glyph.weight).toBe("600");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(glyph.transform).toBe("none");
  // No color of its own ⇒ it lands on the tone default, which a skin's one className can still beat.
  const prose = await glyphs.getByTestId("prose").evaluate((el) => getComputedStyle(el).color);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(glyph.color).toBe(prose);
});

test("VOICE: `masthead` / `focal` / `reading` open the three steps a feature could not reach (program 102)", async ({ mount }) => {
  // The home density pass measured the rendered ramp at 16/15/13/10.5 — `--text-display` and
  // `--text-headline` existed in tokens.json and appeared NOWHERE, and `--text-body` was reachable only
  // through `size="body"`, an @orb/ui-internal axis the A3 arm reds at every feature call site. These
  // three voices are the routes. Read back as RESOLVED px against the tokens, per §5.3: this file's whole
  // job is that the gate's literal-shape reader cannot see a computed style.
  const mounted = await mount(
    <div>
      <Text data-testid="masthead" as="span" voice="masthead">
        Six rooms, still warm.
      </Text>
      <Text data-testid="focal" as="span" voice="focal">
        The Ashen Spire
      </Text>
      <Text data-testid="reading" as="span" voice="reading">
        the last line anyone said
      </Text>
      <Text data-testid="hero-number" as="span" voice="hero">
        42
      </Text>
    </div>,
  );
  const resolved = await mounted.evaluate((root) => {
    const probe = root.ownerDocument.createElement("div");
    root.ownerDocument.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const out = { display: px("var(--text-display)"), headline: px("var(--text-headline)"), body: px("var(--text-body)") };
    probe.style.fontSize = "";
    probe.style.color = "var(--color-prose-body)";
    const prose = getComputedStyle(probe).color;
    probe.remove();
    return { ...out, prose };
  });
  const read = (id: string): Promise<{ size: string; family: string; color: string }> =>
    mounted.getByTestId(id).evaluate((el) => {
      const style = getComputedStyle(el);
      return { size: style.fontSize, family: style.fontFamily, color: style.color };
    });

  const masthead = await read("masthead");
  const focal = await read("focal");
  const reading = await read("reading");
  const heroNumber = await read("hero-number");

  expect(masthead.size).toBe(resolved.display);
  expect(focal.size).toBe(resolved.headline);
  expect(reading.size).toBe(resolved.body);
  // `masthead` is `hero`'s PROSE twin, not a duplicate of it: same step, sans instead of mono. A sentence
  // set in the tabular-numeral face reads as a serial, which is the whole reason a second display voice
  // exists rather than one more call site of `hero`.
  expect(masthead.size).toBe(heroNumber.size);
  expect(masthead.family).not.toContain("Mono");
  expect(heroNumber.family).toContain("Mono");
  // `reading` rides the per-theme prose ink, never `foreground` — it is content, not chrome.
  expect(reading.color).toBe(resolved.prose);
});

test("VOICE: `promoted` is the TITLE step — the name of one item in a shelf, a step above its own gloss", async ({ mount }) => {
  // Added by the 2026-08-17 rail sweep (P2-9/P3-18). Home's character shelf rendered each cell as `label`
  // over `gloss prose` — 13px over 13px, the entity and a sentence about it at the same step — and a
  // feature cannot spell the 16px title step any other way (`size="title"` is one of the four internal axes
  // the A3 arm reds at a feature call site). The pin that matters is that it is the TITLE step and STRICTLY
  // above the gloss step beneath it: a "tidy-up" collapsing it onto `label` would reopen the finding
  // silently.
  const mounted = await mount(
    <div>
      <Text data-testid="promoted" as="span" voice="promoted">
        Morgatha, the Undying Dark
      </Text>
      <Text data-testid="promoted-gloss" as="span" prose={true} voice="gloss">
        An immortal, bureaucratically-minded necromancer
      </Text>
    </div>,
  );
  const titleStep = await mounted.evaluate((root) => {
    const probe = root.ownerDocument.createElement("div");
    root.ownerDocument.body.append(probe);
    probe.style.fontSize = "var(--text-title)";
    const px = getComputedStyle(probe).fontSize;
    probe.remove();
    return px;
  });
  let name = await mounted.getByTestId("promoted").evaluate((el) => getComputedStyle(el).fontSize);
  const gloss = await mounted.getByTestId("promoted-gloss").evaluate((el) => getComputedStyle(el).fontSize);

  await expect
    .poll(async () => {
      name = await mounted.getByTestId("promoted").evaluate((el) => getComputedStyle(el).fontSize);
      return name;
    })
    .toBe(titleStep);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(name)).toBeGreaterThan(Number.parseFloat(gloss));
});

test("VOICE: `credit` is the mock's micro-caps register AT THE LABEL STEP, never the micro step", async ({ mount }) => {
  // Added by the #102 review (F12 + F15). The hero's cast/age line wanted the mock's mono UPPERCASE
  // tracked register, which a feature cannot spell (`transform` is an A3-red internal axis) — AND it sits
  // inside the hero's own button, so the mock's own 10.5px was below the readable floor for interactive
  // text. `credit` is therefore the register at `label`, and the pin that matters is precisely that it is
  // NOT `micro`: a "tidy-up" that collapsed it onto the kicker step would reopen F15 silently.
  const mounted = await mount(
    <div>
      <Text data-testid="credit" as="span" voice="credit">
        Calamity · Morgatha · last turn 1w ago
      </Text>
      <Text data-testid="credit-kicker" as="span" voice="kicker">
        Also open
      </Text>
    </div>,
  );

  const label = await resolveFontSize(mounted, "--text-label");
  const micro = await resolveFontSize(mounted, "--text-micro");
  const credit = await mounted.getByTestId("credit").evaluate((el) => {
    const style = getComputedStyle(el);
    const probe = el.ownerDocument.createElement("span");
    probe.style.color = "var(--color-muted-foreground)";
    el.ownerDocument.body.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    return { size: style.fontSize, transform: style.textTransform, family: style.fontFamily, tracking: style.letterSpacing, color: style.color, muted };
  });

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(credit.size).toBe(label);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(credit.size).not.toBe(micro);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(credit.transform).toBe("uppercase");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(credit.family).toContain("Mono");
  // Tracked like the kicker it shares a register with — caps without tracking is a shout, not a credit.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(credit.tracking)).toBeGreaterThan(0);
  // …and MUTED: a credit stands behind the thing it credits.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(credit.color).toBe(credit.muted);
});

test("VOICE: `quiet` and `datumMono` are the RECEDED steps — body-muted and code-mono-muted, not `gloss`/`datum`", async ({ mount }) => {
  // Added by the #573 owner ruling. Both exist because a feature had NO legal spelling for them: a muted
  // body line could only be `tone="muted"` and a code-step readout only `size="code"`, and both are A3-red
  // internal axes at a feature call site. The pins that matter are the two collapses a "tidy-up" would make:
  //   `quiet` → `gloss`      would drop an empty-state sentence two steps to the 10.5px footnote step;
  //   `datumMono` → `datum`  would make a hash tabular, foreground, and label-LEADING.
  // NOTE `--text-code` and `--text-label` are the SAME 13px step — the two mono voices are separated by
  // leading, color and tabular figures, never by size, so a size assertion cannot tell them apart.
  const mounted = await mount(
    <div>
      <Text data-testid="quiet" as="span" voice="quiet">
        No first message yet.
      </Text>
      <Text data-testid="quiet-gloss" as="span" voice="gloss">
        a footnote
      </Text>
      <Text data-testid="mono" as="span" voice="datumMono">
        char_01jq8v3n
      </Text>
      <Text data-testid="mono-datum" as="span" voice="datum">
        42/60
      </Text>
    </div>,
  );

  const body = await resolveFontSize(mounted, "--text-body");
  const micro = await resolveFontSize(mounted, "--text-micro");
  const code = await resolveFontSize(mounted, "--text-code");
  const read = (testid: string): Promise<{ size: string; family: string; weight: string; tracking: string; color: string; muted: string; leading: string }> =>
    mounted.getByTestId(testid).evaluate((el) => {
      const style = getComputedStyle(el);
      const probe = el.ownerDocument.createElement("span");
      probe.style.color = "var(--color-muted-foreground)";
      el.ownerDocument.body.append(probe);
      const muted = getComputedStyle(probe).color;
      probe.remove();
      return {
        size: style.fontSize,
        family: style.fontFamily,
        weight: style.fontWeight,
        tracking: style.letterSpacing,
        color: style.color,
        muted,
        leading: style.lineHeight,
      };
    });

  const quiet = await read("quiet");
  expect(quiet.size).toBe(body);
  expect(quiet.size).not.toBe(micro); // NOT `gloss` — a receded sentence is still a sentence
  expect(quiet.weight).toBe("400");
  expect(quiet.color).toBe(quiet.muted);
  // The one class the voice adds over the raw `tone="muted"` pair it replaces is a NO-OP: `quiet` must be a
  // vocabulary fix, not a visual change, and a tracked body line is exactly the regression that would be.
  expect(quiet.tracking).toBe("normal");
  const glossSize = await mounted.getByTestId("quiet-gloss").evaluate((el) => getComputedStyle(el).fontSize);
  expect(Number.parseFloat(quiet.size)).toBeGreaterThan(Number.parseFloat(glossSize));

  const mono = await read("mono");
  const datum = await read("mono-datum");
  expect(mono.size).toBe(code);
  expect(mono.family).toContain("Mono");
  expect(mono.weight).toBe("400");
  expect(mono.tracking).toBe("normal");
  // The three axes that separate it from `datum` at the SAME 13px step: it recedes (muted, not foreground),
  // it rides the BODY leading a wrapped payload needs, and it is not tabular.
  expect(mono.color).toBe(mono.muted);
  expect(datum.color).not.toBe(datum.muted);
  expect(Number.parseFloat(mono.leading)).toBeGreaterThan(Number.parseFloat(datum.leading));
  await expect.poll(async () => await mounted.getByTestId("mono").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).not.toContain("tabular-nums");
  await expect.poll(async () => await mounted.getByTestId("mono-datum").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("tabular-nums");
});

/** The px a font-size token resolves to in the live document (the `resolveToken` probe, font-size arm). */
function resolveFontSize(el: Locator, token: string): Promise<string> {
  return el.evaluate((node, name) => {
    const probe = node.ownerDocument.createElement("div");
    probe.style.fontSize = `var(${name})`;
    node.ownerDocument.body.append(probe);
    const size = getComputedStyle(probe).fontSize;
    probe.remove();
    return size;
  }, token);
}

/** The density-bearing computed values of one rendered LIST pane (row slots + its search field). */
interface PaneMetrics {
  rootGap: string;
  bodyGap: string;
  markerGap: string;
  titleSize: string;
  titleWeight: string;
  titleLeading: string;
  subtitleSize: string;
  metaSize: string;
  inputSize: string;
}

/** Every density-bearing computed value of one rendered ListRow, in one page round-trip. */
function readRow(root: Locator): Promise<PaneMetrics> {
  return root.evaluate((node) => {
    const read = (slot: string, prop: keyof CSSStyleDeclaration): string => {
      const el = node.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      return el === null ? "MISSING" : String(getComputedStyle(el)[prop]);
    };
    return {
      rootGap: read("list-row-root", "columnGap"),
      bodyGap: read("list-row-body", "columnGap"),
      markerGap: read("list-row-markers", "columnGap"),
      titleSize: read("list-row-title", "fontSize"),
      titleWeight: read("list-row-title", "fontWeight"),
      titleLeading: read("list-row-title", "lineHeight"),
      subtitleSize: read("list-row-subtitle", "fontSize"),
      metaSize: read("list-row-meta", "fontSize"),
      inputSize: read("input-root", "fontSize"),
    };
  });
}

/** A LIST pane's worth of slots — every one the tier map keys on. */
function listPane(): ReactElement {
  return (
    <>
      <Input aria-label="Search" defaultValue="" />
      <ListRow markers={<span>★</span>} meta="2h" subtitle="Rain again, and she is late" title="Azarael" />
    </>
  );
}

test("LIVE: stripping data-surface-tier moves EVERY list-pane value back to the tier-less default", async ({ mount }) => {
  // The liveness probe the S5 side-eye asked for (P1-3): the tier map is only load-bearing if REMOVING the
  // attribute changes what the browser computed. A row whose dense steps are hardcoded in its variants
  // reads identically before and after — that is exactly the defect this asserts against.
  const surface = await mount(
    <Surface tier="instrument">
      <div data-testid="pane">{listPane()}</div>
    </Surface>,
  );
  const pane = surface.getByTestId("pane");
  const instrument = await readRow(pane);
  await surface.evaluate((node) => node.removeAttribute("data-surface-tier"));
  const untiered = await readRow(pane);

  for (const [key, value] of Object.entries(instrument)) {
    expect(value, `${key} must be tier-dependent`).not.toBe(untiered[key as keyof PaneMetrics]);
  }
  // …and the instrument values are the mapped token steps, not merely "different".
  expect(instrument.titleSize).toBe(await resolveFontSize(pane, "--text-label"));
  expect(instrument.titleWeight).toBe("600");
  expect(instrument.subtitleSize).toBe(await resolveFontSize(pane, "--text-micro"));
  expect(instrument.metaSize).toBe(await resolveFontSize(pane, "--text-micro"));
  expect(instrument.inputSize).toBe(await resolveFontSize(pane, "--text-label"));
});

test("the four LIST pane declarations resolve identically, and a form pane keeps the comfortable steps", async ({ mount }) => {
  // The chats pane, the character library, the shared preset/world-info list layout and the chats-with-
  // character projection all declare `tier="instrument"` — one tier, so one rhythm. A form pane (the home
  // tile grid) must land on the SAME values as no tier at all: `tier="form"` restates the defaults.
  const both = await mount(
    <div>
      <Surface tier="instrument">
        <div data-testid="instrument">{listPane()}</div>
      </Surface>
      <Surface tier="form">
        <div data-testid="form">{listPane()}</div>
      </Surface>
      <div data-testid="untiered">{listPane()}</div>
    </div>,
  );
  const instrument = await readRow(both.getByTestId("instrument"));
  const form = await readRow(both.getByTestId("form"));
  const untiered = await readRow(both.getByTestId("untiered"));
  expect(form).toEqual(untiered);
  // The search chrome no longer outshouts the rows it filters (side-eye P1-1): at instrument it sits AT the
  // title step, and it is the form/untiered pane that keeps the larger body step.
  expect(instrument.inputSize).toBe(instrument.titleSize);
  expect(Number.parseFloat(form.inputSize)).toBeGreaterThan(Number.parseFloat(instrument.inputSize));
});

// A 1×1 transparent GIF — an `asset` source that actually decodes, so the image arm renders the <img>
// rather than falling through to the broken-media placeholder.
const PIXEL_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

test("S2 CONFORMANCE: every @orb/ui island lands on its ASSIGNED radius step, none on the floating one", async ({ mount }) => {
  // The rendered receipt for the S2 sweep of the ui internals (UI-Density-Law.md §2.1 / D6): these five
  // primitives all defaulted to `rounded-card`, the ELEVATED step, while every one of them renders INSIDE
  // something else — media/frames/tool calls inside the message bubble, an avatar in a row. Read by computed
  // value against the resolved tokens: an authored-class assertion would stay green if the utility stopped
  // resolving (the Waystone lesson), and `not.toBe(card)` is what actually pins the demotion.
  const tree = await mount(
    <div>
      <ToolCallBlock record={{ toolCallId: "t1", name: "search", arguments: "{}", result: "{}", isError: false, durationMs: 12 }} />
      <Avatar alt="Azarael" shape="rounded" />
      <MessageMedia alt="A pixel" media="image" src={{ kind: "asset", url: PIXEL_GIF }} />
      <SandboxFrame html="<p>card</p>" title="Sandboxed card" />
      <FileDropzone />
    </div>,
  );
  const base = await resolveToken(tree, "--radius-base");
  const card = await resolveToken(tree, "--radius-card");
  const control = await resolveToken(tree, "--radius-control");
  expect(base).not.toBe(card); // the whole assertion is vacuous if the two steps ever collapse

  // Grouped content, every one of them: read in one batch, then asserted as a MAP so a failure names the
  // slot that drifted instead of just a px number.
  const grouped = ["tool-call-block", "avatar-root", "message-media", "sandbox-frame"];
  const radii = await Promise.all(grouped.map((slot) => computedPx(tree.locator(`[data-slot="${slot}"]`), "borderTopLeftRadius")));
  expect(Object.fromEntries(grouped.map((slot, i) => [slot, radii[i]]))).toEqual(Object.fromEntries(grouped.map((slot) => [slot, base])));
  // The dropzone IS the file input (the native control covers the whole box) — the control step, not base.
  expect(await computedPx(tree.locator('[data-slot="file-dropzone"]'), "borderTopLeftRadius")).toBe(control);
});

test("CD3: exactly ONE focal element at rest in a surface (accent fill or elevation shadow)", async ({ mount }) => {
  // The Waystone hierarchy lesson generalized (UI-Density-Law.md §3.2 CD3): everything around the one
  // bold thing is deliberately quiet. Counted from COMPUTED style over the whole subtree — an authored-class
  // audit cannot see a second focal element that arrives through a variant or a nested primitive.
  const surface = await mount(
    <Surface tier="instrument">
      <Card>Quiet island</Card>
      <Card>Another quiet island</Card>
      <Card elevated={true}>The one focal island</Card>
    </Surface>,
  );
  await expect
    .poll(
      async () =>
        await surface.evaluate((root) => {
          const probe = root.ownerDocument.createElement("div");
          probe.style.backgroundColor = "var(--color-primary)";
          root.ownerDocument.body.append(probe);
          const accent = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const nodes = [...root.querySelectorAll<HTMLElement>("*")];
          return nodes.filter((node) => {
            const style = getComputedStyle(node);
            return style.boxShadow !== "none" || style.backgroundColor === accent;
          }).length;
        }),
    )
    .toBe(1);
});
