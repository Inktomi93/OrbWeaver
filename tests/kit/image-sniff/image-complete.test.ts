// @subject packages/kit/src/image-sniff/index.ts
// A whole image of every format the sniff recognizes reads as complete; the same image cut short reads as incomplete,
// wherever the cut falls, even when the signature and header survive. Bytes appended after a format's end marker
// leave it complete; AVIF has no end marker, so an appended payload reads as a cut box.
import { isCompleteImage, sniffImageBytes } from "@orb/kit/image-sniff";
import { expect, test } from "@orb/testkit/node";
import sharp from "sharp";

const WIDTH = 48;
const HEIGHT = 32;
const CHANNELS = 3;
const PIXEL_PERIOD = 251;
/** Bytes appended after a whole file, as a tool that tacks on a payload leaves them. */
const APPENDED = new Uint8Array(16).fill(0x5a);

/** A deterministic picture with varied pixels, so the encoders write real compressed data rather than a flat run. */
function pixels(): Buffer {
  return Buffer.from(Array.from({ length: WIDTH * HEIGHT * CHANNELS }, (_, at) => (at * 37 + Math.floor(at / CHANNELS) * 11) % PIXEL_PERIOD));
}

/** The encoder pipeline sharp hands back. */
type Image = ReturnType<typeof sharp>;

interface Encoding {
  readonly encode: (image: Image) => Image;
  /** Whether the format marks its own end, so bytes after it are not part of the image. */
  readonly endMarked: boolean;
}

const ENCODINGS: Record<string, Encoding> = {
  png: { encode: (image): Image => image.png(), endMarked: true },
  "jpeg baseline": { encode: (image): Image => image.jpeg({ quality: 80 }), endMarked: true },
  "jpeg progressive": { encode: (image): Image => image.jpeg({ quality: 80, progressive: true }), endMarked: true },
  gif: { encode: (image): Image => image.gif(), endMarked: true },
  "webp lossy": { encode: (image): Image => image.webp({ quality: 80 }), endMarked: true },
  "webp lossless": { encode: (image): Image => image.webp({ lossless: true }), endMarked: true },
  avif: { encode: (image): Image => image.avif({ quality: 50 }), endMarked: false },
};

async function encoded(encoding: Encoding): Promise<Uint8Array> {
  return new Uint8Array(await encoding.encode(sharp(pixels(), { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })).toBuffer());
}

test.for(Object.entries(ENCODINGS))("a whole %s reads as complete, and as incomplete wherever it is cut", async ([, encoding]) => {
  const whole = await encoded(encoding);
  // Positive control: the sniff recognizes the encoder's output and reads its dimensions.
  expect(sniffImageBytes(whole)).toMatchObject({ width: WIDTH, height: HEIGHT });
  expect(isCompleteImage(whole)).toBe(true);
  expect(isCompleteImage(Uint8Array.from([...whole, ...APPENDED]))).toBe(encoding.endMarked);
  for (const cut of [16, 64, Math.floor(whole.length / 2), whole.length - 1]) {
    expect({ cut, complete: isCompleteImage(whole.subarray(0, cut)) }).toEqual({ cut, complete: false });
  }
});

test("bytes no format claims are never a complete image", () => {
  expect(isCompleteImage(APPENDED)).toBe(false);
});
