// biome-ignore-all lint/style/useNamingConvention: `media_type` is the Anthropic wire field, not an orbweaver id.
//
// backends/kit/anth-image-block — the outbound-image → Anthropic Messages content-block seam (MA-10). One
// home for the block shape both Anthropic-wire summarize arms (anth-direct, agent-sdk) build. Load-bearing:
//   • Uint8Array ⇒ a base64 source, bytes routed through the injected normalize seam FIRST (GIF → PNG).
//   • a `data:` URL string ⇒ split into its declared mime + payload (a base64 source, no re-encode).
//   • any other string ⇒ a url source (the provider fetches it).

import { toAnthImageBlock } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

// A normalize seam that labels bytes as png (identity bytes), so [1,2,3] → base64 "AQID".
const pngNormalize = (bytes: Uint8Array): Promise<{ bytes: Uint8Array; mediaType: string }> => Promise.resolve({ bytes, mediaType: "image/png" });

describe("toAnthImageBlock", () => {
  test("Uint8Array ⇒ a base64 source, bytes normalized then encoded (mediaType from the seam)", async () => {
    const block = await toAnthImageBlock(Uint8Array.from([1, 2, 3]), pngNormalize);
    expect(block).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } });
  });

  test("a GIF-decoding seam is honored — the returned mediaType + re-encoded bytes ride the block", async () => {
    // Simulate a GIF → first-frame-PNG decode: the seam swaps the bytes AND declares png.
    const decodeGif = (): Promise<{ bytes: Uint8Array; mediaType: string }> => Promise.resolve({ bytes: Uint8Array.from([4, 5, 6]), mediaType: "image/png" });
    const block = await toAnthImageBlock(Uint8Array.from([0x47, 0x49, 0x46]), decodeGif);
    expect(block).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "BAUG" } });
  });

  test("a data: URL string ⇒ a base64 source from its declared mime + payload (no re-encode)", async () => {
    const block = await toAnthImageBlock("data:image/jpeg;base64,/9j/AAA", pngNormalize);
    expect(block).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/AAA" } });
  });

  test("an http URL string ⇒ a url source (the provider fetches it)", async () => {
    const block = await toAnthImageBlock("https://cdn.example/a.png", pngNormalize);
    expect(block).toEqual({ type: "image", source: { type: "url", url: "https://cdn.example/a.png" } });
  });
});
