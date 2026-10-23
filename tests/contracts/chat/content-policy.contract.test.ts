import { CONTENT_CLASS_POLICY, contentSpansToBlocks, messageContentBlockSchema } from "@orb/contracts/chat";
import type { ContentSpanKind } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

const CLASS_BODIES = {
  text: "The witness speaks.",
  dice: "[dice: Perception 1d20+2 → 17]",
  image: "![the witness](https://example.test/witness.png)",
  hidden: '<lie character="Witness" truth="the key is missing"/>',
  card: ':::card title="Witness"\n<div>The witness card.</div>\n:::',
  choices: ":::choices\n1. Ask about the key\n2. Leave\n:::",
  "unknown-directive": '<teleport destination="tower"/>',
} satisfies Record<ContentSpanKind, string>;

test.for(Object.entries(CLASS_BODIES))("the public reading projection follows the %s policy", ([kind, body]) => {
  const spans = tokenizeContent(body);
  expect(spans).toHaveLength(1);
  const span = spans[0];
  if (span === undefined) {
    throw new Error("the class input did not reach the tokenizer");
  }
  expect(span.kind).toBe(kind);
  const blocks = contentSpansToBlocks(spans);
  expect(blocks.length > 0).toBe(CONTENT_CLASS_POLICY[span.kind].reading === "show");
  for (const block of blocks) {
    expect(messageContentBlockSchema.parse(JSON.parse(JSON.stringify(block)))).toEqual(block);
  }
});

test("hidden bodies and unknown directives disappear without breaking adjacent text and dice", () => {
  const body = `Before ${CLASS_BODIES.hidden}${CLASS_BODIES["unknown-directive"]}${CLASS_BODIES.dice} after.`;
  expect(contentSpansToBlocks(tokenizeContent(body))).toEqual([{ kind: "markdown", md: `Before ${CLASS_BODIES.dice} after.` }]);
});

test("cards keep their body, provenance and caller trust while choices keep their options", () => {
  const spans = tokenizeContent(`${CLASS_BODIES.card}\n${CLASS_BODIES.choices}`);
  expect(contentSpansToBlocks(spans)).toEqual([
    { kind: "html-card", html: "<div>The witness card.</div>", trust: "tierB", origin: "fence", title: "Witness" },
    { kind: "markdown", md: "\n" },
    { kind: "choices", options: ["Ask about the key", "Leave"] },
  ]);
  expect(contentSpansToBlocks(tokenizeContent(CLASS_BODIES.card), { cardTrust: "tierA" })).toEqual([
    { kind: "html-card", html: "<div>The witness card.</div>", trust: "tierA", origin: "fence", title: "Witness" },
  ]);
});

test("malformed stored asset references degrade to literal markdown instead of throwing", () => {
  const body = "Before ![witness](asset:not-a-typeid) after.";
  expect(contentSpansToBlocks(tokenizeContent(body))).toEqual([
    { kind: "markdown", md: "Before " },
    { kind: "markdown", md: "![witness](asset:not-a-typeid)" },
    { kind: "markdown", md: " after." },
  ]);
});

test("valid asset and external image references retain gated media blocks", ({ ids }) => {
  const assetId = mintTypeId(ID_PREFIX.asset, ids.next);
  expect(contentSpansToBlocks(tokenizeContent(`![owned](asset:${assetId})${CLASS_BODIES.image}`))).toEqual([
    { kind: "media", media: "image", src: { kind: "asset", assetId }, alt: "owned" },
    { kind: "media", media: "image", src: { kind: "external", url: "https://example.test/witness.png" }, alt: "the witness" },
  ]);
});
