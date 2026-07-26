import { contentSpansToBlocks, messageContentBlockSchema } from "@orb/contracts/chat";
import { expect, test } from "../../support/fixtures";

test("messageContentBlockSchema — round-trips its three kinds (D44)", () => {
  for (const block of [
    { kind: "markdown", md: "hi" },
    { kind: "media", media: "image", src: { kind: "external", url: "https://x/y.png" }, alt: "y" },
    { kind: "html-card", html: "<div></div>", css: ".a{}", trust: "tierB" },
  ]) {
    expect(messageContentBlockSchema.parse(block)).toEqual(block);
  }
});

test("contentSpansToBlocks — joins text runs, converts D51 image refs, brands asset ids", () => {
  const assetId = "asset_01h455vb4pex5vsknk084sn02q";
  const blocks = contentSpansToBlocks([
    { kind: "text", text: "Look: " },
    { kind: "text", text: "two panels.\n" },
    {
      kind: "image",
      ref: { kind: "asset", assetId },
      alt: "a map",
    },
    { kind: "image", ref: { kind: "external", url: "https://example.test/x.png" }, alt: "" },
    { kind: "text", text: "The end." },
  ]);
  expect(blocks).toEqual([
    { kind: "markdown", md: "Look: two panels.\n" },
    { kind: "media", media: "image", src: { kind: "asset", assetId }, alt: "a map" },
    {
      kind: "media",
      media: "image",
      src: { kind: "external", url: "https://example.test/x.png" },
      alt: "",
    },
    { kind: "markdown", md: "The end." },
  ]);
  // Every block is schema-valid (the projection can never emit an unrenderable block).
  for (const b of blocks) {
    expect(messageContentBlockSchema.parse(b)).toEqual(b);
  }
});

test("contentSpansToBlocks — a text-only body is ONE markdown block; a bad asset ref DEGRADES, never throws", () => {
  expect(contentSpansToBlocks([{ kind: "text", text: "plain" }])).toEqual([{ kind: "markdown", md: "plain" }]);
  // Stored-content projections degrade, never throw (ratified doctrine): a malformed persisted asset
  // ref would otherwise crash every render of the row with no per-row boundary — a permanent chat DoS.
  // It falls back to the raw image markdown as a text block; the projection returns a schema-valid,
  // renderable block set instead of throwing a ZodError inside React render.
  const degraded = contentSpansToBlocks([{ kind: "image", ref: { kind: "asset", assetId: "not-a-typeid" }, alt: "a map" }]);
  expect(degraded).toEqual([{ kind: "markdown", md: "![a map](asset:not-a-typeid)" }]);
  for (const b of degraded) {
    expect(messageContentBlockSchema.parse(b)).toEqual(b);
  }
});
