// Pixel-sampled backdrops (issue #218).
//
// THE WALKER CANNOT SEE WHAT IS NOT AN ANCESTOR. Its resolveBackdrop says "unresolved" instead of
// fabricating one (a 0.65-alpha reading plate resolved against the near-black BODY base — past the fixed
// wallpaper photo painting over it — and reported 3.16:1 on 28 transcript nodes where the real composite
// is 4.94:1). Only PIXELS can answer that, so the runner settles each unresolved sample here, from ONE
// viewport screenshot taken at the same scroll position the samples were read at: a per-element clip shot
// (snap's shape, for its single target) would be one screenshot per text node.
//
// `scale: "css"` keeps image pixels 1:1 with CSS pixels under --mobile's DPR3, so a walker box indexes the
// buffer directly. A shot/decode that fails, or a ring that is not one backdrop, gets NO VERDICT — the
// refusal is printed and written to the report, never a fabricated color (the #211 posture).
//
// A TEXT THE FRAME DOES NOT PAINT IS NOT JUDGED IN IT. Off the screenshot, clipped wholly out of its own
// scroller, or hidden at every probe by a cover that paints opaque, the text owns none of the pixels its box
// reaches. The sample is marked `unseenInFrame` and the colour rules exclude it: a measured fact, so it neither
// withholds the population nor files the "verify manually" art P1 for text nobody can see in this frame. A
// translucent or transparent cover hides nothing: the shot holds the composite, and that is what is judged. A wallpapered room
// has dozens of these (a transcript scrolled up, a tab strip's hidden cells, a page under a dialog) beside
// in-view twins that are sampled here. A text unseen at every checkpoint is a walk coverage gap, not a verdict.
//
// ART UNDER ONE SUBJECT IS MEASURED FIRST. `art-under-subject` is a card image under its own caption: it backs
// only that caption, so a caption below the fold is scrolled into view and sampled like its in-view twin. One the
// page scroll cannot reach is unseen.
import { errorMessage } from "@orb/kit/error-message";
import type { PixelBox } from "@orb/tooling/floor/instrument/pixel-backdrop";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { ContrastInput, RawSamples } from "../contract/samples.ts";
import type { HoverForcedReadRow } from "../contract/samples-hover.ts";
import type { BorderContrastInput } from "../contract/samples-interactive.ts";
import type { BackdropRefusal, PixelPass } from "../contract/types.ts";
import type { PixelRaw, RingRead } from "../lib/pixel-regions.ts";
import { OFF_SCREEN_REFUSAL, surroundBackdropRing, textBackdropRing } from "../lib/pixel-regions.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

function isUnresolved(text: ContrastInput): boolean {
  return text.backdrop.kind === "unresolved";
}

const CLIPPED_OUT = "clipped out of its scroller";

// An unseen text is excluded, not refused: the reason rides on the sample, and the refusal list stays the
// NO VERDICT rows.
function unseen(text: ContrastInput, reason: string): { text: ContrastInput; sampled: boolean } {
  return { text: { ...text, unseenInFrame: reason }, sampled: false };
}

function isArtUnderSubject(text: ContrastInput): boolean {
  return text.backdrop.kind === "unresolved" && text.backdrop.reason === "art-under-subject";
}

/** Scroll the document to `top` CSS pixels, or stay put for `null`, and answer where it rests: a page edge can cut a scroll short. */
async function scrollDocumentTo(page: Page, top: number | null): Promise<number> {
  const at: unknown = await page.evaluate(
    top === null ? "window.scrollY" : `(() => { window.scrollTo({ top: ${String(top)}, behavior: "instant" }); return window.scrollY; })()`,
  );
  if (typeof at !== "number") {
    throw new Error(`INSTRUMENT ERROR: the reveal scroll answered ${String(at)}, not a position`);
  }
  return at;
}

/** The share of the viewport at each edge where a revealed text is not trusted, because a fixed bar may cover it. */
const REVEAL_EDGE_FRACTION = 0.25;

/** A deferred text with the box the walk read it at, so no step after the deferral can lose the box. */
interface DeferredText {
  readonly text: ContrastInput;
  readonly box: PixelBox;
}

function shiftedUp(box: PixelBox, dy: number): PixelBox {
  return { ...box, y: box.y - dy };
}

/** The ring of one deferred text in a shot taken after the document scrolled by `offset`. */
function revealedRing(raw: (PixelRaw & { data: Buffer }) | { error: string }, { text, box }: DeferredText, offset: number): RingRead {
  if ("error" in raw) {
    return { refusal: `pixel sample unavailable (${raw.error})` };
  }
  return textBackdropRing(
    raw,
    shiftedUp(box, offset),
    text.inkBox === undefined ? undefined : shiftedUp(text.inkBox, offset),
    text.groundMarks?.map((mark) => shiftedUp(mark, offset)),
  );
}

/** Settle off-screen `art-under-subject` texts by scrolling to each one. Each shot centres the first unsettled text and
 *  settles every deferred text in its middle half, so the pass takes as many scroll positions as the depths need. The
 *  page returns exactly to the walk's scroll position, because the passes after this one read it there. */
async function revealArtUnderSubject(
  page: Page,
  deferred: readonly DeferredText[],
  viewportHeight: number,
  refusals: BackdropRefusal[],
): Promise<ReadonlyMap<ContrastInput, { text: ContrastInput; sampled: boolean }>> {
  const settled = new Map<ContrastInput, { text: ContrastInput; sampled: boolean }>();
  let pending = deferred.toSorted((a, b) => a.box.y - b.box.y);
  const origin = await scrollDocumentTo(page, null);
  let restored = origin;
  try {
    for (let first = pending[0]; first !== undefined; first = pending[0]) {
      const offset = (await scrollDocumentTo(page, origin + first.box.y + first.box.height / 2 - viewportHeight / 2)) - origin;
      const raw = await viewportPixels(page);
      const still: DeferredText[] = [];
      for (const entry of pending) {
        // No occluder was read at this scroll position and fixed bars sit at the viewport's edges, so a shot settles
        // only its centred text and the texts inside its middle half. The rest wait for a shot of their own.
        const top = entry.box.y - offset;
        const edge = viewportHeight * REVEAL_EDGE_FRACTION;
        if (entry !== first && (top < edge || top + entry.box.height > viewportHeight - edge)) {
          still.push(entry);
        } else {
          settled.set(entry.text, settleFromRing(entry.text, revealedRing(raw, entry, offset), refusals));
        }
      }
      pending = still;
    }
  } finally {
    restored = await scrollDocumentTo(page, origin);
  }
  if (restored !== origin) {
    throw new Error(`INSTRUMENT ERROR: the reveal left the page at scrollY ${String(restored)}, not the walk's ${String(origin)}`);
  }
  return settled;
}

/** ONE viewport screenshot decoded to raw pixels, or the reason there are none. */
export async function viewportPixels(page: Pick<Page, "screenshot">): Promise<(PixelRaw & { data: Buffer }) | { error: string }> {
  try {
    const shot: Buffer = await page.screenshot({ animations: "disabled", scale: "css" });
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    return { data, info };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Resolve ONE unresolved text sample against the viewport screenshot: the settled sample (a `flat` backdrop
 *  from pixel data, or the sample marked unseen), plus any refusal and whether a pixel sample was taken. */
function settleOneSample(
  text: ContrastInput,
  raw: PixelRaw,
  refusals: BackdropRefusal[],
): { text: ContrastInput; sampled: boolean } | { readonly deferred: PixelBox } {
  // Sampling would measure another element's pixels: the opaque cover's, or whatever the scroller's neighbour
  // paints where the clipped text's box still reaches. A partial cover would mix into the ring, so it is refused.
  if (text.occludedBy !== undefined && text.occludedBy !== null) {
    return unseen(text, `painted over by ${text.occludedBy}`);
  }
  if (text.clippedOut === true) {
    return unseen(text, CLIPPED_OUT);
  }
  if (text.partlyCoveredBy !== undefined) {
    refusals.push({ selector: text.selector, reason: `partly painted over by ${text.partlyCoveredBy}` });
    return { text, sampled: false };
  }
  if (text.box === undefined) {
    refusals.push({ selector: text.selector, reason: "walker sample carries no box" });
    return { text, sampled: false };
  }
  const read = textBackdropRing(raw, text.box, text.inkBox, text.groundMarks);
  if ("refusal" in read && read.refusal === OFF_SCREEN_REFUSAL && isArtUnderSubject(text)) {
    return { deferred: text.box };
  }
  return settleFromRing(text, read, refusals);
}

/** The settled sample for one ring read: `flat` from the pixels, unseen off the screenshot, else the refusal. */
function settleFromRing(text: ContrastInput, read: RingRead, refusals: BackdropRefusal[]): { text: ContrastInput; sampled: boolean } {
  if ("refusal" in read) {
    if (read.refusal === OFF_SCREEN_REFUSAL) {
      return unseen(text, read.refusal);
    }
    // A ring that is not one backdrop stays UNRESOLVED: the text is painted, the instrument could not judge it.
    refusals.push({ selector: text.selector, reason: read.refusal });
    return { text, sampled: false };
  }
  return {
    text: { ...text, backdrop: { kind: "flat", color: read.color }, backdropMethod: "pixel-sample" } satisfies ContrastInput,
    sampled: true,
  };
}

/** A control's border is judged against the surface outside it; settle an unresolved one from the band
 *  just beyond its box. */
function settleOneBorder(input: BorderContrastInput, raw: PixelRaw, refusals: BackdropRefusal[]): { input: BorderContrastInput; sampled: boolean } {
  if (input.box === undefined) {
    refusals.push({ selector: input.selector, reason: "border sample carries no box" });
    return { input, sampled: false };
  }
  const read = surroundBackdropRing(raw, input.box);
  if ("refusal" in read) {
    refusals.push({ selector: input.selector, reason: read.refusal });
    return { input, sampled: false };
  }
  return { input: { ...input, surround: { kind: "flat", color: read.color } }, sampled: true };
}

/** Settle forced-`:hover` reads whose backdrop the DOM walk could not resolve, from a screenshot taken
 *  WHILE the subject is held. A ring that is not uniform stays unresolved and the rule withholds it. */
export async function settleHeldBackdrops(page: Page, reads: readonly HoverForcedReadRow[]): Promise<readonly HoverForcedReadRow[]> {
  if (!reads.some((read) => read.backdrop.kind === "unresolved" && read.box !== undefined)) {
    return reads;
  }
  const raw = await viewportPixels(page);
  if ("error" in raw) {
    return reads;
  }
  return reads.map((read) => {
    if (read.backdrop.kind !== "unresolved" || read.box === undefined) {
      return read;
    }
    const ring = textBackdropRing(raw, read.box);
    return "refusal" in ring ? read : { ...read, backdrop: { kind: "flat", color: ring.color } };
  });
}

export async function resolvePixelBackdrops(page: Page, samples: RawSamples): Promise<PixelPass> {
  const pendingTexts = samples.texts.filter(isUnresolved);
  const pendingBorders = (samples.borderContrasts ?? []).filter((input) => input.surround.kind === "unresolved");
  if (pendingTexts.length === 0 && pendingBorders.length === 0) {
    return { samples, sampled: 0, refusals: [] };
  }
  const raw = await viewportPixels(page);
  if ("error" in raw) {
    // No pixels at all: every pending sample is a refusal, and the report says why once.
    return {
      samples,
      sampled: 0,
      refusals: [...pendingTexts, ...pendingBorders].map((t) => ({ selector: t.selector, reason: `pixel sample unavailable (${raw.error})` })),
    };
  }
  const refusals: BackdropRefusal[] = [];
  let sampled = 0;
  const deferred: DeferredText[] = [];
  const firstPass = samples.texts.map((text) => {
    if (!isUnresolved(text)) {
      return text;
    }
    const settled = settleOneSample(text, raw, refusals);
    if ("deferred" in settled) {
      deferred.push({ text, box: settled.deferred });
      return text;
    }
    if (settled.sampled) {
      sampled += 1;
    }
    return settled.text;
  });
  const revealed =
    deferred.length === 0
      ? new Map<ContrastInput, { text: ContrastInput; sampled: boolean }>()
      : await revealArtUnderSubject(page, deferred, raw.info.height, refusals);
  const texts = firstPass.map((text) => {
    const settled = revealed.get(text);
    if (settled === undefined) {
      return text;
    }
    if (settled.sampled) {
      sampled += 1;
    }
    return settled.text;
  });
  const borderContrasts = samples.borderContrasts?.map((input) => {
    if (input.surround.kind !== "unresolved") {
      return input;
    }
    const settled = settleOneBorder(input, raw, refusals);
    if (settled.sampled) {
      sampled += 1;
    }
    return settled.input;
  });
  return { samples: { ...samples, texts, ...(borderContrasts === undefined ? {} : { borderContrasts }) }, sampled, refusals };
}
