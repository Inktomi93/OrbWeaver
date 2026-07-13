// @orb/server/kit/content-hash — the D9-ruled canonical sha256-hex-of-bytes primitive (node-only-pure).
import { createHash } from "node:crypto";

export function sha256Hex(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
