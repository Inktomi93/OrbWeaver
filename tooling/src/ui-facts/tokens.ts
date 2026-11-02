// The length tokens, indexed by pixel value, so a literal can be answered "a token already holds this" or "none does".
import { readFileSync } from "node:fs";
import { join } from "node:path";

const THEME = "packages/ui/src/styles/theme.css";
const ROOT_PX = 16;
const TAILWIND_STEP_PX = 4;
const NAMESPACES = ["spacing", "size", "radius", "width", "border-width"] as const;
export type TokenNamespace = (typeof NAMESPACES)[number];

export interface LengthTokens {
  /** Pixel value to the custom properties that hold it, per namespace. */
  readonly byPx: ReadonlyMap<number, readonly string[]>;
}

/** The first px or rem length in a token value, in pixels; `round(up, 0.25rem, 1px)` reads as its first argument. */
export function pxOf(value: string): number | null {
  const match = /(?<![\d.])(-?\d*\.?\d+)\s*(px|rem|em)\b/u.exec(value);
  if (match?.[1] === undefined) {
    return null;
  }
  const amount = Number(match[1]);
  return match[2] === "px" ? amount : amount * ROOT_PX;
}

export function loadLengthTokens(root: string): LengthTokens {
  const css = readFileSync(join(root, THEME), "utf8");
  const byPx = new Map<number, string[]>();
  for (const match of css.matchAll(/^[ \t]*(--(?:spacing|size|radius|width|border-width)-[a-z0-9-]+):\s*([^;]+);/gmu)) {
    const [, name, value] = match;
    const px = value === undefined ? null : pxOf(value);
    if (name !== undefined && px !== null && px > 0) {
      byPx.set(px, [...(byPx.get(px) ?? []), name]);
    }
  }
  return { byPx };
}

/** The tokens that hold a pixel value, optionally narrowed to the namespaces a property can read. */
export function tokensFor(tokens: LengthTokens, px: number, namespaces?: readonly TokenNamespace[]): readonly string[] {
  const found = tokens.byPx.get(px) ?? [];
  return namespaces === undefined ? found : found.filter((name) => namespaces.some((space) => name.startsWith(`--${space}-`)));
}

export function tailwindStepPx(step: string): number | null {
  if (step === "px") {
    return 1;
  }
  const amount = Number(step);
  return Number.isFinite(amount) ? amount * TAILWIND_STEP_PX : null;
}
