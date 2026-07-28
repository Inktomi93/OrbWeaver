// Unit: the stored-body → render-block projection (features/chat/lib/content-blocks). Pure, no DOM —
// runs in the node lane. Asserts the compose of the kit tokenizer + the contracts projector.

import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";
import { toContentBlocks } from "../../../../../packages/client/src/features/chat/lib/content-blocks";
import { expect, test } from "../../../../support/fixtures";

test("plain text projects to a single markdown block", () => {
  expect(toContentBlocks("hello world")).toEqual([{ kind: "markdown", md: "hello world" }]);
});

test("empty content projects to no blocks", () => {
  expect(toContentBlocks("")).toEqual([]);
});

test("an external image splits into markdown + media + markdown blocks (exhaustive kinds)", () => {
  expect(toContentBlocks("see ![cat](https://x.test/c.png) end")).toEqual([
    { kind: "markdown", md: "see " },
    {
      kind: "media",
      media: "image",
      src: { kind: "external", url: "https://x.test/c.png" },
      alt: "cat",
    },
    { kind: "markdown", md: " end" },
  ]);
});

// ── The parity-plus §3.4 reading-surface filter + the §3.9 display choke-point pins ──────────────────────

const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';

test("a hidden tag projects to NO block (the reading-surface filter — client defense-in-depth arm)", () => {
  const blocks = toContentBlocks(`He nods. ${lieTag} "Nothing," he says.`);
  expect(blocks).toEqual([{ kind: "markdown", md: 'He nods.  "Nothing," he says.' }]);
  expect(JSON.stringify(blocks)).not.toContain("crypt");
});

test("a card fence projects to an html-card block; the row-resolved trust threads (§4.3 — ONE trust authority)", () => {
  const body = ':::card title="Terminal"\n<div>x</div>\n:::';
  expect(toContentBlocks(body)).toEqual([{ kind: "html-card", html: "<div>x</div>", trust: "tierB", origin: "fence", title: "Terminal" }]);
  expect(toContentBlocks(body, { cardTrust: "tierA" })).toEqual([
    { kind: "html-card", html: "<div>x</div>", trust: "tierA", origin: "fence", title: "Terminal" },
  ]);
});

test("the §4.8 lenient arm is OFF by default and opt-in via `lenientHtml` (game + immersiveHtml only)", () => {
  const naked = "<div>\n<p>an in-world page</p>\n</div>";
  // Default (a non-game chat): today's literal-text behavior — never a surprise card in a coding chat.
  expect(toContentBlocks(naked)).toEqual([{ kind: "markdown", md: naked }]);
  // Lenient (a game with immersiveHtml on): the naked block wraps into an implicit tierB card, origin-tagged.
  expect(toContentBlocks(naked, { lenientHtml: true })).toEqual([{ kind: "html-card", html: naked, trust: "tierB", origin: "lenient" }]);
});

test("a choices fence projects to a choices block; an unknown directive projects to nothing (allowlist-strip)", () => {
  expect(toContentBlocks(":::choices\n1. one\n2. two\n:::")).toEqual([{ kind: "choices", options: ["one", "two"] }]);
  expect(toContentBlocks('before\n:::teleport to="x"\nnow\n:::\nafter')).toEqual([{ kind: "markdown", md: "before\n\nafter" }]);
});

// §3.9(3): the render filter COMPOSES AFTER the one display pipeline (`renderMessageForDisplay`: macros →
// DISPLAY-regex → fixMarkdown) — `MessageContent` tokenizes the POST-regex text. These pins emulate that
// composition order exactly (regex output feeds the projection) and pin the two contracted outcomes.
test("§3.9(3): a DISPLAY regex rewriting NEAR a hidden tag composes — the filter still drops the tag from the post-regex text", () => {
  const post = executeRegexScripts({
    text: `alpha prose ${lieTag}`,
    scripts: [displayScript("alpha", "beta")],
    placement: "DISPLAY",
    ctx: { char: "A", user: "B", persona: "", scenario: "", env: {} },
  });
  expect(toContentBlocks(post)).toEqual([{ kind: "markdown", md: "beta prose " }]);
});

test("§3.9(3): a DISPLAY regex that MANGLES a card fence degrades the card to literal text (D51 — the user's own foot-gun, never a crash)", () => {
  const post = executeRegexScripts({
    text: ':::card title="t"\n<div>x</div>\n:::',
    scripts: [displayScript("^:::card.*$", "broken-open")],
    placement: "DISPLAY",
    ctx: { char: "A", user: "B", persona: "", scenario: "", env: {} },
  });
  // The open line was rewritten → no fence recognized → the bytes render as literal text, nothing throws.
  expect(toContentBlocks(post)).toEqual([{ kind: "markdown", md: "broken-open\n<div>x</div>\n:::" }]);
});

function displayScript(findRegex: string, replaceString: string): RegexScriptInput {
  return { enabled: true, placement: ["DISPLAY"], findRegex, replaceString, markdownOnly: true };
}
