// Blur is rasterized when the palette changes. Moving silk only transforms and composites the sprites.
import type { WeavePoint } from "./web-weave-geometry.ts";
import { WIDTH_CAPTURE } from "./web-weave-geometry.ts";

export const WEAVE_GLOW_STYLES = {
  capture: { width: WIDTH_CAPTURE, blur: 3, opacity: 1 },
  glint: { width: 1.1, blur: 6, opacity: 1 },
  strandOut: { width: 1.5, blur: 7, opacity: 1 },
  softGlint: { width: 2.86, blur: 0, opacity: 0.5 },
  softStrandOut: { width: 3.6, blur: 0, opacity: 0.5 },
} as const;

export type WeaveGlowPainter = (ctx: CanvasRenderingContext2D, kind: keyof typeof WEAVE_GLOW_STYLES, start: WeavePoint, end: WeavePoint) => void;

const SPRITE_SCALE = 2;
const CORE_LENGTH = 16;
const BLUR_PADDING = 3;
// Halo bins move only the blurred endpoint; crisp strand and physics coordinates stay exact.
const CAPTURE_LENGTH_STEPS = 16;
const CAPTURE_MAX_SPAN = 144;
const MEBIBYTE = 1_048_576;
const CAPTURE_CACHE_BYTES = 24 * MEBIBYTE;
const PIXEL_BYTES = 4;

function strokePadding(style: { readonly width: number; readonly blur: number }): number {
  return Math.ceil(Math.max(style.blur * BLUR_PADDING, style.width));
}

function bakeStroke(document: Document, color: string, style: { readonly width: number; readonly blur: number }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const pad = strokePadding(style);
  canvas.width = (CORE_LENGTH + pad * 2) * SPRITE_SCALE;
  canvas.height = pad * 2 * SPRITE_SCALE;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("WebWeave: no canvas context for glow sprites");
  }
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.strokeStyle = color;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = style.blur * SPRITE_SCALE;
  // Keep the source stroke outside the bitmap so a blurred sprite does not brighten the crisp silk twice.
  const lineY = style.blur > 0 ? -pad : pad;
  ctx.shadowOffsetY = style.blur > 0 ? pad * 2 * SPRITE_SCALE : 0;
  ctx.beginPath();
  ctx.moveTo(pad, lineY);
  ctx.lineTo(pad + CORE_LENGTH, lineY);
  ctx.stroke();
  return canvas;
}

function drawSlices(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, length: number, pad: number): void {
  const cap = pad * SPRITE_SCALE;
  const core = CORE_LENGTH * SPRITE_SCALE;
  ctx.drawImage(sprite, 0, 0, cap, sprite.height, -pad, -pad, pad, pad * 2);
  ctx.drawImage(sprite, cap, 0, core, sprite.height, 0, -pad, length, pad * 2);
  ctx.drawImage(sprite, cap + core, 0, cap, sprite.height, length, -pad, pad, pad * 2);
}

function captureSprites(document: Document, source: HTMLCanvasElement): (length: number) => HTMLCanvasElement | null {
  const cache = new Map<number, HTMLCanvasElement>();
  const pad = strokePadding(WEAVE_GLOW_STYLES.capture);
  let bytes = 0;
  return (length): HTMLCanvasElement | null => {
    if (length > CAPTURE_MAX_SPAN) {
      return null;
    }
    const key = Math.round(length * CAPTURE_LENGTH_STEPS);
    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const quantized = key / CAPTURE_LENGTH_STEPS;
    const width = Math.ceil((quantized + pad * 2) * SPRITE_SCALE);
    const nextBytes = width * source.height * PIXEL_BYTES;
    for (const [oldKey, old] of cache) {
      if (bytes + nextBytes <= CAPTURE_CACHE_BYTES) {
        break;
      }
      cache.delete(oldKey);
      bytes -= old.width * old.height * PIXEL_BYTES;
    }
    const assembled = document.createElement("canvas");
    assembled.width = width;
    assembled.height = source.height;
    const ctx = assembled.getContext("2d");
    if (ctx === null) {
      throw new Error("WebWeave: no canvas context for assembled capture glow");
    }
    ctx.setTransform(SPRITE_SCALE, 0, 0, SPRITE_SCALE, pad * SPRITE_SCALE, pad * SPRITE_SCALE);
    drawSlices(ctx, source, quantized, pad);
    cache.set(key, assembled);
    bytes += nextBytes;
    return assembled;
  };
}

/** Bake palette-owned glow; capture sprites retain round caps within a bounded raster cache. */
export function bakeWeaveGlow(document: Document, color: string): WeaveGlowPainter {
  const sprites = {
    capture: bakeStroke(document, color, WEAVE_GLOW_STYLES.capture),
    glint: bakeStroke(document, color, WEAVE_GLOW_STYLES.glint),
    strandOut: bakeStroke(document, color, WEAVE_GLOW_STYLES.strandOut),
    softGlint: bakeStroke(document, color, WEAVE_GLOW_STYLES.softGlint),
    softStrandOut: bakeStroke(document, color, WEAVE_GLOW_STYLES.softStrandOut),
  };
  const capture = captureSprites(document, sprites.capture);
  return (ctx, kind, start, end): void => {
    const sprite = sprites[kind];
    const style = WEAVE_GLOW_STYLES[kind];
    const pad = strokePadding(style);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    ctx.save();
    ctx.globalAlpha *= style.opacity;
    ctx.translate(start.x, start.y);
    ctx.rotate(Math.atan2(end.y - start.y, end.x - start.x));
    const assembled = kind === "capture" ? capture(length) : null;
    if (assembled === null) {
      drawSlices(ctx, sprite, length, pad);
    } else {
      ctx.drawImage(assembled, -pad, -pad, assembled.width / SPRITE_SCALE, assembled.height / SPRITE_SCALE);
    }
    ctx.restore();
  };
}
