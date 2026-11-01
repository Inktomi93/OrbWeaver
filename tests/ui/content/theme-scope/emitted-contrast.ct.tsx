import type { Oklch, Rgb } from "@orb/kit/theme-derivation";
import {
  AA_NON_TEXT_RATIO,
  AA_NORMAL_RATIO,
  BUBBLE_PAGE_SEPARATION,
  oklabDistance,
  srgbToOklch,
  TONE_TINT_SEPARATION,
  wcagContrastRatio,
} from "@orb/kit/theme-derivation";
import { pixelContrast, pixelSurface } from "@orb/testkit/browser/spec";
import { THEME_SCOPE_EMIT_VARS, THEME_SCOPE_NON_PALETTE_VARS } from "@orb/ui/theme-scope/emit-vars";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type {
  BoxElementsStory,
  BubbleSeparationStory,
  InheritedInkStory,
  NestedSeedStory,
  NestedSeedSurfaceStory,
  NeutralFillStory,
  PickedBubbleStory,
  PickedRoomStory,
  ReadingBandStory,
  SelectedRowStory,
  SemanticContrastStory,
  SpeakerInkStory,
  ToneHueStory,
  ToneMarkStory,
  ToneRoleContrastStory,
} from "./_contrast-stories.tsx";

import {
  BASES,
  BOX_ELEMENT_CASES,
  CARRIED_BUBBLE_PALETTES,
  INHERITED_INK_CASE,
  keepsHue,
  MID_GREY,
  PICKED_BUBBLE_FILLS,
  PICKED_BUBBLE_INKS,
  PICKED_BUBBLE_PALETTES,
  PICKED_ROOM_CASES,
  PICKED_ROOM_PALETTES,
  SPEAKER_DIALOGUE,
} from "./contrast-cases.ts";

const SEED_THEMES = Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[];

/** Every shipped palette, then a custom scope on each contrast-case base: the per-palette sweep of the neutral ink pairs. */
const SEMANTIC_CASES = [
  { name: "hearth seed" },
  ...SEED_THEMES.map((theme) => ({ name: `${theme} seed`, theme })),
  ...BASES.map(({ name, background }) => ({ name, background })),
] as const;

for (const { name, ...props } of SEMANTIC_CASES) {
  test(`${name}: semantic and muted/input inks clear their painted backings`, async ({ mount, page }, testInfo) => {
    const component = await mount<typeof SemanticContrastStory>("tests/ui/content/theme-scope/_contrast-stories/SemanticContrastStory", props);
    const subjects = component.locator("p");
    await expect(subjects).toHaveCount(27);
    for (const subject of await subjects.all()) {
      await expect(subject).toBeVisible();
      await subject.scrollIntoViewIfNeeded();
      const receipt = await pixelContrast(page, subject);
      expect(receipt.ratio, `${await subject.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
    const screenshot = testInfo.outputPath("settled-theme.png");
    await component.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("settled-theme", { path: screenshot, contentType: "image/png" });
  });
}

for (const { name, background } of BASES) {
  test(`${name}: a speaker's dialogue ink clears every bubble it renders on`, async ({ mount, page }) => {
    const component = await mount<typeof SpeakerInkStory>("tests/ui/content/theme-scope/_contrast-stories/SpeakerInkStory", {
      background,
      dialogueColor: SPEAKER_DIALOGUE,
    });
    const samples = await component.locator("[data-dialogue]").all();
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      await sample.scrollIntoViewIfNeeded();
      const receipt = await pixelContrast(page, sample);
      expect(receipt.ratio, `${(await sample.getAttribute("data-dialogue")) ?? "bubble"}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
  });
}

// The light arm steps accent exactly the tint separation from muted, so 8-bit pixels can spend up to one step of it.
const NEUTRAL_FILL_SEPARATION = TONE_TINT_SEPARATION - 0.004;

for (const { name, background } of BASES) {
  test(`${name}: the keyboard highlight and the input rail paint apart from what they sit on`, async ({ mount, page }) => {
    const component = await mount<typeof NeutralFillStory>("tests/ui/content/theme-scope/_contrast-stories/NeutralFillStory", { background });
    const painted = async (fill: string): Promise<Oklch> => srgbToOklch((await pixelSurface(page, component.locator(`[data-fill="${fill}"]`))).rgb);
    const accent = await painted("accent");
    const distances = {
      "highlight from muted": oklabDistance(accent, await painted("muted")),
      "highlight from popover": oklabDistance(accent, await painted("popover")),
      "rail from card": oklabDistance(await painted("rail"), await painted("card")),
    };
    for (const [pair, distance] of Object.entries(distances)) {
      expect(distance, pair).toBeGreaterThanOrEqual(NEUTRAL_FILL_SEPARATION);
    }
  });
}

for (const { name, ...props } of SEMANTIC_CASES) {
  test(`${name}: every message bubble's fill paints the bubble separation off the page`, async ({ mount, page }) => {
    const component = await mount<typeof BubbleSeparationStory>("tests/ui/content/theme-scope/_contrast-stories/BubbleSeparationStory", props);
    const ground = srgbToOklch((await pixelSurface(page, component.locator('[data-sample="page"]'))).rgb);
    const bubbles = await component.locator("[data-bubble]").all();
    expect(bubbles.length).toBeGreaterThan(0);
    const misses: string[] = [];
    for (const bubble of bubbles) {
      const distance = oklabDistance(srgbToOklch((await pixelSurface(page, bubble)).rgb), ground);
      if (distance < BUBBLE_PAGE_SEPARATION) {
        misses.push(`${(await bubble.getAttribute("data-bubble")) ?? "bubble"} ${distance.toFixed(4)}`);
      }
    }
    expect(misses).toEqual([]);
  });
}

for (const { name, ...props } of SEMANTIC_CASES) {
  test(`${name}: every message bubble's ink clears its own painted fill`, async ({ mount, page }) => {
    const component = await mount<typeof BubbleSeparationStory>("tests/ui/content/theme-scope/_contrast-stories/BubbleSeparationStory", props);
    const bubbles = await component.locator("[data-bubble]").all();
    expect(bubbles.length).toBeGreaterThan(0);
    for (const bubble of bubbles) {
      await bubble.scrollIntoViewIfNeeded();
      const receipt = await pixelContrast(page, bubble);
      expect(receipt.ratio, `${(await bubble.getAttribute("data-bubble")) ?? "bubble"}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
  });
}

const TONE_CASES = [
  { name: "hearth seed" },
  ...SEED_THEMES.map((theme) => ({ name: `${theme} seed`, theme })),
  ...BASES.map(({ name, background }) => ({ name: `custom ${name} nested in the light seed`, theme: "light" as const, background })),
] as const;

for (const { name, ...props } of TONE_CASES) {
  test(`${name}: every D336 tone role pair clears its floor in the painted pixels`, async ({ mount, page }) => {
    const component = await mount<typeof ToneRoleContrastStory>("tests/ui/content/theme-scope/_contrast-stories/ToneRoleContrastStory", props);
    const subjects = component.locator("[data-tone]");
    await expect(subjects.first()).toBeVisible();
    const all = await subjects.all();
    expect(all.length).toBeGreaterThan(0);
    for (const subject of all) {
      // The pairs outgrow one viewport; the pixel read needs each one on screen.
      await subject.scrollIntoViewIfNeeded();
      const receipt = await pixelContrast(page, subject);
      expect(receipt.ratio, `${await subject.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
  });
}

for (const { name, background } of BASES.slice(0, 4)) {
  test(`${name}: reading band is the live plate color, opaque over black and white art`, async ({ mount, page }, testInfo) => {
    const component = await mount<typeof ReadingBandStory>("tests/ui/content/theme-scope/_contrast-stories/ReadingBandStory", { background });
    for (const art of ["black", "white"]) {
      const host = component.getByLabel(`${art} art`, { exact: true });
      const band = host.getByText("Reading band", { exact: true });
      const reference = host.getByText("Opaque plate reference", { exact: true });
      await expect(band).toBeVisible();
      await host.scrollIntoViewIfNeeded();
      const bandSurface = await pixelSurface(page, band);
      const plateSurface = await pixelSurface(page, reference);
      expect(bandSurface.rgb, `${art} art: ${bandSurface.describe} versus opaque live plate ${plateSurface.describe}`).toEqual(plateSurface.rgb);
      for (const subject of [band, host.getByText("Reading plate", { exact: true })]) {
        await subject.scrollIntoViewIfNeeded();
        const receipt = await pixelContrast(page, subject);
        expect(receipt.ratio, `${art} art: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    }
    const screenshot = testInfo.outputPath("settled-theme.png");
    await component.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("settled-theme", { path: screenshot, contentType: "image/png" });
  });
}

for (const { name, ...props } of SEMANTIC_CASES) {
  test(`${name}: every colored tone's solid holds the non-text floor as a glyph on its own tints`, async ({ mount, page }) => {
    const component = await mount<typeof ToneHueStory>("tests/ui/content/theme-scope/_contrast-stories/ToneHueStory", props);
    const tones = await component.locator("[data-tone]").all();
    expect(tones.length).toBeGreaterThan(0);
    for (const tone of tones) {
      await tone.scrollIntoViewIfNeeded();
      const fill = async (sample: string): Promise<Rgb> => (await pixelSurface(page, tone.locator(`[data-sample="${sample}"]`))).rgb;
      const solid = await fill("solid");
      for (const tint of ["tint", "tint-active"]) {
        const ratio = wcagContrastRatio(solid, await fill(tint));
        expect(ratio, `${(await tone.getAttribute("data-tone")) ?? "tone"} on ${tint}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
      }
    }
  });
}

for (const palette of PICKED_BUBBLE_PALETTES) {
  for (const { name: bubble, aiBubble } of PICKED_BUBBLE_FILLS) {
    for (const { name: carries, inks } of PICKED_BUBBLE_INKS) {
      test(`${palette.name}: ${bubble} picked bubble ${carries}: story text and inline code clear AA on the fill`, async ({ mount, page }) => {
        const { name: _name, ...scope } = palette;
        const component = await mount<typeof PickedBubbleStory>("tests/ui/content/theme-scope/_contrast-stories/PickedBubbleStory", {
          ...scope,
          aiBubble,
          inks,
        });
        const samples = component.locator('[data-slot="dialogue"], em, [data-streamdown="inline-code"]');
        await expect(samples).toHaveCount(4);
        for (const sample of await samples.all()) {
          const receipt = await pixelContrast(page, sample);
          expect(receipt.ratio, `${await sample.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
        }
      });
    }
  }
}

for (const palette of PICKED_ROOM_PALETTES) {
  for (const room of PICKED_ROOM_CASES) {
    test(`${palette.name}: ${room.name}: every turn, the page and its chips clear AA in the painted pixels`, async ({ mount, page }) => {
      const { name: _palette, dark, light, ...scope } = palette;
      const { name: _room, picks, ...shape } = room;
      const component = await mount<typeof PickedRoomStory>("tests/ui/content/theme-scope/_contrast-stories/PickedRoomStory", {
        ...scope,
        ...shape,
        picks: picks({ opposed: dark, matched: light }),
      });
      const samples = component.locator('[data-chip], [data-body] p, [data-slot="dialogue"], em, [data-streamdown="inline-code"]');
      await expect(samples).toHaveCount(9);
      for (const sample of await samples.all()) {
        await sample.scrollIntoViewIfNeeded();
        const receipt = await pixelContrast(page, sample);
        expect(receipt.ratio, `${await sample.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    });
  }
}

const BUILDER_BUBBLES = {
  aiBubble: { bg: TOKENS["color.ai-bubble"].value },
  userBubble: { bg: TOKENS["color.user-bubble"].value },
  systemBubble: { bg: TOKENS["color.system-bubble"].value },
};

for (const { name, background, fills } of CARRIED_BUBBLE_PALETTES) {
  const cases = [
    ...fills.map((fill) => ({ label: `${fill} picked bubble`, picks: { aiBubble: { bg: fill }, userBubble: { bg: fill } } })),
    { label: "the theme builder's Hearth bubbles", picks: BUILDER_BUBBLES },
  ];
  for (const { label, picks } of cases) {
    test(`carried ${name} with ${label}: the bubbles paint, and every turn and the page clear AA`, async ({ mount, page }) => {
      const component = await mount<typeof PickedRoomStory>("tests/ui/content/theme-scope/_contrast-stories/PickedRoomStory", {
        background,
        picks,
        level: "carried",
        boxed: true,
        readingInk: false,
      });
      const turn = component.locator('[data-turn="assistant"]');
      const painted = await turn.evaluate((element) => getComputedStyle(element).backgroundColor);
      const probe = await turn.evaluate((element, bg) => {
        const swatch = document.createElement("span");
        swatch.style.backgroundColor = bg;
        element.append(swatch);
        const value = getComputedStyle(swatch).backgroundColor;
        swatch.remove();
        return value;
      }, picks.aiBubble.bg);
      expect(painted).toBe(probe);
      const samples = component.locator('[data-chip], [data-body] p, [data-slot="dialogue"], em, [data-streamdown="inline-code"]');
      await expect(samples).toHaveCount(9);
      for (const sample of await samples.all()) {
        await sample.scrollIntoViewIfNeeded();
        const receipt = await pixelContrast(page, sample);
        expect(receipt.ratio, `${await sample.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    });
  }
}

const BOX_ELEMENTS = {
  blockquote: "blockquote p",
  "table cell": "td",
  link: '[data-streamdown="link"]',
  "swipe foot": '[data-element="swipe foot"]',
  kebab: '[data-element="kebab"]',
  "soft chip": '[data-element="soft chip"]',
  "speaker name": '[data-element="speaker name"]',
} as const;

for (const { name, theme, card, carried } of BOX_ELEMENT_CASES) {
  for (const [element, selector] of Object.entries(BOX_ELEMENTS)) {
    test(`${name}: ${element} clears AA inside the box`, async ({ mount, page }) => {
      const tokens = carried === undefined ? card : { ...card, background: carried };
      const component = await mount<typeof BoxElementsStory>("tests/ui/content/theme-scope/_contrast-stories/BoxElementsStory", {
        ...(theme === undefined ? {} : { theme }),
        card: tokens,
      });
      const receipt = await pixelContrast(page, component.locator(selector).first());
      expect(receipt.ratio, receipt.describe).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    });
  }
}

test("a group room's two speakers each read on their own picked fill", async ({ mount, page }) => {
  const [dark, light] = BOX_ELEMENT_CASES;
  const component = await mount<typeof BoxElementsStory>("tests/ui/content/theme-scope/_contrast-stories/BoxElementsStory", {
    theme: "light",
    card: dark.card,
    second: light.card,
  });
  const samples = component.locator(Object.values(BOX_ELEMENTS).join(", "));
  await expect(samples).toHaveCount(14);
  for (const sample of await samples.all()) {
    await sample.scrollIntoViewIfNeeded();
    const receipt = await pixelContrast(page, sample);
    expect(receipt.ratio, `${await sample.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  }
});

test("an inherited narration pick clears a bubble fill a nested scope picked", async ({ mount, page }) => {
  const component = await mount<typeof InheritedInkStory>("tests/ui/content/theme-scope/_contrast-stories/InheritedInkStory", {
    background: BASES[0].background,
    ...INHERITED_INK_CASE,
  });
  const receipt = await pixelContrast(page, component.locator("[data-inherited-ink]"));
  expect(receipt.ratio, receipt.describe).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
});

test("a custom mid-grey page keeps every colored tone's hue in its painted text, tints and solid", async ({ mount, page }) => {
  const component = await mount<typeof ToneHueStory>("tests/ui/content/theme-scope/_contrast-stories/ToneHueStory", { background: MID_GREY });
  const ground = srgbToOklch((await pixelSurface(page, component.locator('[data-sample="ground"]'), { region: { x0: 0, x1: 0.01, y0: 0, y1: 0.01 } })).rgb);
  const tones = await component.locator("[data-tone]").all();
  expect(tones.length).toBeGreaterThan(0);
  const lost: string[] = [];
  for (const tone of tones) {
    const name = await tone.getAttribute("data-tone");
    await tone.scrollIntoViewIfNeeded();
    const fill = async (sample: string): Promise<Oklch> => srgbToOklch((await pixelSurface(page, tone.locator(`[data-sample="${sample}"]`))).rgb);
    const solid = await fill("solid");
    const tints = { tint: await fill("tint"), "tint-active": await fill("tint-active") };
    const text = srgbToOklch((await pixelContrast(page, tone.locator('[data-sample="text"]'))).ink);
    for (const [role, painted] of Object.entries({ solid, text, ...tints })) {
      if (!keepsHue(painted, solid.h)) {
        lost.push(`${name} ${role} paints ${JSON.stringify(painted)} beside a solid at ${JSON.stringify(solid)}`);
      }
    }
    for (const [role, painted] of Object.entries(tints)) {
      if (oklabDistance(painted, ground) < TONE_TINT_SEPARATION) {
        lost.push(`${name} ${role} ${JSON.stringify(painted)} merges with the page ${JSON.stringify(ground)}`);
      }
    }
  }
  expect(lost).toEqual([]);
});

test("a selected row's label clears AA on its primary tint over a custom mid-grey page", async ({ mount, page }) => {
  const component = await mount<typeof SelectedRowStory>("tests/ui/content/theme-scope/_contrast-stories/SelectedRowStory", { background: MID_GREY });
  const label = component.getByText("Connections", { exact: true });
  await expect(label).toBeVisible();
  const receipt = await pixelContrast(page, label);
  expect(receipt.ratio, receipt.describe).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
});

test("a seed palette nested inside a custom mid-grey scope paints its own tone roles", async ({ mount, page }) => {
  await mount<typeof NestedSeedStory>("tests/ui/content/theme-scope/_contrast-stories/NestedSeedStory", { background: MID_GREY });
  const painted = (nest: string): Promise<Readonly<Record<string, string>>> =>
    page
      .locator(`[data-nest="${nest}"] [data-role-sample]`)
      .evaluateAll((samples) =>
        Object.fromEntries(samples.map((sample) => [sample.getAttribute("data-role-sample"), getComputedStyle(sample).backgroundColor])),
      );
  const onPage = await painted("page");
  expect(Object.keys(onPage).length).toBeGreaterThan(0);
  expect(await painted("carried")).toEqual(onPage);
});

test("a seed palette nested inside a carried scope resolves its own value for every palette variable the scope emits", async ({ mount, page }) => {
  const component = await mount<typeof NestedSeedSurfaceStory>("tests/ui/content/theme-scope/_contrast-stories/NestedSeedSurfaceStory", {
    background: MID_GREY,
  });
  const nonPalette: readonly string[] = THEME_SCOPE_NON_PALETTE_VARS;
  const palette = THEME_SCOPE_EMIT_VARS.filter((name) => !nonPalette.includes(name));
  const emitted = await component
    .locator('[data-slot="theme-scope"]')
    .evaluate((scope, names) => names.filter((name) => scope.style.getPropertyValue(name) === ""), palette);
  // A variable the scope does not emit leaks nothing, so the comparison below would pass without judging it.
  expect(emitted, "palette variables the full-palette scope left unset").toEqual([]);
  const resolved = (nest: string): Promise<Readonly<Record<string, Readonly<Record<string, string>>>>> =>
    page.locator(`[data-nest="${nest}"] [data-seed-probe]`).evaluateAll(
      (probes, names) =>
        Object.fromEntries(
          probes.map((probe) => {
            const style = getComputedStyle(probe);
            return [probe.getAttribute("data-seed-probe"), Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]))];
          }),
        ),
      palette,
    );
  expect(await resolved("carried")).toEqual(await resolved("page"));
});

for (const theme of [undefined, ...SEED_THEMES]) {
  test(`${theme ?? "hearth"}: a meter zone fill and a status Card edge hold the 3:1 non-text floor`, async ({ mount, page }) => {
    const component = await mount<typeof ToneMarkStory>("tests/ui/content/theme-scope/_contrast-stories/ToneMarkStory", theme === undefined ? {} : { theme });
    for (const accent of ["info", "warning"]) {
      const bar = component.locator(`[data-mark="meter-${accent}"] [data-slot="track-bar"]`);
      await expect(bar).toBeVisible();
      const fill = await pixelSurface(page, bar.locator('[data-slot="track-bar-fill"]'));
      // The bar is half full, so its far end is bare track.
      const track = await pixelSurface(page, bar, { region: { x0: 0.8, x1: 0.98, y0: 0.2, y1: 0.8 } });
      expect(wcagContrastRatio(fill.rgb, track.rgb), `meter ${accent}: ${fill.describe} on ${track.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
    const ground = await pixelSurface(page, component.locator(`[data-mark="ground"]`), { region: { x0: 0.01, x1: 0.03, y0: 0.0, y1: 0.02 } });
    for (const tone of ["warning", "info"]) {
      const card = component.locator(`[data-mark="card-${tone}"]`);
      const box = await card.boundingBox();
      if (box === null) {
        throw new Error(`card ${tone} has no box`);
      }
      const edge = await pixelSurface(page, card, { region: { x0: 0.4, x1: 0.6, y0: 0, y1: 1 / box.height } });
      expect(wcagContrastRatio(edge.rgb, ground.rgb), `card ${tone}: ${edge.describe} on ${ground.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
}
