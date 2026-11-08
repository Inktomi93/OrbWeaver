// The over-art contrast read. A surface pixel counts as "over art" only when the wallpaper layer decoded and painted:
// a layer that never paints leaves the light page under the glass, and a light pixel passes every contrast floor.
// `paintedArt` is the only way to mint the witness `landedMutedContrast` requires.

import type { Rgb } from "@orb/kit/theme-derivation";
import { wcagContrastRatio } from "@orb/kit/theme-derivation";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { pixel } from "./shell-drive.ts";

const PAINTED = Symbol("paintedArt");

/** Proof that a wallpaper layer decoded its image and painted it; only {@link paintedArt} returns one. */
interface PaintedArt {
  readonly [PAINTED]: true;
  /** The art's own pixel at the layer's centre, with nothing over it. */
  readonly bare: Rgb;
}

/** Above any stacking context the shell or a dialog opens, so the layer's own pixels reach the framebuffer. */
const LIFTED_Z_INDEX = "2147483647";
/** The brightest channel a pixel may have to read as dark art: pure black decodes to zero, and encoding noise stays under it. */
const DARK_CHANNEL_MAX = 24;

type Vantage = "art" | "beneath";

/** The layer's centre pixel with the layer lifted above everything, or hidden to read what lies beneath it. */
async function layerPixel(layer: Locator, vantage: Vantage): Promise<Rgb> {
  const box = await layer.boundingBox();
  if (box === null) {
    throw new Error("the wallpaper layer is not laid out");
  }
  const restore = await layer.evaluate(
    (element, [zIndex, hide]) => {
      const held = { visibility: element.style.visibility, zIndex: element.style.zIndex };
      element.style.zIndex = zIndex;
      element.style.visibility = hide ? "hidden" : "";
      return held;
    },
    [LIFTED_Z_INDEX, vantage === "beneath"] as const,
  );
  try {
    return await pixel(layer.page(), Math.floor(box.x + box.width / 2), Math.floor(box.y + box.height / 2));
  } finally {
    await layer.evaluate((element, held) => {
      element.style.zIndex = held.zIndex;
      element.style.visibility = held.visibility;
    }, restore);
  }
}

function sameColour(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

/**
 * Wait for the layer's computed image to decode and paint, then return the witness. The pixel is read with the layer
 * lifted above the shell and compared with the page beneath it, so an art that never painted cannot pass; `dark`
 * also requires the art itself to read dark.
 */
export async function paintedArt(layer: Locator, expected: { readonly dark: boolean }): Promise<PaintedArt> {
  const url = await layer.evaluate((element) => /url\("?([^")]+)"?\)/u.exec(getComputedStyle(element).backgroundImage)?.[1] ?? null);
  if (url === null) {
    throw new Error("the wallpaper layer paints no background image");
  }
  const image = await layer.page().evaluateHandle((source) => {
    const decoded = new Image();
    decoded.src = source;
    return decoded;
  }, url);
  try {
    await expect.poll(() => image.evaluate((decoded) => decoded.complete), { message: `the wallpaper ${url} never finished loading` }).toBe(true);
    // A broken or empty body rejects here, which is the failure a served 404 must raise.
    await image.evaluate((decoded) => decoded.decode());
  } finally {
    await image.dispose();
  }
  const state = async (): Promise<string> => {
    // One after the other: both reads move the same layer's inline style.
    const art = await layerPixel(layer, "art");
    const beneath = await layerPixel(layer, "beneath");
    if (sameColour(art, beneath)) {
      return `the layer left the page beneath it unchanged at ${JSON.stringify(art)}`;
    }
    return expected.dark && Math.max(art.r, art.g, art.b) > DARK_CHANNEL_MAX ? `the art reads ${JSON.stringify(art)}, not dark` : "painted";
  };
  await expect.poll(state, { message: "the wallpaper decoded but did not paint" }).toBe("painted");
  return { [PAINTED]: true, bare: await layerPixel(layer, "art") };
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

/** The surface's weakest ink, `--color-muted-foreground`, against the pixel that lands at `at` of its box over the painted art. */
export async function landedMutedContrast(
  surface: Locator,
  art: PaintedArt,
  label: string,
  at: (box: Box) => { x: number; y: number } = centre,
): Promise<number> {
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error(`${label} is not laid out`);
  }
  const point = at(box);
  const landed = await pixel(surface.page(), Math.floor(point.x), Math.floor(point.y));
  const ratio = wcagContrastRatio(await tokenInk(surface, TOKENS["color.muted-foreground"].cssVar), landed);
  test.info().annotations.push({
    type: "over-art-contrast",
    description: `${label} ${ratio.toFixed(2)}:1 over ${JSON.stringify(landed)} on art ${JSON.stringify(art.bare)}`,
  });
  return ratio;
}
