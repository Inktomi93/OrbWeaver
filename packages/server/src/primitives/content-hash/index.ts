// @orb/server/primitives/content-hash — the D9-ruled canonical sha256-hex-of-bytes primitive (node-only-pure).
import { createHash } from "node:crypto";

export function sha256Hex(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** {@link sha256Hex} of the parts' concatenation, hashed as they arrive, so a producer can yield the event loop
 *  between parts. Each part is UTF-8 encoded, as `TextEncoder` encodes a well-formed string. */
export async function sha256HexOfParts(parts: AsyncIterable<string>): Promise<string> {
  const hash = createHash("sha256");
  for await (const part of parts) {
    hash.update(part);
  }
  return hash.digest("hex");
}
