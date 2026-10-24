// The shell's appearance effects as the browser renders them: the glass, elevation and contrast cascade on the production
// panes, the dials it stamps on the root, the remembered boot hint, and what survives a handover to the pending mark.

import { REDUCED_MOTION_ATTR } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CDPSession, Locator, Page } from "@playwright/test";
import type { AppShellModalStory, AppShellStory } from "./_app-shell-stories.tsx";
import type { ShellToPendingStory } from "./_shell-handover-stories.tsx";
import { PHONE, pixel, resolvedLength, SECTION_PROCEDURES, SHELL_STORIES, seedShellState } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const MODAL_STORY = `${SHELL_STORIES}/AppShellModalStory`;
const HANDOVER = "tests/client/features/app-shell/surfaces/_shell-handover-stories/ShellToPendingStory";
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const DIALOG = '[data-slot="dialog-popup"]';
const WIDE = { width: 1280, height: 800 } as const;
const BOTH_DOCKED = { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } } as const;
// Every axis the cascade cases read, pinned so the corpus viewer's own appearance never decides a case.
const BASE_APPEARANCE: Partial<AppearanceSettings> = {
  backgroundImageKind: "none",
  blurSurfaces: ["panels", "composer", "modals"],
  elevation: "flat",
  reducedMotion: false,
  surfaceTexture: "none",
};
const SERVED = SECTION_PROCEDURES.filter((path) => path !== "settings.getUserSettings");
// The reduced-motion floor writes `animation-duration: 0.01ms`, a literal with no token; anything under a
// millisecond is floored, and the unfloored glyph runs at the resolved `--motion-breathe`.
const FLOORED_MS = 1;
// The contrast arm's authored fill dial in globals.css, which has no token.
const CONTRAST_FILL = "92%";
const CONTRAST_FILL_ALPHA = 0.92;
// The UA root font size the `:root { font-size }` scale multiplies; no token names a browser default.
const UA_ROOT_PX = 16;
const TRACK_WIDTHS = [1280, 1440, 1920] as const;
const DIAL_PCT = 50;
const SHIMMER_CLASS = "orb-weave-shimmer";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Media = Readonly<{ contrast: "more" | "no-preference"; transparency: "reduce" | "no-preference" }>;

let root: Root;
let lightThemeId: string;
const sessions = new WeakMap<Page, CDPSession>();

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const themes = await (await root.internalCallerFor(root.ownerId)).settings.listThemes();
  const light = themes.find((theme) => theme.isSeed && theme.name === "Light");
  if (light === undefined) {
    throw new Error("The corpus root has no seeded Light theme");
  }
  lightThemeId = light.id;
});

test.beforeEach(async ({ page }) => {
  await emulate(page, { contrast: "no-preference", transparency: "no-preference" });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/**
 * State the whole emulated media list in one CDP call. Playwright models no reduced-transparency, and its own
 * `emulateMedia` replaces the CDP feature list, so this file emulates media only here. The session stays attached:
 * its overrides end when it detaches.
 */
async function emulate(page: Page, media: Media): Promise<void> {
  const session = sessions.get(page) ?? (await page.context().newCDPSession(page));
  sessions.set(page, session);
  const features = [
    { name: "prefers-color-scheme", value: "dark" },
    { name: "prefers-reduced-motion", value: "no-preference" },
    { name: "prefers-contrast", value: media.contrast },
    { name: "prefers-reduced-transparency", value: media.transparency },
  ];
  await session.send("Emulation.setEmulatedMedia", { features });
  const missed = await page.evaluate((list) => list.filter(({ name, value }) => !matchMedia(`(${name}: ${value})`).matches), features);
  if (missed.length > 0) {
    throw new Error(`Chromium did not take the emulated media ${JSON.stringify(missed)}`);
  }
}

/** Serve the shell and its sections, with the corpus viewer's settings carrying `appearance` and, when named, a selected theme. */
async function routeAppearance(page: Page, corpus: CorpusWire, appearance: Partial<AppearanceSettings>, selectedThemeId?: string): Promise<void> {
  const [captured] = corpus.reads["settings.getUserSettings"];
  if (captured === undefined) {
    throw new Error("The corpus has no settings capture");
  }
  const settings = captured.output;
  const theme = selectedThemeId === undefined ? settings.config.theme : { ...settings.config.theme, selectedThemeId };
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), SERVED),
    "settings.getUserSettings": () => ({
      ...settings,
      config: { ...settings.config, theme, appearance: { ...settings.config.appearance, ...BASE_APPEARANCE, ...appearance } },
    }),
  });
}

/** The selected theme for a case: the corpus default for dark, the seeded Light theme for light. */
function themeIdFor(theme: "dark" | "light"): string | undefined {
  return theme === "light" ? lightThemeId : undefined;
}

function computed(locator: Locator, property: string, pseudo: string | null = null): Promise<string> {
  return locator.evaluate((element, [name, at]) => getComputedStyle(element, at).getPropertyValue(name), [property, pseudo] as const);
}

// A `color-mix()` fill serializes with a trailing `/ alpha)`, a legacy colour with a comma alpha, an opaque one with none.
function alphaOf(color: string): number {
  const slash = /\/\s*([\d.]+)\s*\)$/u.exec(color)?.[1];
  const comma = /^(?:rgba|hsla)\(.*,\s*([\d.]+)\s*\)$/u.exec(color)?.[1];
  return Number(slash ?? comma ?? 1);
}

async function fillAlpha(locator: Locator, pseudo: string | null = null): Promise<number> {
  return alphaOf(await computed(locator, "background-color", pseudo));
}

/** The pane's glass is painted on its `::before` carrier, so a blur or a glass fill is read there. */
function carrierBlur(pane: Locator): Promise<string> {
  return computed(pane, "backdrop-filter", "::before");
}

async function borderWidths(locator: Locator): Promise<string> {
  const sides = ["block-start", "inline-end", "block-end", "inline-start"];
  const widths = await Promise.all(sides.map((side) => computed(locator, `border-${side}-width`)));
  return widths.join(" ");
}

/** `color-mix(in oklab, var(token) pct, partner)` resolved inside `host`, so it inherits that box's theme and colour scheme. */
function mixedFill(host: Locator, token: string, pct: string, partner: string): Promise<string> {
  return host.evaluate(
    (element, [name, amount, over]) => {
      const probe = element.ownerDocument.createElement("div");
      probe.style.backgroundColor = `color-mix(in oklab, var(${name}) ${amount}, ${over})`;
      element.append(probe);
      const fill = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return fill;
    },
    [token, pct, partner] as const,
  );
}

/** The list pane's inline-end seam against the pane a few pixels inside it, off the framebuffer. */
async function seamRatio(page: Page): Promise<number> {
  const box = await page.locator(LIST).boundingBox();
  if (box === null) {
    throw new Error("The list pane has no box to sample");
  }
  const y = Math.floor(box.y + box.height / 2);
  const edgeX = Math.floor(box.x + box.width) - 1;
  const [edge, inside] = await Promise.all([pixel(page, edgeX, y), pixel(page, edgeX - 8, y)]);
  const ratio = wcagContrastRatio(edge, inside);
  test.info().annotations.push({ type: "seam-contrast", description: `${ratio.toFixed(2)}:1 edge ${JSON.stringify(edge)} inside ${JSON.stringify(inside)}` });
  return ratio;
}

function animationMs(raw: string): number {
  return Number.parseFloat(raw) * (raw.endsWith("ms") ? 1 : 1000);
}

function glyphDurationMs(splash: Locator): Promise<number> {
  return splash
    .locator("svg")
    .evaluate((glyph) => getComputedStyle(glyph).animationDuration)
    .then(animationMs);
}

/** A weave shimmer appended at `selector`'s position, read for its animation duration. */
function shimmerMs(page: Page, selector: string): Promise<number> {
  return page
    .evaluate(
      ([at, shimmer]) => {
        const probe = document.createElement("div");
        probe.className = shimmer;
        document.querySelector(at)?.append(probe);
        const duration = getComputedStyle(probe).animationDuration;
        probe.remove();
        return duration;
      },
      [selector, SHIMMER_CLASS] as const,
    )
    .then(animationMs);
}

function breatheTokenMs(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const probe = document.createElement("div");
      probe.style.animationDuration = "var(--motion-breathe)";
      document.body.append(probe);
      const duration = getComputedStyle(probe).animationDuration;
      probe.remove();
      return duration;
    })
    .then(animationMs);
}

/** Once the shell has stamped the flag, replace it with the router's pending mark. */
async function handOver(page: Page, reducedMotion: boolean): Promise<Locator> {
  await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, String(reducedMotion));
  await page.getByRole("button", { name: "Hand over", exact: true }).click();
  const splash = page.getByRole("status", { name: "Loading", exact: true });
  await expect(splash).toBeVisible();
  return splash;
}

test.describe("glass and elevation", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
  });

  for (const elevation of ["flat", "ramp"] as const) {
    test(`with the glass off, ${elevation} elevation leaves the panes, the reading surface and the topbar opaque`, async ({ corpus, mount, page }) => {
      await seedShellState(page, BOTH_DOCKED);
      await routeAppearance(page, corpus, { blurSurfaces: [], elevation });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", elevation);
      await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
      for (const surface of [LIST, CONTEXT, ".shell-main", ".shell-topbar"]) {
        await expect.poll(() => fillAlpha(page.locator(surface))).toBe(1);
      }
      await expect.poll(() => carrierBlur(page.locator(LIST))).toBe("none");
    });
  }

  test("the panel glass beats ramp elevation: the pane paints no fill and its carrier is translucent glass", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"], elevation: "ramp" });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const pane = page.locator(LIST);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "ramp");
    await expect.poll(() => fillAlpha(pane)).toBeLessThan(1);
    await expect.poll(() => fillAlpha(pane, "::before")).toBeLessThan(1);
    await expect.poll(() => carrierBlur(pane)).toContain("blur(");
    await expect.poll(() => carrierBlur(pane)).toContain("saturate(");
  });

  test("glow lifts Home's surface through its first child while the surface root stays a box-less contents wrapper", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { elevation: "glow" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "glow");
    const surface = page.getByRole("main").locator('[data-slot="surface-root"]').first();
    await expect(surface).toHaveCSS("display", "contents");
    await expect(surface).toHaveCSS("border-top-width", "0px");
    await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(surface).toHaveCSS("border-top-left-radius", "0px");
    await expect.poll(() => computed(surface.locator("> :first-child"), "filter")).toContain("drop-shadow(");
  });

  test("flat elevation gives Home's surface carrier no glow filter", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { elevation: "flat" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "flat");
    const surface = page.getByRole("main").locator('[data-slot="surface-root"]').first();
    await expect(surface).toBeAttached();
    await expect.poll(() => computed(surface.locator("> :first-child"), "filter")).toBe("none");
  });

  test("an open pane's carrier blurs and a collapsed pane's carrier pays for no backdrop filter", async ({ corpus, mount, page }) => {
    await seedShellState(page, BOTH_DOCKED);
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"] });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => carrierBlur(page.locator(LIST))).toContain("blur(");
    await expect.poll(() => carrierBlur(page.locator(CONTEXT))).toContain("saturate(");

    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await page.getByRole("button", { name: "Hide list panel", exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect.poll(() => carrierBlur(page.locator(LIST))).toBe("none");
    await expect.poll(() => carrierBlur(page.locator(CONTEXT))).toBe("none");
  });

  test("the docked pane carries no layer promotion of its own while its carrier blurs", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"] });
    await mount<typeof AppShellStory>(STORY, {});
    const pane = page.locator(LIST);
    await expect(pane).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => carrierBlur(pane)).toContain("blur(");
    const promotion = await pane.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdrop: style.backdropFilter,
        threeD: style.transformStyle === "preserve-3d" || style.transform.startsWith("matrix3d"),
        willChange: style.willChange,
      };
    });
    expect(promotion).toStrictEqual({ backdrop: "none", threeD: false, willChange: "auto" });
  });

  test("the glass is emitted above the shell breakpoint and withheld on a phone, where the pane keeps its own opaque fill", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"] });
    await mount<typeof AppShellStory>(STORY, {});
    const pane = page.locator(LIST);
    await expect.poll(() => carrierBlur(pane)).toContain("blur(");
    await expect.poll(() => fillAlpha(pane, "::before")).toBeLessThan(1);

    await page.setViewportSize(PHONE);
    await expect.poll(() => carrierBlur(pane)).toBe("none");
    await expect.poll(() => fillAlpha(pane)).toBe(1);
  });
});

test("the panel tracks resolve to whole CSS pixels where the raw panel token does not", async ({ corpus, mount, page }) => {
  await routeAppearance(page, corpus, {});
  await mount<typeof AppShellStory>(STORY, {});
  const tracks: number[] = [];
  const raw: number[] = [];
  for (const width of TRACK_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    tracks.push(await resolvedLength(page, "var(--panel-w)"), await resolvedLength(page, "var(--panel-context-w)"));
    raw.push(await resolvedLength(page, "var(--dimension-panel)"));
  }
  expect(raw.some((length) => !Number.isInteger(length))).toBe(true);
  expect(tracks.filter((length) => !Number.isInteger(length))).toStrictEqual([]);
});

test.describe("reduced transparency", () => {
  test("turns the pane carrier and the dialog solid and stops their blur, where no preference keeps the glass", async ({ corpus, mount, page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels", "modals"] });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    const pane = page.locator(LIST);
    const dialog = page.locator(DIALOG);
    await expect(dialog).toBeVisible();
    await expect.poll(() => fillAlpha(pane, "::before")).toBeLessThan(1);
    await expect.poll(() => carrierBlur(pane)).toContain("blur(");
    await expect.poll(() => fillAlpha(dialog)).toBeLessThan(1);
    await expect.poll(() => computed(dialog, "backdrop-filter", "::before")).toContain("blur(");

    await emulate(page, { contrast: "no-preference", transparency: "reduce" });
    await expect.poll(() => fillAlpha(pane, "::before")).toBe(1);
    await expect.poll(() => carrierBlur(pane)).toBe("none");
    await expect.poll(() => fillAlpha(dialog)).toBe(1);
    await expect.poll(() => computed(dialog, "backdrop-filter", "::before")).toBe("none");
  });

  test("leaves the phone's own pane and reading-surface fills standing", async ({ corpus, mount, page }) => {
    await page.setViewportSize(PHONE);
    await emulate(page, { contrast: "no-preference", transparency: "reduce" });
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"] });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator("html")).toHaveAttribute("data-blur-panels", "");
    await expect.poll(() => fillAlpha(page.locator(LIST))).toBe(1);
    await expect.poll(() => fillAlpha(page.locator(".shell-main"))).toBe(1);
  });
});

test.describe("contrast more", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
  });

  test("thickens only the side each pane authors, and not below the shell breakpoint", async ({ corpus, mount, page }) => {
    await seedShellState(page, BOTH_DOCKED);
    await routeAppearance(page, corpus, {});
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => borderWidths(page.locator(LIST))).toBe("0px 1px 0px 0px");

    await emulate(page, { contrast: "more", transparency: "no-preference" });
    await expect.poll(() => borderWidths(page.locator(LIST))).toBe("0px 2px 0px 0px");
    await expect.poll(() => borderWidths(page.locator(CONTEXT))).toBe("0px 0px 0px 2px");

    await page.setViewportSize(PHONE);
    await expect.poll(() => computed(page.locator(LIST), "border-inline-end-width")).not.toBe("2px");
  });

  for (const theme of ["dark", "light"] as const) {
    test(`raises the glass fill to the contrast dial with the dialog keeping its own popover tint (${theme})`, async ({ corpus, mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await routeAppearance(page, corpus, { blurSurfaces: ["panels", "modals"] }, themeIdFor(theme));
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
      const pane = page.locator(LIST);
      const dialog = page.locator(DIALOG);
      await expect(dialog).toBeVisible();
      await expect.poll(() => fillAlpha(pane, "::before")).toBeLessThan(CONTRAST_FILL_ALPHA);

      await emulate(page, { contrast: "more", transparency: "no-preference" });
      await expect.poll(() => fillAlpha(pane, "::before")).toBeCloseTo(CONTRAST_FILL_ALPHA, 2);
      const partner = theme === "light" ? "var(--color-reading-plate)" : "transparent";
      const popover = await mixedFill(dialog, "--color-popover", CONTRAST_FILL, partner);
      expect(popover).not.toBe(await mixedFill(dialog, "--color-sidebar", CONTRAST_FILL, partner));
      await expect.poll(() => computed(dialog, "background-color")).toBe(popover);
    });

    test(`lifts the list seam past the non-text floor from a hairline below it (${theme})`, async ({ corpus, mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await routeAppearance(page, corpus, {}, themeIdFor(theme));
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
      await expect.poll(() => fillAlpha(page.locator(LIST), "::before")).toBeLessThan(1);
      const hairline = await seamRatio(page);
      expect(hairline).toBeGreaterThan(1);
      expect(hairline).toBeLessThan(AA_NON_TEXT_RATIO);

      await emulate(page, { contrast: "more", transparency: "no-preference" });
      await expect.poll(() => computed(page.locator(LIST), "border-inline-end-width")).toBe("2px");
      await expect.poll(() => seamRatio(page)).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    });
  }

  test("keeps the raised seam with the glass off", async ({ corpus, mount, page }) => {
    await emulate(page, { contrast: "more", transparency: "no-preference" });
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: [] });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.locator("html")).not.toHaveAttribute("data-blur-panels", /.*/u);
    await expect.poll(() => borderWidths(page.locator(LIST))).toBe("0px 2px 0px 0px");
    await expect.poll(() => seamRatio(page)).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  });

  test("yields the alpha to reduced transparency and keeps its border", async ({ corpus, mount, page }) => {
    await emulate(page, { contrast: "more", transparency: "reduce" });
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels", "modals"] });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    const pane = page.locator(LIST);
    const dialog = page.locator(DIALOG);
    await expect(dialog).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-blur-panels", "");
    await expect.poll(() => fillAlpha(pane, "::before")).toBe(1);
    await expect.poll(() => carrierBlur(pane)).toBe("none");
    await expect.poll(() => fillAlpha(dialog)).toBe(1);
    await expect.poll(() => computed(pane, "border-inline-end-width")).toBe("2px");
  });
});

test.describe("root dials", () => {
  test("the chat-width dial sets the shell's content width to its share of the viewport", async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await routeAppearance(page, corpus, { chatWidthPct: 90 });
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => resolvedLength(page, "var(--width-shell-content)")).toBeCloseTo(1440, 0);
  });

  test("the chat-width dial is held at its floor below the crossover, meets it there, and yields above it", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { chatWidthPct: DIAL_PCT });
    await mount<typeof AppShellStory>(STORY, {});
    const floor = await resolvedLength(page, "var(--dimension-shell-content-floor)");
    const crossover = Math.round((floor * 100) / DIAL_PCT);
    const width = (): Promise<number> => resolvedLength(page, "var(--width-shell-content)");

    await page.setViewportSize({ width: crossover - 200, height: 900 });
    await expect.poll(width).toBeCloseTo(floor, 0);
    await page.setViewportSize({ width: crossover, height: 900 });
    await expect.poll(width).toBeCloseTo((crossover * DIAL_PCT) / 100, 0);
    await page.setViewportSize({ width: crossover + 400, height: 900 });
    await expect.poll(width).toBeCloseTo(((crossover + 400) * DIAL_PCT) / 100, 0);
  });

  test("the font-scale dial sets the document's root font size", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { fontScale: 1.25 });
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => computed(page.locator("html"), "font-size")).toBe(`${UA_ROOT_PX * 1.25}px`);
  });

  test("the app's reduced-motion setting floors an animation outside the shell grid as well as inside it", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedMotion: true });
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => shimmerMs(page, ".shell-grid")).toBeLessThan(FLOORED_MS);
    await expect.poll(() => shimmerMs(page, "body")).toBeLessThan(FLOORED_MS);
    await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, "true");
  });
});

test.describe("handover to the pending mark", () => {
  test("the pending mark that replaces the shell keeps the app's reduced-motion flag, and its shimmer stops", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedMotion: true });
    await mount<typeof ShellToPendingStory>(HANDOVER, {});
    const splash = await handOver(page, true);
    await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, "true");
    await expect.poll(() => glyphDurationMs(splash)).toBeLessThan(FLOORED_MS);
  });

  test("with the app's reduced motion off the pending mark leaves no stale flag, and its shimmer runs", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedMotion: false });
    await mount<typeof ShellToPendingStory>(HANDOVER, {});
    const splash = await handOver(page, false);
    await expect(page.locator("html")).not.toHaveAttribute(REDUCED_MOTION_ATTR, /.*/u);
    await expect.poll(() => glyphDurationMs(splash)).toBe(await breatheTokenMs(page));
  });
});
