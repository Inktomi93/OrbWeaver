// `substrate/inline-reply-images` — §6.7's canon projection for a picture the model drew inside its own
// reply. Two things are pinned here and nothing else belongs in this file:
//
//  1. THE ALT MINT (F22), because it is UNFIXABLE LATER. The alt is baked into `message_variants.content` at
//     generation time and there is no render-time correction, so a wrong rule ships a permanent defect into
//     every transcript that used the feature. The three arms — caption-as-preceding-prose, the empty answer,
//     and never-a-counter — each get a test, plus the hidden-span strip, which is a VISIBILITY rule wearing a
//     formatting costume: an alt minted off a raw slice would copy a `<lie>`'s host-only bytes onto a picture
//     the member can see.
//  2. THE SPLICE'S CLAMP, because the offset is measured on the provider's raw reply and the RECEIVE tier
//     rewrites those bytes before this runs. Every picture must appear exactly once in arrival order no
//     matter how far the offset has drifted.

import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { mintInlineImageAlt, spliceInlineReplyImages } from "../../../../../packages/server/src/domain/chat/substrate/inline-reply-images.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const A = castId<AssetId>("asset_a");
const B = castId<AssetId>("asset_b");

test("the alt is the PRECEDING SENTENCE — the caption the replyMedia contract asked the model for", () => {
  const body = "The market is waking up. She unrolls the map across the crate.";
  expect(mintInlineImageAlt(body, body.length)).toBe("She unrolls the map across the crate.");
});

test("the alt takes the LAST sentence, not the whole paragraph — earlier prose is the scene, not this picture", () => {
  const body = "Rain all morning. The stalls are empty. A grey cat sleeps on the awning.";
  expect(mintInlineImageAlt(body, body.length)).toBe("A grey cat sleeps on the awning.");
});

test("a picture that OPENS the turn mints an EMPTY alt — the correct HTML answer, never a counter", () => {
  // F22 / side-eye 8 P1-9: `image 1` is a filename read aloud, and it can never be corrected at render.
  // A screen reader SKIPS an empty alt, which is the honest outcome for a genuinely undescribed picture.
  expect(mintInlineImageAlt("", 0)).toBe("");
  expect(mintInlineImageAlt("anything at all", 0)).toBe("");
});

test("the alt NEVER carries hidden-span bytes — the member-visible attribute cannot launder host-only text", () => {
  // The scrub only ever removes the SPAN. An alt minted off a raw slice would copy the deception's own words
  // into an attribute on a picture the member CAN see, past every hidden-span belt in the system.
  // The registered hidden-tag form is SELF-CLOSING with the host-only payload in its ATTRS (`HIDDEN_TAGS`).
  const body = 'She smiles. <lie character="Vex" type="object" truth="the map is a forgery" reason="the heist"/>';
  const alt = mintInlineImageAlt(body, body.length);

  expect(alt).not.toContain("forgery");
  expect(alt).not.toContain("heist");
  expect(alt).toBe("She smiles.");
});

test("a card or choices block in front of the picture is not read aloud as its caption", () => {
  const body = 'Here it is.\n:::card title="The Ledger"\nrows and rows\n:::';
  expect(mintInlineImageAlt(body, body.length)).toBe("Here it is.");
});

test("the span lands WHERE THE PICTURE ARRIVED, as its own markdown block", () => {
  const body = "She unrolls the map.\n\nThen she waits.";
  const at = "She unrolls the map.\n\n".length;
  const out = spliceInlineReplyImages(body, [{ assetId: A, atChars: at }]);

  expect(out).toBe("She unrolls the map.\n\n![She unrolls the map.](asset:asset_a)\n\nThen she waits.");
});

test("two pictures keep ARRIVAL ORDER and each mints its own alt off the prose in front of IT", () => {
  const body = "First the map. Then the seal.";
  const out = spliceInlineReplyImages(body, [
    { assetId: A, atChars: "First the map.".length },
    { assetId: B, atChars: body.length },
  ]);

  // Neither alt echoes the other's span — the mint reads the ORIGINAL body, never the spliced output.
  expect(out).toContain("![First the map.](asset:asset_a)");
  expect(out).toContain("![Then the seal.](asset:asset_b)");
  expect(out.indexOf("asset_a")).toBeLessThan(out.indexOf("asset_b"));
});

test("an offset PAST the body clamps to the end — the receive tier may have shortened the prose under it", () => {
  // AI_OUTPUT regex scripts and the `<think>` demux rewrite the bytes between the provider's measurement and
  // this splice. A drifted offset must never drop the picture or throw; it lands at the tail.
  const out = spliceInlineReplyImages("short", [{ assetId: A, atChars: 9999 }]);
  expect(out).toBe("short\n\n![short](asset:asset_a)");
});

test("offsets that cross after clamping still emit EVERY picture exactly once, in arrival order", () => {
  // The property that actually matters: a rewritten body must never lose a picture the user paid for, and
  // must never duplicate one. Re-sorting into a position the model never chose is the worse answer.
  const out = spliceInlineReplyImages("abc", [
    { assetId: A, atChars: 3 },
    { assetId: B, atChars: 0 },
  ]);

  expect(out.match(/asset_a/gu)).toHaveLength(1);
  expect(out.match(/asset_b/gu)).toHaveLength(1);
  expect(out.indexOf("asset_a")).toBeLessThan(out.indexOf("asset_b"));
});

test("a PICTURE-ONLY reply is a body — the span is all there is, and it is not empty", () => {
  // The reason the absorb step runs BEFORE the prose-less refusal: an image-output model answering with
  // bytes and no words has said something, exactly as a media-only `/imagine` post has (D124).
  const out = spliceInlineReplyImages("", [{ assetId: A, atChars: 0 }]);
  expect(out).toBe("![](asset:asset_a)");
  expect(out.trim().length).toBeGreaterThan(0);
});

test("no pictures leaves the body BYTE-IDENTICAL — every text-only turn pays nothing", () => {
  const body = "Nothing to see here.\n\nReally.";
  expect(spliceInlineReplyImages(body, [])).toBe(body);
});
