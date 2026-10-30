import { readSurfaceDesignAudit, resolvedLength } from "@orb/testkit/browser/spec";
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { channelName } from "../../client/lib/appearance-channel-names.ts";
import type { RampChartsStory, RampControlsStory, RampTypographyStory } from "./_ramp-enforcement-stories.tsx";

const STORIES = "tests/ui/styles/_ramp-enforcement-stories";
const CONTROLS = `${STORIES}/RampControlsStory`;
const CHARTS = `${STORIES}/RampChartsStory`;
const SHRUNK_SCALE = 0.8;
const LARGE_SCALE = 1.25;
const FINE_CONTROL_HEIGHT = 32;
const FINE_SWITCH_WIDTH = 48;

async function expectSwitchGeometry(control: Locator): Promise<void> {
  const shape = await control.evaluate((element) => {
    const thumb = element.querySelector('[data-slot="switch-thumb"]');
    if (thumb === null) {
      throw new Error("Switch thumb missing");
    }
    const box = element.getBoundingClientRect();
    const knob = thumb.getBoundingClientRect();
    return {
      ratio: box.width / box.height,
      share: knob.height / box.height,
      blockGap: knob.top - box.top,
      inlineGap: element.getAttribute("aria-checked") === "true" ? box.right - knob.right : knob.left - box.left,
    };
  });
  expect(shape.ratio).toBeGreaterThan(1.4);
  expect(shape.share).toBeGreaterThanOrEqual(0.45);
  expect(shape.share).toBeLessThanOrEqual(0.65);
  expect(shape.inlineGap).toBeCloseTo(shape.blockGap);
}

async function rootScale(page: import("@playwright/test").Page, scale: number): Promise<void> {
  await page.evaluate(({ name, value }) => document.documentElement.style.setProperty(name, String(value)), { name: channelName("fontScale"), value: scale });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", contrast: "no-preference", forcedColors: "none" });
});

test("public icon ink and optical weights follow tokens and scaling without changing SVG drawing coordinates", async ({ mount, page }) => {
  const component = await mount<typeof RampControlsStory>(CONTROLS);
  let originalRatio: number | undefined;
  for (const scale of [1, LARGE_SCALE]) {
    await rootScale(page, scale);
    for (const [name, token, stroke] of [
      ["Small icon", "size.icon-xs", "stroke-width.icon-hairline"],
      ["Regular icon", "size.icon-md", "stroke-width.icon-regular"],
      ["Bold icon", "size.icon-lg", "stroke-width.icon-bold"],
    ] as const) {
      const icon = component.getByLabel(name, { exact: true });
      await expect(icon).toHaveCSS("width", `${Math.ceil(LENGTH_BASE_PX[token] * scale)}px`);
      await expect(icon).toHaveCSS("stroke-width", `${LENGTH_BASE_PX[stroke]}px`);
      await expect(icon.locator("path").first()).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
    await expect(component.locator('svg[role="img"]:not([data-slot])')).toHaveCSS("width", `${Math.ceil(LENGTH_BASE_PX["size.icon-lg"] * scale)}px`);
    const lock = component.locator('[data-slot="hidden-icon"]');
    const parent = component.getByRole("meter", { name: "Hidden clock", exact: true });
    const ratio = await lock.evaluate((node: SVGElement) => node.getBoundingClientRect().width / (node.ownerSVGElement?.getBoundingClientRect().width ?? 1));
    expect(ratio).toBeGreaterThan(0);
    originalRatio ??= ratio;
    expect(ratio).toBeCloseTo(originalRatio);
    await expect(parent).toBeVisible();
  }
  const compact = component.getByRole("status").filter({ hasText: "Compact loader" });
  const hero = component.getByRole("status").filter({ hasText: "Hero loader" });
  await expect(compact.locator(".orb-web-spokes")).not.toHaveAttribute("d", (await hero.locator(".orb-web-spokes").getAttribute("d")) ?? "missing");
});

test("owner size and border overrides reach icon ink, editor diagnostics and the textarea row box", async ({ mount, page }, testInfo) => {
  const component = await mount<typeof RampControlsStory>(CONTROLS);
  const editor = component.locator(".cm-editor");
  const typography = await editor.evaluate((element) => {
    const content = element.querySelector(".cm-content");
    if (content === null) {
      throw new Error("CodeMirror content missing");
    }
    const root = getComputedStyle(element);
    const editable = getComputedStyle(content);
    return { rootFont: root.fontFamily, contentFont: editable.fontFamily, rootLeading: root.lineHeight, contentLeading: editable.lineHeight };
  });
  await testInfo.attach("editor-typography", { body: JSON.stringify(typography), contentType: "application/json" });
  expect.soft(typography.contentFont).toBe(typography.rootFont);
  expect.soft(typography.contentLeading).toBe(typography.rootLeading);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--size-icon-md", "29px");
    document.documentElement.style.setProperty("--border-width-control", "3px");
  });
  await expect(component.getByLabel("Regular icon", { exact: true })).toHaveCSS("width", "29px");
  const notes = component.getByRole("textbox", { name: "Bounded notes", exact: true });
  const box = await notes.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      expected:
        2 * Number.parseFloat(style.lineHeight) +
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth),
    };
  });
  expect(box.height).toBeCloseTo(box.expected, 1);
  await expect(component.locator(".cm-gutters")).toHaveCSS("border-right-width", "3px");
  await expect(component.locator(".cm-lint-marker-error")).toHaveCSS("width", `${LENGTH_BASE_PX["size.icon-xs"]}px`);
  await page.evaluate(() => document.documentElement.style.setProperty("--font-mono", "Georgia, serif"));
  await expect(editor).toHaveCSS("font-family", "Georgia, serif");
  await expect(editor.locator(".cm-content")).toHaveCSS("font-family", "Georgia, serif");
});

test("real charts remeasure label typography and density while retaining the shared default reservation", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const component = await mount<typeof RampChartsStory>(CHARTS);
  const read = component.getByRole("button", { name: "Read chart options", exact: true });
  const output = component.getByLabel("Chart options", { exact: true });
  const reference = component.locator('[data-slot="chart-font-reference"]');
  let previousScale: number | undefined;
  for (const [font, density, scale] of [
    ["Geist", "comfortable", 1],
    ["Georgia", "compact", LARGE_SCALE],
    ["Georgia", "comfortable", LARGE_SCALE],
    ["Geist", "comfortable", SHRUNK_SCALE],
  ] as const) {
    if (previousScale !== scale) {
      await rootScale(page, scale);
      previousScale = scale;
    }
    await component.update({ font, density });
    await expect(component.locator('[data-slot="histogram"] canvas')).toBeVisible();
    const typography = await reference.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      probe.style.width = "var(--spacing-row)";
      probe.style.position = "fixed";
      element.append(probe);
      const padding = Number.parseFloat(getComputedStyle(probe).width);
      probe.remove();
      return { fontSize: Number.parseFloat(style.fontSize), fontFamily: style.fontFamily, fontWeight: Number(style.fontWeight), padding };
    });
    await expect
      .poll(async () => {
        await read.click();
        return JSON.parse((await output.textContent()) ?? "{}");
      })
      .toMatchObject({
        yAxis: [{ axisLabel: { fontSize: typography.fontSize, fontFamily: typography.fontFamily, fontWeight: typography.fontWeight } }],
        grid: [{ left: typography.padding }],
      });
    const histogram = component.locator('[data-slot="histogram"] [data-slot="chart"] canvas');
    await expect.poll(async () => Math.abs(((await histogram.boundingBox())?.height ?? 0) - LENGTH_BASE_PX["height.chart"] * scale)).toBeLessThanOrEqual(1);
    expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await component.locator("[data-live-token-root]").evaluate((element: HTMLElement) => {
    element.style.setProperty("--text-label", "calc(1rem + 1px)");
    element.style.setProperty("--spacing-row", "calc(var(--spacing-tight) * 3)");
  });
  const ownerFont = await reference.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await expect
    .poll(async () => {
      await read.click();
      return JSON.parse((await output.textContent()) ?? "{}");
    })
    .toMatchObject({ yAxis: [{ axisLabel: { fontSize: ownerFont } }], grid: [{ left: 3 * Math.ceil(LENGTH_BASE_PX["spacing.tight"] * SHRUNK_SCALE) }] });
});

test.describe("coarse font-scale floor", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("public hit boxes retain the project touch floor at the minimum font scale", async ({ mount, page }, testInfo) => {
    const component = await mount<typeof RampControlsStory>(CONTROLS);
    await rootScale(page, SHRUNK_SCALE);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const targets = [
      component.getByRole("button", { name: "Toggle sample", exact: true }),
      component.getByRole("switch", { name: "Switch sample", exact: true }),
      component.getByRole("combobox", { name: "Select sample", exact: true }),
    ];
    const measurements = await Promise.all(targets.map((target) => target.boundingBox()));
    await testInfo.attach("coarse-hit-boxes", {
      body: JSON.stringify({ order: ["Button", "Switch", "Select"], measurements }),
      contentType: "application/json",
    });
    for (const hit of measurements) {
      expect(hit).not.toBeNull();
      expect.soft(hit?.height).toBeGreaterThanOrEqual(LENGTH_BASE_PX["size.touch-target"]);
      expect.soft(hit?.width).toBeGreaterThanOrEqual(LENGTH_BASE_PX["size.touch-target"]);
    }
    const toggle = component.getByRole("button", { name: "Toggle sample", exact: true });
    await toggle.tap();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const control = component.getByRole("switch", { name: "Switch sample", exact: true });
    await expectSwitchGeometry(control);
    await control.tap();
    await expect(control).toBeChecked();
    await expectSwitchGeometry(control);
  });
});

test("fine-pointer controls keep their unfloored dimensions and switch proportions", async ({ mount, page }) => {
  const component = await mount<typeof RampControlsStory>(CONTROLS);
  expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
  for (const scale of [1, SHRUNK_SCALE]) {
    await rootScale(page, scale);
    const button = component.getByRole("button", { name: "Toggle sample", exact: true });
    const control = component.getByRole("switch", { name: "Switch sample", exact: true });
    await expect(button).toHaveCSS("height", `${Math.ceil(FINE_CONTROL_HEIGHT * scale)}px`);
    await expect(control).toHaveCSS("height", `${Math.ceil(FINE_CONTROL_HEIGHT * scale)}px`);
    await expect(control).toHaveCSS("width", `${Math.ceil(FINE_SWITCH_WIDTH * scale)}px`);
    await expectSwitchGeometry(control);
    await control.click();
    await expectSwitchGeometry(control);
  }
});

for (const pointer of ["fine", "coarse"] as const) {
  test.describe(`${pointer} typography scaling`, () => {
    test.use({ hasTouch: pointer === "coarse", isMobile: pointer === "coarse" });
    for (const width of pointer === "coarse" ? [390] : [390, 1280]) {
      test(`governed text and heading steps follow the root font-scale channel at ${width}px`, async ({ mount, page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        const component = await mount<typeof RampTypographyStory>(`${STORIES}/RampTypographyStory`, { fontScale: 1 });
        for (const scale of [1, 1.5, SHRUNK_SCALE]) {
          await component.update({ fontScale: scale });
          for (const [label, token, leading] of [
            ["Heading sample", "text.headline", "leading.headline"],
            ["Subheading sample", "text.title", "leading.title"],
            ["Masthead sample", "text.display", "leading.display"],
            ["Reading sample", "text.body", "leading.body"],
            ["Label sample", "text.label", "leading.label"],
            ["Gloss sample", "text.micro", "leading.micro"],
            ["Code sample", "text.code", "leading.label-relaxed"],
          ] as const) {
            const text = component.getByText(label, { exact: true });
            await expect(text).toHaveCSS("font-size", `${Number((LENGTH_BASE_PX[token] * scale).toFixed(4))}px`);
            const lineBox = await resolvedLength(page, `var(${TOKENS[leading].cssVar})`, page.locator("body"));
            expect(Number.isInteger(lineBox)).toBe(true);
            await expect(text).toHaveCSS("line-height", `${lineBox}px`);
          }
          const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
          const formSize = coarse ? Math.max(LENGTH_BASE_PX["text.field"] * scale, LENGTH_BASE_PX["text.field"]) : LENGTH_BASE_PX["text.body"] * scale;
          const denseSize = coarse
            ? Math.max(LENGTH_BASE_PX["text.field-dense"] * scale, LENGTH_BASE_PX["text.field-dense"])
            : LENGTH_BASE_PX["text.label"] * scale;
          await expect(component.getByRole("textbox", { name: "Form typography", exact: true })).toHaveCSS("font-size", `${Number(formSize.toFixed(4))}px`);
          await expect(component.getByRole("textbox", { name: "Dense typography", exact: true })).toHaveCSS("font-size", `${Number(denseSize.toFixed(4))}px`);
          expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
          await info.attach(`typography-${width}-${scale}`, { body: await page.screenshot({ scale: "css" }), contentType: "image/png" });
        }
      });
    }
  });
}

test("the typography audit uses the scaled local micro step and still detects text below it", async ({ mount, page }, info) => {
  const component = await mount<typeof RampTypographyStory>(`${STORIES}/RampTypographyStory`, { fontScale: SHRUNK_SCALE });
  const gloss = component.getByText("Gloss sample", { exact: true });
  await expect(gloss).toHaveCSS("font-size", `${LENGTH_BASE_PX["text.micro"] * SHRUNK_SCALE}px`);
  const healthy = await readSurfaceDesignAudit(page);
  await info.attach("scaled-micro-healthy", { body: JSON.stringify(healthy, null, 2), contentType: "application/json" });
  expect(healthy.audit.findings.filter(({ rule }) => rule === "text-below-ramp")).toEqual([]);
  await page.addStyleTag({ content: `[data-voice="gloss"] { font-size: ${LENGTH_BASE_PX["text.micro"] * SHRUNK_SCALE - 1}px; }` });
  const broken = await readSurfaceDesignAudit(page);
  await info.attach("scaled-micro-below-ramp", { body: JSON.stringify(broken, null, 2), contentType: "application/json" });
  expect(broken.audit.findings.some(({ rule }) => rule === "text-below-ramp")).toBe(true);
});

for (const inline of [false, true]) {
  test(`an important typography override remains a finding with ${inline ? "present" : "absent"} inline style`, async ({ mount, page }, info) => {
    const component = await mount<typeof RampTypographyStory>(`${STORIES}/RampTypographyStory`, { fontScale: SHRUNK_SCALE });
    const gloss = component.getByText("Gloss sample", { exact: true });
    const size = LENGTH_BASE_PX["text.micro"] * SHRUNK_SCALE - 1;
    const original = inline ? `color: inherit;  font-size: ${size}px !important;` : null;
    await page.addStyleTag({ content: `[data-voice="gloss"] { font-size: ${size}px !important; }` });
    await gloss.evaluate((element, style) => {
      if (style !== null) {
        element.setAttribute("style", style);
      }
    }, original);
    const priority = await gloss.evaluate((element: HTMLElement) => element.style.getPropertyPriority("font-size"));
    await expect(gloss).toHaveCSS("font-size", `${size}px`);
    const audited = await readSurfaceDesignAudit(page);
    await info.attach(`important-override-${inline ? "inline" : "stylesheet"}`, { body: JSON.stringify(audited, null, 2), contentType: "application/json" });
    expect(audited.audit.findings.some(({ rule }) => rule === "text-below-ramp")).toBe(true);
    const sampled = audited.samples.textStyles.find(({ ownVoice }) => ownVoice === "gloss");
    expect(sampled?.fontSizePx).toBe(size);
    expect(sampled?.rampFloorPx).toBeCloseTo(LENGTH_BASE_PX["text.micro"] * SHRUNK_SCALE, 4);
    await expect.poll(() => gloss.getAttribute("style")).toBe(original);
    expect(await gloss.evaluate((element: HTMLElement) => element.style.getPropertyPriority("font-size"))).toBe(priority);
    await expect(gloss).toHaveCSS("font-size", `${size}px`);
  });
}
