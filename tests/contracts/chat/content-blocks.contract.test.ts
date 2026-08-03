import { contentSpansToBlocks, messageContentBlockSchema } from "@orb/contracts/chat";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
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
      ref: { kind: "asset", assetId: castId<AssetId>(assetId) },
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
  const degraded = contentSpansToBlocks([{ kind: "image", ref: { kind: "asset", assetId: castId<AssetId>("not-a-typeid") }, alt: "a map" }]);
  expect(degraded).toEqual([{ kind: "markdown", md: "![a map](asset:not-a-typeid)" }]);
  for (const b of degraded) {
    expect(messageContentBlockSchema.parse(b)).toEqual(b);
  }
});

// ── The parity-plus §3.4 READING-SURFACE plane (render arms over the §3.2 span grammar) ──────────────────

test("messageContentBlockSchema — round-trips the parity-plus members (titled html-card + choices)", () => {
  for (const block of [
    { kind: "html-card", html: "<div/>", trust: "tierB", title: "A letter" },
    { kind: "choices", options: ["Draw your blade.", "Play along."] },
  ]) {
    expect(messageContentBlockSchema.parse(block)).toEqual(block);
  }
});

test("a HIDDEN span projects to NO block, and the text around it joins into ONE markdown block (§3.4 — the render filter)", () => {
  const blocks = contentSpansToBlocks([
    { kind: "text", text: "He nods." },
    { kind: "hidden", tag: "lie", attrs: { truth: "the crypt" }, raw: '<lie truth="the crypt"/>' },
    { kind: "text", text: " Nothing more." },
  ]);
  expect(blocks).toEqual([{ kind: "markdown", md: "He nods. Nothing more." }]);
  // The consequence, not the artifact: zero truth bytes reach the render model.
  expect(JSON.stringify(blocks)).not.toContain("crypt");
});

test("an unknown-directive span projects to NO block (§3.2.1 allowlist-strip — model noise never renders)", () => {
  expect(
    contentSpansToBlocks([
      { kind: "text", text: "before " },
      { kind: "unknown-directive", raw: ':::teleport to="crypt"\nnow\n:::' },
      { kind: "text", text: " after" },
    ]),
  ).toEqual([{ kind: "markdown", md: "before  after" }]);
});

test("a card span projects to an html-card block — tierB by DEFAULT (fail-closed sandbox), caller-resolved trust threads (§4.3)", () => {
  const span = { kind: "card", title: "Zandik's letter", body: "<div>x</div>", origin: "fence", raw: ":::card\n<div>x</div>\n:::" } as const;
  expect(contentSpansToBlocks([span])).toEqual([{ kind: "html-card", html: "<div>x</div>", trust: "tierB", origin: "fence", title: "Zandik's letter" }]);
  expect(contentSpansToBlocks([span], { cardTrust: "tierA" })).toEqual([
    { kind: "html-card", html: "<div>x</div>", trust: "tierA", origin: "fence", title: "Zandik's letter" },
  ]);
  // A title-less card omits the optional field (exactOptionalPropertyTypes-honest).
  expect(contentSpansToBlocks([{ ...span, title: null }])).toEqual([{ kind: "html-card", html: "<div>x</div>", trust: "tierB", origin: "fence" }]);
  // §4.8 provenance: a lenient-arm card block carries origin "lenient" for the view-raw/debug chrome.
  expect(contentSpansToBlocks([{ ...span, origin: "lenient" }])).toEqual([
    { kind: "html-card", html: "<div>x</div>", trust: "tierB", origin: "lenient", title: "Zandik's letter" },
  ]);
});

test("a choices span projects to a choices block (buttons are the client arm; the options are the datum)", () => {
  const blocks = contentSpansToBlocks([{ kind: "choices", options: ["one", "two"], raw: ":::choices\n1. one\n2. two\n:::" }]);
  expect(blocks).toEqual([{ kind: "choices", options: ["one", "two"] }]);
  for (const b of blocks) {
    expect(messageContentBlockSchema.parse(b)).toEqual(b);
  }
});
