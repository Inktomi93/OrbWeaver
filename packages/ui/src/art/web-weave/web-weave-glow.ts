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

/** Bake each glow shape once; the returned painter preserves round caps while stretching its middle. */
export function bakeWeaveGlow(document: Document, color: string): WeaveGlowPainter {
  const sprites = {
    capture: bakeStroke(document, color, WEAVE_GLOW_STYLES.capture),
    glint: bakeStroke(document, color, WEAVE_GLOW_STYLES.glint),
    strandOut: bakeStroke(document, color, WEAVE_GLOW_STYLES.strandOut),
    softGlint: bakeStroke(document, color, WEAVE_GLOW_STYLES.softGlint),
    softStrandOut: bakeStroke(document, color, WEAVE_GLOW_STYLES.softStrandOut),
  };
  return (ctx, kind, start, end): void => {
    const sprite = sprites[kind];
    const style = WEAVE_GLOW_STYLES[kind];
    const pad = strokePadding(style);
    const cap = pad * SPRITE_SCALE;
    const core = CORE_LENGTH * SPRITE_SCALE;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    ctx.save();
    ctx.globalAlpha *= style.opacity;
    ctx.translate(start.x, start.y);
    ctx.rotate(Math.atan2(end.y - start.y, end.x - start.x));
    ctx.drawImage(sprite, 0, 0, cap, sprite.height, -pad, -pad, pad, pad * 2);
    ctx.drawImage(sprite, cap, 0, core, sprite.height, 0, -pad, length, pad * 2);
    ctx.drawImage(sprite, cap + core, 0, cap, sprite.height, length, -pad, pad, pad * 2);
    ctx.restore();
  };
}
