// CT: the density tier MECHANISM, asserted by COMPUTED VALUE (density-pass-spec.md §4.2 build step 0 +
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
import { Card } from "@orb/ui/card";
import { Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

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
  // The app-shell's `[data-density="compact"]` block re-binds --spacing-row/block on the shell root
  // (client shell.css). That stylesheet is not in the CT page, so this proves the PHYSICS the shell relies
  // on — an ancestor re-binding wins for the whole subtree, and the tier step follows it — rather than
  // that one selector. The two axes are orthogonal by construction: tier picks WHICH var, the density
  // pref sets its VALUE.
  const surface = await mount(
    <Surface tier="instrument">
      <Card>Instrument island</Card>
    </Surface>,
  );
  const card = surface.locator('[data-slot="card-root"]');
  const before = await computedPx(card, "paddingTop");
  await card.evaluate((node) => {
    (node.parentElement as HTMLElement).style.setProperty("--spacing-row", "3px");
  });
  expect(await computedPx(card, "paddingTop")).toBe(3);
  expect(before).not.toBe(3);
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

test("CD3: exactly ONE focal element at rest in a surface (accent fill or elevation shadow)", async ({ mount }) => {
  // The Waystone hierarchy lesson generalized (density-pass-spec.md §3.2 CD3): everything around the one
  // bold thing is deliberately quiet. Counted from COMPUTED style over the whole subtree — an authored-class
  // audit cannot see a second focal element that arrives through a variant or a nested primitive.
  const surface = await mount(
    <Surface tier="instrument">
      <Card>Quiet island</Card>
      <Card>Another quiet island</Card>
      <Card elevated={true}>The one focal island</Card>
    </Surface>,
  );
  const focalCount = await surface.evaluate((root) => {
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
  });
  expect(focalCount).toBe(1);
});
