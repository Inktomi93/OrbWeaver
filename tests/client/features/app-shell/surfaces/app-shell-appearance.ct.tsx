// The shell's appearance effects as the browser renders them: the glass, elevation and contrast cascade on the production
// panes, the dials it stamps on the root, the remembered boot hint, and what survives a handover to the pending mark.

import { crc32, deflateSync } from "node:zlib";
import type { StoredAsset } from "@orb/contracts/assets";
import { BLOB_ROUTE } from "@orb/contracts/assets";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { AppearanceSettings, OsPreferenceMode } from "@orb/contracts/settings/appearance";
import { BACKGROUND_DIM_MIN, BLUR_SURFACES } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import type { Rgb } from "@orb/kit/theme-derivation";
import { AA_NON_TEXT_RATIO, AA_NORMAL_RATIO, readingPlateAlpha, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { emulateMedia, pixel, releaseEmulatedMedia, resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { channelName } from "../../../lib/appearance-channel-names.ts";
import type { AppShellModalStory, AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import type { ShellToPendingStory } from "./_shell-handover-stories.tsx";
import { PHONE, ROOM_PROCEDURES, SECTION_PROCEDURES, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const MODAL_STORY = `${SHELL_STORIES}/AppShellModalStory`;
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const COMPOSER = '[data-slot="composer"]';
// The roles a corpus room speaks in; no corpus room holds a system message.
const ROOM_ROLES = ["user", "assistant"] as const;
// Few enough of a room's last messages that all of them are on screen at the case viewport.
const TAIL_MESSAGES = 4;
const HANDOVER = "tests/client/features/app-shell/surfaces/_shell-handover-stories/ShellToPendingStory";
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const DIALOG = '[data-slot="dialog-popup"]';
const WIDE = { width: 1280, height: 800 } as const;
const BOTH_DOCKED = { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } } as const;
// Every axis the cascade cases read, pinned so the corpus viewer's own appearance never decides a case.
const BASE_APPEARANCE: Partial<AppearanceSettings> = {
  backgroundImageKind: "none",
  chatStyle: "bubble",
  blurSurfaces: ["panels", "composer", "modals"],
  elevation: "flat",
  reducedMotion: "system",
  surfaceTexture: "none",
};
// The root attributes the appearance channel writes, read from the manifest.
const REDUCED_MOTION_ATTR = channelName("reducedMotion");
const BLUR_SURFACES_ATTR = channelName("blurSurfaces");
const SURFACE_TEXTURE_ATTR = channelName("surfaceTexture");
const SHADOW_EFFECTS_ATTR = channelName("shadowEffects");
const SERVED = [...SECTION_PROCEDURES, ...ROOM_PROCEDURES].filter((path) => path !== "settings.getUserSettings");
// The reduced-motion floor writes `animation-duration: 0.01ms`, a literal with no token; anything under a
// millisecond is floored, and the unfloored glyph runs at the resolved `--motion-breathe`.
const FLOORED_MS = 1;
// The glass fill dials the contrast and reduced-transparency arms set, from their tokens.
const CONTRAST_FILL = TOKENS["blur.fill-contrast"].value;
const SOLID_FILL = TOKENS["blur.fill-solid"].value;
const CONTRAST_FILL_ALPHA = Number.parseFloat(CONTRAST_FILL) / 100;
// The UA root font size the `:root { font-size }` scale multiplies; no token names a browser default.
const UA_ROOT_PX = 16;
const TRACK_WIDTHS = [1280, 1440, 1920] as const;
const DIAL_PCT = 50;
const BLUR_STRENGTH = 20;
const READING_LINE_HEIGHT = 2;
const READING_LETTER_SPACING = 0.05;
const READING_BODY_SCALE = 1.6;
const BLACK_ART_PASSWORD = "synthetic-corpus-ct-black-art-password";
// Large enough that a cover fit paints it as a field, not a tile.
const BLACK_ART_SIDE = 64;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SHIMMER_CLASS = "orb-weave-shimmer";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;
let lightThemeId: string;
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
  await emulateMedia(page, { contrast: "no-preference", transparency: "no-preference" });
});

// The media session is per page and the page outlives the test; detach it so no later spec inherits the overrides.
test.afterEach(async ({ page }) => {
  await releaseEmulatedMedia(page);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The corpus viewer's settings with the cases' pinned appearance, `appearance` over it, and a selected theme when named. */
function appearanceSettings(
  corpus: CorpusWire,
  appearance: Partial<AppearanceSettings>,
  selectedThemeId?: string,
): CorpusWire["reads"]["settings.getUserSettings"][number]["output"] {
  const [captured] = corpus.reads["settings.getUserSettings"];
  if (captured === undefined) {
    throw new Error("The corpus has no settings capture");
  }
  const settings = captured.output;
  const theme = selectedThemeId === undefined ? settings.config.theme : { ...settings.config.theme, selectedThemeId };
  return { ...settings, config: { ...settings.config, theme, appearance: { ...settings.config.appearance, ...BASE_APPEARANCE, ...appearance } } };
}

/** Serve the shell and its sections, with the corpus viewer's settings carrying `appearance` and, when named, a selected theme. */
async function routeAppearance(page: Page, corpus: CorpusWire, appearance: Partial<AppearanceSettings>, selectedThemeId?: string): Promise<void> {
  await routeLiveAppearance(page, corpus, () => ({ appearance, selectedThemeId }));
}

/** {@link routeAppearance} with the settings read each time the shell asks, so a case can remount on a different answer. */
async function routeLiveAppearance(
  page: Page,
  corpus: CorpusWire,
  read: () => { readonly appearance: Partial<AppearanceSettings>; readonly selectedThemeId?: string | undefined },
): Promise<void> {
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), SERVED),
    "settings.getUserSettings": () => {
      const { appearance, selectedThemeId } = read();
      return appearanceSettings(corpus, appearance, selectedThemeId);
    },
  });
}

/** A corpus room whose last messages hold both roles, so a bubble of each is on screen. */
async function groupRoomId(): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: row.id, limit: TAIL_MESSAGES });
    const spoken = new Set(messages.map((message) => message.role));
    if (ROOM_ROLES.every((role) => spoken.has(role))) {
      return row.id;
    }
  }
  throw new Error("No corpus room ends on both roles");
}

/** The room's composer and a bubble of each role are on screen. */
async function roomReady(page: Page): Promise<void> {
  await expect(page.locator(COMPOSER)).toBeVisible();
  for (const role of ROOM_ROLES) {
    await expect(bubble(page, role)).toBeVisible();
  }
}

function bubble(page: Page, role: (typeof ROOM_ROLES)[number]): Locator {
  return page.locator(`[data-role="${role}"] [data-slot="message-bubble"]`).first();
}

/** The corpus viewer's first saved wallpaper, as the appearance fields that select it. */
function wallpaper(corpus: CorpusWire): Partial<AppearanceSettings> {
  const entry = corpus.reads["settings.getUserSettings"][0]?.output.config.appearance.backgroundLibrary[0];
  if (entry === undefined) {
    throw new Error("The corpus viewer has no saved wallpaper");
  }
  return { backgroundImageKind: "asset", backgroundAssetId: entry.assetId, backgroundAssetHash: entry.assetHash, backgroundAssetMime: entry.mime };
}

/** The luminance spread of a page region, decoded in the page: grain is paint, so only the pixels say how many films landed. */
async function noiseSpread(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<number> {
  const shot = await page.screenshot({ clip: box });
  return page.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context?.drawImage(image, 0, 0);
      const data = context?.getImageData(0, 0, image.width, image.height).data ?? new Uint8ClampedArray();
      const values: number[] = [];
      for (let index = 0; index < data.length; index += 4) {
        values.push(0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0));
      }
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    },
    `data:image/png;base64,${shot.toString("base64")}`,
  );
}

/** A design token resolved to the RGB it paints, through a canvas, inside `host` so it takes that box's theme. */
function tokenInk(host: Locator, token: string): Promise<Rgb> {
  return host.evaluate((element, name) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("no 2d context");
    }
    context.fillStyle = getComputedStyle(element).getPropertyValue(name).trim();
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return { b, g, r };
  }, token);
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function centre(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A pure-black PNG: the worst art a light glass surface can sit over, built byte for byte so no image library is needed. */
function blackPng(side: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  // Bit depth 8, colour type 2 (truecolour); compression, filter and interlace stay 0.
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  // Each row is a filter byte followed by its RGB triples, all zero.
  const rows = Buffer.alloc((side * 3 + 1) * side);
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * A fresh corpus root whose owner uploaded a pure-black wallpaper through the production upload route and chose it at
 * the least dim the settings allow, in the seeded Light theme with every glass surface on. Its blob is served to the
 * page from the same root under the owner's own cookie.
 */
async function blackArtRoot(page: Page): Promise<Root> {
  const art = await createCorpusHarness();
  const owner = await art.principalFor(art.ownerId);
  const { cookie } = await captureCookieAuth(art, owner, BLACK_ART_PASSWORD);
  const form = new FormData();
  form.set("kind", "background");
  form.set("file", new Blob([new Uint8Array(blackPng(BLACK_ART_SIDE))], { type: "image/png" }), "black.png");
  const uploaded = await art.http.request("/api/assets/upload", { method: "POST", headers: { cookie, [CSRF_HEADER]: "1", forwarded: "" }, body: form });
  if (!uploaded.ok) {
    throw new Error(`the black wallpaper upload failed (${String(uploaded.status)})`);
  }
  const stored = (await uploaded.json()) as StoredAsset;
  const caller = await art.internalCallerFor(art.ownerId);
  await caller.settings.updateUserSettingsSection({
    section: "appearance",
    patch: {
      ...BASE_APPEARANCE,
      blurSurfaces: [...BLUR_SURFACES],
      backgroundImageKind: "asset",
      backgroundAssetId: stored.assetId,
      backgroundAssetHash: stored.hash,
      backgroundAssetMime: "image/png",
      backgroundDim: BACKGROUND_DIM_MIN,
    },
  });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: lightThemeId } });
  await page.route(`**${BLOB_ROUTE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await art.http.request(`${url.pathname}${url.search}`, { headers: { cookie, forwarded: "" } });
    const headers = Object.fromEntries([...response.headers].filter(([name]) => name !== "set-cookie"));
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  return art;
}

/** The reading plate's alpha as the theme derivation sets it for the seeded Light palette's own background. */
function lightPlateFloor(): number {
  const [l = Number.NaN, c = Number.NaN, h = Number.NaN] = (
    /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/u.exec(SEED_THEME_VALUE_SETS.light.vars["--color-background"]) ?? []
  )
    .slice(1)
    .map(Number);
  return readingPlateAlpha({ l, c, h });
}

/** The surface's weakest ink, `--color-muted-foreground`, against the pixel that lands at its centre over the wallpaper. */
async function landedMutedContrast(page: Page, surface: Locator, label: string, at: (box: Box) => { x: number; y: number } = centre): Promise<number> {
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error(`${label} is not laid out`);
  }
  const point = at(box);
  const landed = await pixel(page, Math.floor(point.x), Math.floor(point.y));
  const ratio = wcagContrastRatio(await tokenInk(surface, "--color-muted-foreground"), landed);
  test.info().annotations.push({ type: "over-art-contrast", description: `${label} ${ratio.toFixed(2)}:1 over ${JSON.stringify(landed)}` });
  return ratio;
}

/** The selected theme for a case: the corpus default for dark, the seeded Light theme for light. */
function themeIdFor(theme: "dark" | "light"): string | undefined {
  return theme === "light" ? lightThemeId : undefined;
}

function computed(locator: Locator, property: string, pseudo: string | null = null): Promise<string> {
  return locator.evaluate((element, [name, at]) => getComputedStyle(element, at).getPropertyValue(name), [property, pseudo] as const);
}

function rootValue(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), property);
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

/** Once the shell has stamped the setting, replace it with the router's pending mark. */
async function handOver(page: Page, reducedMotion: AppearanceSettings["reducedMotion"]): Promise<Locator> {
  await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, reducedMotion);
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

  test("the glass reads the blur-strength number in px", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"], blurStrength: BLUR_STRENGTH });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => carrierBlur(page.locator(LIST))).toContain(`blur(${String(BLUR_STRENGTH)}px)`);
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

    await emulateMedia(page, { contrast: "no-preference", transparency: "reduce" });
    await expect.poll(() => fillAlpha(pane, "::before")).toBe(1);
    await expect.poll(() => carrierBlur(pane)).toBe("none");
    await expect.poll(() => fillAlpha(dialog)).toBe(1);
    await expect.poll(() => computed(dialog, "backdrop-filter", "::before")).toBe("none");
  });

  test("leaves the phone's own pane and reading-surface fills standing", async ({ corpus, mount, page }) => {
    await page.setViewportSize(PHONE);
    await emulateMedia(page, { contrast: "no-preference", transparency: "reduce" });
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels"] });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator("html")).toHaveAttribute(BLUR_SURFACES_ATTR, "panels");
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

    await emulateMedia(page, { contrast: "more", transparency: "no-preference" });
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

      await emulateMedia(page, { contrast: "more", transparency: "no-preference" });
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

      await emulateMedia(page, { contrast: "more", transparency: "no-preference" });
      await expect.poll(() => computed(page.locator(LIST), "border-inline-end-width")).toBe("2px");
      await expect.poll(() => seamRatio(page)).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    });
  }

  test("keeps the raised seam with the glass off", async ({ corpus, mount, page }) => {
    await emulateMedia(page, { contrast: "more", transparency: "no-preference" });
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: [] });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.locator("html")).toHaveAttribute(BLUR_SURFACES_ATTR, "");
    await expect.poll(() => borderWidths(page.locator(LIST))).toBe("0px 2px 0px 0px");
    await expect.poll(() => seamRatio(page)).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  });

  test("yields the alpha to reduced transparency and keeps its border", async ({ corpus, mount, page }) => {
    await emulateMedia(page, { contrast: "more", transparency: "reduce" });
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, { blurSurfaces: ["panels", "modals"] });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    const pane = page.locator(LIST);
    const dialog = page.locator(DIALOG);
    await expect(dialog).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(BLUR_SURFACES_ATTR, "panels modals");
    await expect.poll(() => fillAlpha(pane, "::before")).toBe(1);
    await expect.poll(() => carrierBlur(pane)).toBe("none");
    await expect.poll(() => fillAlpha(dialog)).toBe(1);
    await expect.poll(() => computed(pane, "border-inline-end-width")).toBe("2px");
  });
});

test.describe("the three-way OS preferences", () => {
  // [app mode, the OS asks for the preference, the preference's arm applies]
  const ModeCases = [
    ["system", false, false],
    ["system", true, true],
    ["on", false, true],
    ["off", true, false],
  ] as const satisfies readonly (readonly [OsPreferenceMode, boolean, boolean])[];

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
  });

  for (const [mode, osReduce, solid] of ModeCases) {
    test(`reduced transparency ${mode} with OS reduce=${String(osReduce)} makes the glass solid: ${String(solid)}`, async ({ corpus, mount, page }) => {
      await emulateMedia(page, { contrast: "no-preference", transparency: osReduce ? "reduce" : "no-preference" });
      await routeAppearance(page, corpus, { reducedTransparency: mode, blurSurfaces: ["panels"] });
      await mount<typeof AppShellStory>(STORY, {});
      const pane = page.locator(LIST);
      await expect(pane).toHaveAttribute("data-panel-mode", "docked");
      await expect.poll(async () => (await rootValue(page, "--blur-fill-chrome")) === SOLID_FILL).toBe(solid);
      await expect.poll(async () => (await carrierBlur(pane)) === "none").toBe(solid);
    });
  }

  for (const [mode, osMore, applied] of ModeCases) {
    test(`increased contrast ${mode} with OS more=${String(osMore)} densifies the glass and drops the grain: ${String(applied)}`, async ({
      corpus,
      mount,
      page,
    }) => {
      await emulateMedia(page, { contrast: osMore ? "more" : "no-preference", transparency: "no-preference" });
      await routeAppearance(page, corpus, { increasedContrast: mode, surfaceTexture: "grain" });
      await mount<typeof AppShellStory>(STORY, {});
      const grid = page.locator(".shell-grid");
      await expect(grid).toBeVisible();
      await expect.poll(async () => (await rootValue(page, "--blur-fill-chrome")) === CONTRAST_FILL).toBe(applied);
      await expect.poll(() => computed(grid, "display", "::after")).toBe(applied ? "none" : "block");
    });
  }

  test("with both preferences on, reduced transparency's solid fill wins the glass knob", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedTransparency: "on", increasedContrast: "on" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toBeVisible();
    await expect.poll(() => rootValue(page, "--blur-fill-chrome")).toBe(SOLID_FILL);
  });
});

test.describe("in an open room", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
  });

  test("the glass beats ramp elevation on the composer, each role's bubble and a dialog opened over the room", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { blurSurfaces: ["composer", "messages", "modals"], elevation: "ramp" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: await groupRoomId() });
    await roomReady(page);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "ramp");
    await expect.poll(() => fillAlpha(page.locator(COMPOSER))).toBeLessThan(1);
    await expect.poll(() => computed(page.locator(COMPOSER), "backdrop-filter")).toContain("blur(");
    for (const role of ROOM_ROLES) {
      await expect.poll(() => fillAlpha(bubble(page, role))).toBeLessThan(1);
      await expect.poll(() => computed(bubble(page, role), "backdrop-filter")).toContain("blur(");
    }
    await page.locator(`${LIST} .shell-panel-header`).getByRole("button", { name: "New", exact: true }).click();
    const dialog = page.locator(DIALOG);
    await expect(dialog).toBeVisible();
    await expect.poll(() => fillAlpha(dialog)).toBeLessThan(1);
    await expect.poll(() => computed(dialog, "backdrop-filter", "::before")).toContain("blur(");
  });

  test("a written reading line-height reaches each bubble as a multiple of its own font size", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { readingLineHeight: READING_LINE_HEIGHT });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: await groupRoomId() });
    await roomReady(page);
    for (const role of ROOM_ROLES) {
      const [lineHeight, fontSize] = await Promise.all([computed(bubble(page, role), "line-height"), computed(bubble(page, role), "font-size")]);
      expect(Number.parseFloat(lineHeight)).toBeCloseTo(READING_LINE_HEIGHT * Number.parseFloat(fontSize), 3);
    }
  });

  test("a written letter-spacing resolves against each bubble's own font size, not the root's", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { readingLetterSpacing: READING_LETTER_SPACING, readingBodyScale: READING_BODY_SCALE });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: await groupRoomId() });
    await roomReady(page);
    const rootSize = Number.parseFloat(await computed(page.locator("html"), "font-size"));
    for (const role of ROOM_ROLES) {
      const [spacing, fontSize] = await Promise.all([computed(bubble(page, role), "letter-spacing"), computed(bubble(page, role), "font-size")]);
      expect(Number.parseFloat(fontSize)).not.toBeCloseTo(rootSize, 1);
      expect(Number.parseFloat(spacing)).toBeCloseTo(READING_LETTER_SPACING * Number.parseFloat(fontSize), 2);
    }
  });

  test("the shadow-effects attribute is always written, and its true variant paints a text shadow the false one withholds", async ({ corpus, mount, page }) => {
    let state: { readonly appearance: Partial<AppearanceSettings> } = { appearance: { shadowEffects: false } };
    await routeLiveAppearance(page, corpus, () => state);
    const chatId = await groupRoomId();
    const off = await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
    await roomReady(page);
    await expect(page.locator("html")).toHaveAttribute(SHADOW_EFFECTS_ATTR, "false");
    await expect.poll(() => computed(bubble(page, "assistant"), "text-shadow")).toBe("none");
    await off.unmount();

    state = { appearance: { shadowEffects: true } };
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
    await roomReady(page);
    await expect(page.locator("html")).toHaveAttribute(SHADOW_EFFECTS_ATTR, "true");
    await expect.poll(() => computed(bubble(page, "assistant"), "text-shadow")).not.toBe("none");
  });

  test("reduced transparency turns the composer and each role's bubble solid and stops their blur", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { blurSurfaces: ["composer", "messages"] });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: await groupRoomId() });
    await roomReady(page);
    await expect.poll(() => fillAlpha(page.locator(COMPOSER))).toBeLessThan(1);
    await emulateMedia(page, { contrast: "no-preference", transparency: "reduce" });
    for (const surface of [page.locator(COMPOSER), ...ROOM_ROLES.map((role) => bubble(page, role))]) {
      await expect.poll(() => fillAlpha(surface)).toBe(1);
      await expect.poll(() => computed(surface, "backdrop-filter")).toBe("none");
    }
  });

  test("contrast more thickens the composer's own four sides, mints no border on a bubble, and raises the bubble fill to the dial", async ({
    corpus,
    mount,
    page,
  }) => {
    await routeAppearance(page, corpus, { blurSurfaces: ["composer", "messages"] });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: await groupRoomId() });
    await roomReady(page);
    await expect.poll(() => borderWidths(page.locator(COMPOSER))).toBe("1px 1px 1px 1px");
    await expect.poll(() => fillAlpha(bubble(page, "assistant"))).toBeLessThan(CONTRAST_FILL_ALPHA);
    await emulateMedia(page, { contrast: "more", transparency: "no-preference" });
    await expect.poll(() => borderWidths(page.locator(COMPOSER))).toBe("2px 2px 2px 2px");
    for (const role of ROOM_ROLES) {
      await expect.poll(() => borderWidths(bubble(page, role))).toBe("0px 0px 0px 0px");
      await expect.poll(() => fillAlpha(bubble(page, role))).toBeCloseTo(CONTRAST_FILL_ALPHA, 2);
    }
  });
});

test.describe("grain", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
  });

  test("the shell's grain film paints with no contrast preference and drops for contrast more", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { surfaceTexture: "grain" });
    await mount<typeof AppShellStory>(STORY, {});
    const grid = page.locator(".shell-grid");
    await expect(page.locator("html")).toHaveAttribute(SURFACE_TEXTURE_ATTR, "grain");
    await expect.poll(() => computed(grid, "content", "::after")).not.toBe("none");
    await expect.poll(() => computed(grid, "display", "::after")).not.toBe("none");
    await emulateMedia(page, { contrast: "more" });
    await expect.poll(() => computed(grid, "display", "::after")).toBe("none");
  });

  test("a card inside the shell wears the shell's one film, never a second of its own", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { surfaceTexture: "grain" });
    await mount<typeof AppShellStory>(STORY, {});
    const card = page.locator('.shell-grid [data-slot="card-root"]').first();
    await expect(card).toBeVisible();
    await expect.poll(() => computed(card, "content", "::after")).toBe("none");
    await expect.poll(() => computed(page.locator(".shell-grid"), "content", "::after")).not.toBe("none");
    // The shell's film lands on the card: a flat patch of it is grained with the texture on and flat with it off.
    const box = await card.boundingBox();
    const patches = Array.from({ length: Math.floor(((box?.height ?? 0) - 16) / 10) }, (_, step) => ({
      x: Math.round(box?.x ?? 0) + 3,
      y: Math.round(box?.y ?? 0) + 4 + step * 10,
      width: 16,
      height: 8,
    }));
    const filmed = await Promise.all(patches.map((patch) => noiseSpread(page, patch)));
    await page.locator("html").evaluate((element, name) => element.setAttribute(name, "none"), SURFACE_TEXTURE_ATTR);
    const bare = await Promise.all(patches.map((patch) => noiseSpread(page, patch)));
    const flattest = bare.indexOf(Math.min(...bare));
    expect(bare[flattest]).toBeLessThan(filmed[flattest] ?? 0);
  });

  test("with the texture off neither the shell nor a card paints a film", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { surfaceTexture: "none" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator('.shell-grid [data-slot="card-root"]').first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(SURFACE_TEXTURE_ATTR, "none");
    await expect.poll(() => computed(page.locator(".shell-grid"), "content", "::after")).toBe("none");
    await expect.poll(() => computed(page.locator('.shell-grid [data-slot="card-root"]').first(), "content", "::after")).toBe("none");
  });
});

test.describe("over a wallpaper", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
  });

  for (const art of [true, false]) {
    test(`on Chats with ramp elevation ${art ? "the wallpaper takes .shell-main's fill and the topbar keeps its own" : "and no wallpaper .shell-main keeps its fill"}`, async ({
      corpus,
      mount,
      page,
    }) => {
      await seedShellState(page, { activeSection: "chats" });
      await routeAppearance(page, corpus, { elevation: "ramp", blurSurfaces: [], ...(art ? wallpaper(corpus) : {}) });
      await mount<typeof AppShellStory>(STORY, {});
      const grid = page.locator(".shell-grid");
      await expect(grid).toHaveAttribute("data-elevation", "ramp");
      await expect(grid).toHaveAttribute("data-section", "chats");
      await expect.poll(() => grid.getAttribute("data-has-bg-image")).toBe(art ? "true" : null);
      await expect.poll(() => fillAlpha(page.locator(".shell-main"))).toBe(art ? 0 : 1);
      await expect.poll(() => fillAlpha(page.locator(".shell-topbar"))).toBe(1);
    });
  }

  test("Chats stays immersive and its landing copy sits in a frosted chip, which another section and a bare Chats do not get", async ({
    corpus,
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, wallpaper(corpus));
    await mount<typeof AppShellStory>(STORY, {});
    const hero = page.locator('.shell-content [data-slot="empty-state-root"]').first();
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect(hero).toBeVisible();
    await expect.poll(() => fillAlpha(page.locator(".shell-main"))).toBe(0);
    await expect.poll(() => fillAlpha(hero)).toBeGreaterThan(0);
    await expect.poll(() => fillAlpha(hero)).toBeLessThan(1);
    await expect.poll(() => computed(hero, "backdrop-filter")).toContain("blur(");
    await page.locator(".shell-rail").getByRole("button", { name: "Presets", exact: true }).click();
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "presets");
    await expect(hero).toBeVisible();
    await expect.poll(() => fillAlpha(hero)).toBe(0);
  });

  test("with no wallpaper the Chats landing copy is not chipped", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeAppearance(page, corpus, {});
    await mount<typeof AppShellStory>(STORY, {});
    const hero = page.locator('.shell-content [data-slot="empty-state-root"]').first();
    await expect(hero).toBeVisible();
    await expect.poll(() => fillAlpha(hero)).toBe(0);
  });

  test("with the glass off another section backs its reading surface solid", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await routeAppearance(page, corpus, { ...wallpaper(corpus), blurSurfaces: [] });
    await mount<typeof AppShellStory>(STORY, {});
    const main = page.locator(".shell-main");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect.poll(() => fillAlpha(main)).toBe(1);
  });

  test("with the panel glass on, another section's reading surface is glass on its carrier and the surface itself is never promoted", async ({
    corpus,
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "characters" });
    await routeAppearance(page, corpus, { ...wallpaper(corpus), blurSurfaces: ["panels"] });
    await mount<typeof AppShellStory>(STORY, {});
    const main = page.locator(".shell-main");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect.poll(() => fillAlpha(main, "::before")).toBeLessThan(1);
    await expect.poll(() => fillAlpha(main, "::before")).toBeGreaterThan(0);
    await expect.poll(() => computed(main, "backdrop-filter", "::before")).toContain("blur(");
    await expect.poll(() => fillAlpha(main)).toBe(0);
    const promotion = await main.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdrop: style.backdropFilter,
        threeD: style.transformStyle === "preserve-3d" || style.transform.startsWith("matrix3d"),
        willChange: style.willChange,
      };
    });
    expect(promotion).toStrictEqual({ backdrop: "none", threeD: false, willChange: "auto" });
    await emulateMedia(page, { transparency: "reduce" });
    await expect.poll(() => fillAlpha(main, "::before")).toBe(1);
    await expect.poll(() => computed(main, "backdrop-filter", "::before")).toBe("none");
  });

  test("a solo room's own wallpaper paints while its room is on screen and is gone in another section", async ({ corpus, mount, page }) => {
    await using carried = await createCorpusHarness();
    const caller = await carried.internalCallerFor(carried.ownerId);
    const entry = wallpaper(corpus);
    let soloId: ChatId | undefined;
    for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
      const detail = await caller.chat.getChat({ chatId: row.id });
      const humans = detail.participants.filter((participant) => participant.kind === "human").length;
      const characters = detail.participants.filter((participant) => participant.kind === "character").length;
      soloId ??= humans === 1 && characters === 1 ? row.id : undefined;
    }
    if (soloId === undefined) {
      throw new Error("The corpus has no solo room");
    }
    await caller.chat.setChatBackground({
      chatId: soloId,
      background: {
        kind: "asset",
        externalUrl: "",
        provenanceUrl: "",
        assetId: entry.backgroundAssetId ?? "",
        assetHash: entry.backgroundAssetHash ?? "",
        mime: entry.backgroundAssetMime ?? "",
      },
    });
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus),
      ...serveCorpusProcedures(caller, SERVED),
      "settings.getUserSettings": () => appearanceSettings(corpus, {}),
    });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: soloId });
    const layer = page.locator('[data-slot="theme-background-layer"]');
    await expect(page.locator(COMPOSER)).toBeVisible();
    await expect(layer).toBeVisible();
    await page.locator(".shell-rail").getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
    await expect(layer).toHaveCount(0);
    await page.locator(".shell-rail").getByRole("button", { name: "Chats", exact: true }).click();
    await expect(layer).toBeVisible();
  });
});

test.describe("the light arm's plate over a wallpaper", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
  });

  test("a light pane's glass takes the reading plate's floor over a wallpaper, while a dark pane's glass is the same with or without one", async ({
    corpus,
    mount,
    page,
  }) => {
    let state: { readonly appearance: Partial<AppearanceSettings>; readonly selectedThemeId?: string | undefined } = {
      appearance: { ...wallpaper(corpus), blurSurfaces: ["panels"] },
      selectedThemeId: lightThemeId,
    };
    await seedShellState(page, { activeSection: "chats" });
    await routeLiveAppearance(page, corpus, () => state);
    const pane = page.locator(LIST);
    const light = await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect.poll(async () => fillAlpha(pane, "::before")).toBeGreaterThanOrEqual(lightPlateFloor());
    expect(await landedMutedContrast(page, pane, "light pane")).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    await light.unmount();

    state = { appearance: { ...wallpaper(corpus), blurSurfaces: ["panels"] } };
    const overArt = await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect.poll(() => fillAlpha(pane, "::before")).toBeLessThan(1);
    const darkOverArt = await computed(pane, "background-color", "::before");
    await overArt.unmount();

    state = { appearance: { blurSurfaces: ["panels"] } };
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toBeVisible();
    await expect.poll(() => page.locator(".shell-grid").getAttribute("data-has-bg-image")).toBeNull();
    await expect.poll(() => computed(pane, "background-color", "::before")).toBe(darkOverArt);
  });

  test("another section's light reading surface takes the plate's floor and clears AA on its weakest ink over a wallpaper", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await routeAppearance(page, corpus, { ...wallpaper(corpus), blurSurfaces: ["panels"] }, lightThemeId);
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect.poll(() => fillAlpha(page.locator(".shell-main"), "::before")).toBeGreaterThanOrEqual(lightPlateFloor());
    expect(await landedMutedContrast(page, page.locator(".shell-main"), "light reading surface")).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  });

  test("a light dialog takes the plated fill with or without a wallpaper and clears AA over one, while a dark dialog stays glass and does not move", async ({
    corpus,
    mount,
    page,
  }) => {
    let state: { readonly appearance: Partial<AppearanceSettings>; readonly selectedThemeId?: string | undefined } = {
      appearance: { ...wallpaper(corpus), blurSurfaces: ["modals"] },
      selectedThemeId: lightThemeId,
    };
    await seedShellState(page, { activeSection: "chats" });
    await routeLiveAppearance(page, corpus, () => state);
    const dialog = page.locator(DIALOG);
    const reads: Record<string, string> = {};
    for (const arm of [
      { name: "lightArt", appearance: { ...wallpaper(corpus), blurSurfaces: ["modals"] }, selectedThemeId: lightThemeId },
      { name: "lightPlain", appearance: { blurSurfaces: ["modals"] }, selectedThemeId: lightThemeId },
      { name: "darkArt", appearance: { ...wallpaper(corpus), blurSurfaces: ["modals"] }, selectedThemeId: undefined },
      { name: "darkPlain", appearance: { blurSurfaces: ["modals"] }, selectedThemeId: undefined },
    ] satisfies readonly { name: string; appearance: Partial<AppearanceSettings>; selectedThemeId: string | undefined }[]) {
      state = arm;
      const mounted = await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
      await expect(dialog).toBeVisible();
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(arm.selectedThemeId === undefined ? null : "light");
      await expect.poll(() => fillAlpha(dialog)).toBeGreaterThan(0);
      reads[arm.name] = await computed(dialog, "background-color");
      reads[`${arm.name}Contrast`] = String(arm.name === "lightArt" ? await landedMutedContrast(page, dialog, "light dialog") : 0);
      await mounted.unmount();
    }
    test.info().annotations.push({ type: "dialog-fills", description: JSON.stringify(reads) });
    expect(Number(reads["lightArtContrast"])).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    expect(reads["lightPlain"]).toBe(reads["lightArt"]);
    expect(alphaOf(reads["lightPlain"] ?? "")).toBeGreaterThanOrEqual(lightPlateFloor());
    expect(reads["darkArt"]).toBe(reads["darkPlain"]);
    expect(alphaOf(reads["darkPlain"] ?? "")).toBeLessThan(1);
  });

  test("in a room over a wallpaper the light composer and bubbles clear AA on their weakest ink, and the dark ones are the same as with no wallpaper", async ({
    corpus,
    mount,
    page,
  }) => {
    let state: { readonly appearance: Partial<AppearanceSettings>; readonly selectedThemeId?: string | undefined } = {
      appearance: {},
    };
    await seedShellState(page, { activeSection: "chats" });
    await routeLiveAppearance(page, corpus, () => state);
    const chatId = await groupRoomId();
    const surfaces = [page.locator(COMPOSER), ...ROOM_ROLES.map((role) => bubble(page, role))];
    const fills: Record<string, string[]> = {};
    for (const arm of [
      { name: "light", appearance: { ...wallpaper(corpus), blurSurfaces: ["composer", "messages"] }, selectedThemeId: lightThemeId },
      { name: "darkArt", appearance: { ...wallpaper(corpus), blurSurfaces: ["composer", "messages"] }, selectedThemeId: undefined },
      { name: "darkPlain", appearance: { blurSurfaces: ["composer", "messages"] }, selectedThemeId: undefined },
    ] satisfies readonly { name: string; appearance: Partial<AppearanceSettings>; selectedThemeId: string | undefined }[]) {
      state = arm;
      const mounted = await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      await roomReady(page);
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(arm.selectedThemeId === undefined ? null : "light");
      await expect.poll(() => fillAlpha(page.locator(COMPOSER))).toBeLessThan(1);
      fills[arm.name] = await Promise.all(surfaces.map((surface) => computed(surface, "background-color")));
      const ratios =
        arm.name === "light" ? await Promise.all(surfaces.map((surface, index) => landedMutedContrast(page, surface, `light ${String(index)}`))) : [];
      expect(ratios.filter((ratio) => ratio < AA_NORMAL_RATIO)).toStrictEqual([]);
      await mounted.unmount();
    }
    expect(fills["darkArt"]).toStrictEqual(fills["darkPlain"]);
    // The light arm's glass mixes over the derived plate, so no light surface is thinner than the plate itself.
    expect((fills["light"] ?? []).map(alphaOf).filter((alpha) => alpha < lightPlateFloor())).toStrictEqual([]);
  });
});

test.describe("the light arm over the darkest wallpaper a viewer can save", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
  });

  test("the pane and another section's reading surface clear AA on their weakest ink over pure black at the least dim", async ({ corpus, mount, page }) => {
    await using art = await blackArtRoot(page);
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus),
      ...serveCorpusProcedures(await art.internalCallerFor(art.ownerId), [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]),
    });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    await expect(page.locator('[data-slot="theme-background-layer"]')).toBeVisible();
    const plateFloor = lightPlateFloor();
    // The rendered plate is the derived one, and the pane's glass sits over it rather than over the art.
    expect(alphaOf((await computed(page.locator(LIST), "--color-reading-plate")).trim())).toBeGreaterThanOrEqual(plateFloor);
    await expect.poll(() => fillAlpha(page.locator(LIST), "::before")).toBeGreaterThanOrEqual(plateFloor);
    // The pane's right gutter, beside its rows, where only the glass lands.
    expect(
      await landedMutedContrast(page, page.locator(LIST), "pane over black", (box) => ({ x: box.x + box.width - 6, y: box.y + box.height / 2 })),
    ).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    await page.locator(".shell-rail").getByRole("button", { name: "Characters", exact: true }).click();
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "characters");
    await expect.poll(() => fillAlpha(page.locator(".shell-main"), "::before")).toBeGreaterThanOrEqual(plateFloor);
    // The reading surface's far corner, past the landing's content.
    expect(
      await landedMutedContrast(page, page.locator(".shell-main"), "reading surface over black", (box) => ({
        x: box.x + box.width - 10,
        y: box.y + box.height - 10,
      })),
    ).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  });

  test("in a room the composer and each role's bubble clear AA on their weakest ink over pure black at the least dim", async ({ corpus, mount, page }) => {
    await using art = await blackArtRoot(page);
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus),
      ...serveCorpusProcedures(await art.internalCallerFor(art.ownerId), [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]),
    });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: await groupRoomId() });
    await roomReady(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator('[data-slot="theme-background-layer"]')).toBeVisible();
    const plateFloor = lightPlateFloor();
    expect(alphaOf((await computed(page.locator(COMPOSER), "--color-reading-plate")).trim())).toBeGreaterThanOrEqual(plateFloor);
    for (const surface of [page.locator(COMPOSER), ...ROOM_ROLES.map((role) => bubble(page, role))]) {
      await expect.poll(() => fillAlpha(surface)).toBeGreaterThanOrEqual(plateFloor);
    }
    // Each surface's own padding, clear of its text and controls.
    const ratios = [
      await landedMutedContrast(page, page.locator(COMPOSER), "composer over black", (box) => ({ x: box.x + box.width / 2, y: box.y + 3 })),
      ...(await Promise.all(
        ROOM_ROLES.map((role) =>
          landedMutedContrast(page, bubble(page, role), `${role} bubble over black`, (box) => ({ x: box.x + 4, y: box.y + box.height / 2 })),
        ),
      )),
    ];
    expect(ratios.filter((ratio) => ratio < AA_NORMAL_RATIO)).toStrictEqual([]);
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

  test("the colorization variant on the root redeclares the root's border token", async ({ corpus, mount, page }) => {
    let state: { readonly appearance: Partial<AppearanceSettings> } = { appearance: { enableThemeColorization: false } };
    await routeLiveAppearance(page, corpus, () => state);
    const plain = await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toBeVisible();
    const uncolored = await rootValue(page, "--color-border");
    await plain.unmount();

    state = { appearance: { enableThemeColorization: true } };
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toBeVisible();
    await expect.poll(() => rootValue(page, "--color-border")).not.toBe(uncolored);
  });

  test("the font-scale dial sets the document's root font size", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { fontScale: 1.25 });
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => computed(page.locator("html"), "font-size")).toBe(`${UA_ROOT_PX * 1.25}px`);
  });

  test("the app's reduced-motion setting floors an animation outside the shell grid as well as inside it", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedMotion: "on" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => shimmerMs(page, ".shell-grid")).toBeLessThan(FLOORED_MS);
    await expect.poll(() => shimmerMs(page, "body")).toBeLessThan(FLOORED_MS);
    await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, "on");
  });
});

test.describe("handover to the pending mark", () => {
  test("the pending mark that replaces the shell keeps the app's reduced-motion flag, and its shimmer stops", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedMotion: "on" });
    await mount<typeof ShellToPendingStory>(HANDOVER, {});
    const splash = await handOver(page, "on");
    await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, "on");
    await expect.poll(() => glyphDurationMs(splash)).toBeLessThan(FLOORED_MS);
  });

  test("with the app's reduced motion off the pending mark keeps the off setting, and its shimmer runs", async ({ corpus, mount, page }) => {
    await routeAppearance(page, corpus, { reducedMotion: "off" });
    await mount<typeof ShellToPendingStory>(HANDOVER, {});
    const splash = await handOver(page, "off");
    await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, "off");
    await expect.poll(() => glyphDurationMs(splash)).toBe(await breatheTokenMs(page));
  });
});
