// @subject packages/kit/src/png-card-chunk/index.ts
// The card write embeds the card as both a chara (V2) and a ccv3 (V3) tEXt chunk, and the read takes a chunk only
// when its CRC-32 matches, so a flipped byte that still decodes is no card.
import { PNG_SIGNATURE } from "@orb/kit/image-sniff";
import { readCardChunk, writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "@orb/testkit/node";

// The IEND chunk: zero length, the type, and its fixed CRC-32.
const IEND = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const BASE = Uint8Array.from([...PNG_SIGNATURE, ...IEND]);
const CHUNK_OVERHEAD = 12;
const V3_CARD = '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Harbor Keeper","description":"Keeps the light."}}';
const V2_CARD = '{"data":{"name":"Harbor Keeper","description":"Keeps the light."}}';

// On the bare base the write lays out signature, chara, ccv3, IEND, so each card chunk's span follows from its length.
function cardChunkSpans(png: Uint8Array): { readonly chara: readonly [number, number]; readonly ccv3: readonly [number, number] } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const charaStart = PNG_SIGNATURE.length;
  const ccv3Start = charaStart + CHUNK_OVERHEAD + view.getUint32(charaStart);
  return { chara: [charaStart, ccv3Start], ccv3: [ccv3Start, png.length - IEND.length] };
}

function withByte(png: Uint8Array, at: number, byte: number): Uint8Array {
  const out = png.slice();
  out[at] = byte;
  return out;
}

test("the write embeds the card as both chunks, the V2 chunk without the V3 spec keys", async () => {
  const png = writeCardChunk(BASE, V3_CARD);
  expect(await readCardChunk(png, "ccv3")).toBe(V3_CARD);
  expect(await readCardChunk(png, "chara")).toBe(V2_CARD);
});

test("a ccv3 chunk whose payload no longer matches its CRC is no card, while the intact chara chunk still reads", async () => {
  const png = writeCardChunk(BASE, V3_CARD);
  const [start] = cardChunkSpans(png).ccv3;
  // The first base64 digit of the value, after length, type and the `ccv3\0` keyword: `A` and `B` both decode.
  const digit = start + 8 + "ccv3\0".length;
  const flipped = withByte(png, digit, png[digit] === 0x41 ? 0x42 : 0x41);
  expect(await readCardChunk(flipped, "ccv3")).toBeNull();
  expect(await readCardChunk(flipped, "chara")).toBe(V2_CARD);
});

test("a ccv3 chunk whose stored CRC is wrong is no card", async () => {
  const png = writeCardChunk(BASE, V3_CARD);
  const [, end] = cardChunkSpans(png).ccv3;
  const crcByte = end - 1;
  expect(await readCardChunk(withByte(png, crcByte, 0xff - (png[crcByte] ?? 0)), "ccv3")).toBeNull();
});

test.for(["chara", "ccv3"] as const)("a card carrying only its %s chunk reads that chunk and answers no card for the other", async (kept) => {
  const png = writeCardChunk(BASE, V3_CARD);
  const [start, end] = cardChunkSpans(png)[kept === "chara" ? "ccv3" : "chara"];
  const single = Uint8Array.from([...png.subarray(0, start), ...png.subarray(end)]);
  expect(await readCardChunk(single, kept)).toBe(kept === "chara" ? V2_CARD : V3_CARD);
  expect(await readCardChunk(single, kept === "chara" ? "ccv3" : "chara")).toBeNull();
});
