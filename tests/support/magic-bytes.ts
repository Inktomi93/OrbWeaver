// Shared MAGIC-BYTE fixtures (NOT a test file — no `.test` suffix). One home for "bytes that a signature
// sniff will call X", used by every suite that exercises a format wall: #820's bundle-asset admission
// (`domain/plugin/substrate/manifest`) and the install/upgrade verbs that store what it admitted.
//
// WHY A SHARED HOME AND NOT A LOCAL LITERAL: a format wall reads the BYTES and never the filename, so a
// fixture whose signature is wrong proves nothing while looking exactly like a passing test. Two copies of
// these tables is two chances for one of them to drift into "a .png that is not a PNG" and quietly turn a
// refusal test green for the wrong reason.

/** The formats these fixtures can produce. The first four are what `@orb/kit`'s `sniffMime` recognizes; the
 *  last two are the REFUSAL vocabulary — an SVG (valid UTF-8, no binary signature, and a script carrier) and
 *  a nested zip (the other thing an extension-trusting wall would happily admit). */
export const MAGIC_FORMATS = ["png", "jpeg", "gif", "webp", "svg", "zip"] as const;
export type MagicFormat = (typeof MAGIC_FORMATS)[number];

const SIGNATURES: Record<MagicFormat, readonly number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // "GIF89a"
  // "RIFF" + a 4-byte size + "WEBP" — the sniff checks the tag at byte 8, so the whole 12-byte head matters.
  webp: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
  // `<svg xmlns=…/>` — decodes as text, carries no binary signature, and executes script when served as a
  // document from our own origin. It must sniff as UNKNOWN, which is what refuses it.
  svg: [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  zip: [0x50, 0x4b, 0x03, 0x04], // "PK\x03\x04" — the local-file header.
};

/** `size` bytes whose HEAD is the named format's real signature, zero-padded to length. `size` is clamped up
 *  to the signature length so a caller can never accidentally build a truncated head that fails to match for
 *  a reason the test did not intend. */
export function magicBytes(format: MagicFormat, size = 64): Uint8Array {
  const signature = SIGNATURES[format];
  const bytes = new Uint8Array(Math.max(size, signature.length));
  bytes.set(signature, 0);
  return bytes;
}
