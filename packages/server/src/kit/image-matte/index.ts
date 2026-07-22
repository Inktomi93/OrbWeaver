// @orb/server/kit/image-matte — the pure corner-flood matte core (expressions-design/03 §4.2). Node-only-pure
// (no I/O, no sharp, no domain): raw RGBA bytes in → raw RGBA bytes out with contiguous background pixels
// driven to alpha-0. The sharp decode/encode that feeds it lives in `infra/image` (`matteFlood`); this is the
// deterministic, weightless flood-fill so the zero-setup matte arm works on a deploy with no local-light.
//
// The heuristic (marinara's `tryRemoveBackgroundWithBackgroundRemover` corner-flood, modernized): sample the
// four corner colors, then flood-fill from each corner marking every 4-connected pixel whose per-channel
// distance from THAT corner's color is within `tolerance` — those become transparent. A pixel is compared to
// its seed corner (not its neighbour), so an anti-aliased `#DDDDDD` edge within tolerance mattes cleanly while
// the subject (outside tolerance from every corner) is untouched.

/** RGBA byte layout: 4 bytes per pixel, channel offsets R/G/B/A. */
const RGBA_STRIDE = 4;
const R = 0;
const G = 1;
const B = 2;
const A = 3;

/** Options for {@link floodMatte}. Dimensions describe the row-major RGBA buffer (4 bytes/pixel). */
export interface FloodMatteOptions {
  readonly width: number;
  readonly height: number;
  /** Per-channel absolute-difference ceiling (0–255) from a sampled corner color: `diff ≤ tolerance` on
   *  every channel ⇒ the pixel is background. `24` is the §3.3 default (tuned at the E4 checkpoint). */
  readonly tolerance: number;
}

/** The per-flood working state — the source bytes, the output alpha buffer, the shared visited mask (a pixel
 *  is scored once across all four corner floods), and the geometry + tolerance. */
interface FloodContext {
  readonly rgba: Uint8Array;
  readonly out: Uint8Array;
  readonly visited: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly tolerance: number;
}

/** One sampled RGB seed color (the corner a flood started from). */
interface SeedColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Read pixel `p`'s RGB seed color from the source bytes. */
function seedAt(rgba: Uint8Array, p: number): SeedColor {
  const pi = p * RGBA_STRIDE;
  return { r: rgba[pi + R] ?? 0, g: rgba[pi + G] ?? 0, b: rgba[pi + B] ?? 0 };
}

/** `true` iff pixel `p`'s per-channel distance from `seed` is within tolerance. */
function isBackground(ctx: FloodContext, p: number, seed: SeedColor): boolean {
  const pi = p * RGBA_STRIDE;
  const dr = Math.abs((ctx.rgba[pi + R] ?? 0) - seed.r);
  const dg = Math.abs((ctx.rgba[pi + G] ?? 0) - seed.g);
  const db = Math.abs((ctx.rgba[pi + B] ?? 0) - seed.b);
  return dr <= ctx.tolerance && dg <= ctx.tolerance && db <= ctx.tolerance;
}

/** Push the 4-connected in-bounds neighbours of `p` onto `stack`. */
function pushNeighbours(stack: number[], p: number, width: number, height: number): void {
  const x = p % width;
  const y = (p - x) / width;
  if (x > 0) {
    stack.push(p - 1);
  }
  if (x < width - 1) {
    stack.push(p + 1);
  }
  if (y > 0) {
    stack.push(p - width);
  }
  if (y < height - 1) {
    stack.push(p + width);
  }
}

/** Flood-fill one seed corner, zeroing the alpha of every reachable background pixel in `ctx.out`. */
function floodFromCorner(ctx: FloodContext, seed: number): void {
  const seedColor = seedAt(ctx.rgba, seed);
  const stack: number[] = [seed];
  while (stack.length > 0) {
    const p = stack.pop();
    if (p === undefined || ctx.visited[p] === 1) {
      continue;
    }
    ctx.visited[p] = 1;
    if (!isBackground(ctx, p, seedColor)) {
      continue;
    }
    ctx.out[p * RGBA_STRIDE + A] = 0;
    pushNeighbours(stack, p, ctx.width, ctx.height);
  }
}

/** Zero the alpha of every background pixel (4-connected corner flood), returning a NEW RGBA buffer — the
 *  input is never mutated. A zero-area image returns an empty-cloned buffer unchanged. */
export function floodMatte(rgba: Uint8Array, opts: FloodMatteOptions): Uint8Array {
  const { width, height, tolerance } = opts;
  const out = new Uint8Array(rgba);
  const total = width * height;
  if (total <= 0) {
    return out;
  }
  const ctx: FloodContext = { rgba, out, visited: new Uint8Array(total), width, height, tolerance };
  for (const seed of [0, width - 1, (height - 1) * width, total - 1]) {
    floodFromCorner(ctx, seed);
  }
  return out;
}
