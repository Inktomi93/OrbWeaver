// Unit tests for the shared image helper — magic-byte MIME sniff + bytes→data-URI (pure, no network).

import { Buffer } from "node:buffer";
import { sniffMime, toDataUri } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("sniffMime", () => {
  test("recognizes the formats CAS assets hold by their magic bytes", () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    // Full 6-byte GIF89a magic — the unified @orb/kit/image-sniff table (PD-123) requires the complete
    // "GIF87a"/"GIF89a" tag, not vllm's old 3-byte "GIF" prefix (a real GIF always carries all six).
    expect(sniffMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
  });

  test("recognizes WEBP by its marker at offset 8 (RIFF....WEBP)", () => {
    // "RIFF" + 4 size bytes + "WEBP" — the helper checks the W/E/B at offset 8.
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffMime(webp)).toBe("image/webp");
  });

  test("defaults to png for unrecognized / too-short bytes (CAS assets are validated images)", () => {
    expect(sniffMime(new Uint8Array([0x00, 0x01]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([]))).toBe("image/png");
  });
});

describe("toDataUri", () => {
  test("encodes bytes as a base64 data URI with the sniffed mime", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
    const uri = await toDataUri(png);
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    // The base64 tail round-trips back to the original bytes.
    const b64 = uri.slice("data:image/png;base64,".length);
    expect([...Buffer.from(b64, "base64")]).toEqual([...png]);
  });
});
