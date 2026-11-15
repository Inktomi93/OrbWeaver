// A styled reply splits into frame runs around what must stay native (D354): a dice paragraph, a choices set, media and
// a marked card. A blank line inside a display script's `<style>` is no paragraph break, a marked card keeps its own
// block at the row's tier while a lenient one stays in the reply's frame, and every run carries the reply's other runs'
// stylesheets while a native card carries none of them.
// @subject packages/client/src/features/chat/lib/reply-parts.ts

import { expect, test } from "@orb/testkit/node";
import type { ReplyPart } from "#client/features/chat/lib/reply-parts.ts";
import { replyParts } from "#client/features/chat/lib/reply-parts.ts";

const PANEL_STYLE = ["<style>.hud{display:block}", "", ".hud b{font-weight:600}", "", "/* Order check */ .hud summary{color:red}", "</style>"].join("\n");
const PANEL = `<div class="hud">${PANEL_STYLE}<details class="hud"><summary>Tracker</summary></details></div>`;
const CARD_HTML = '<div class="ledger">Ledger</div><style>.ledger{color:blue}</style>';
const MARKED_CARD = `:::card title="Ledger"\n${CARD_HTML}\n:::`;

function runs(parts: readonly ReplyPart[]): readonly string[] {
  return parts.flatMap((part) =>
    part.kind === "frame" ? part.segments.map((segment) => (segment.kind === "markdown" ? segment.markdown : segment.html)) : [],
  );
}

test("a dice reply splits at its paragraphs, never inside a stylesheet", () => {
  const parts = replyParts([{ text: `${PANEL}\n\nShe rolls. [dice: d20 → 15]\n\nThe hall goes quiet.`, tokens: undefined }], {
    lenientHtml: false,
    cardTrust: "tierB",
  });
  expect(runs(parts)).toEqual([PANEL, "The hall goes quiet."]);
  // Positive control: the stamp's paragraph is split out, native.
  expect(parts.map((part) => part.kind)).toEqual(["frame", "native", "frame"]);
});

test("a run after a split carries the stylesheet the run before it holds, and the run before carries the one after", () => {
  const parts = replyParts([{ text: `${PANEL}\n\n:::choices\n1. Go\n:::\n\n<style>.later{color:red}</style><b class="later">Later</b>`, tokens: undefined }], {
    lenientHtml: false,
    cardTrust: "tierB",
  });
  const frames = parts.filter((part) => part.kind === "frame");
  expect(frames.map((part) => part.styles)).toEqual([
    { before: "", after: "<style>.later{color:red}</style>" },
    { before: PANEL_STYLE, after: "" },
  ]);
});

test.each(["tierA", "tierB"] as const)("a marked card stays native at the row's %s tier, and no run carries its stylesheet", (cardTrust) => {
  const parts = replyParts([{ text: `${PANEL}\n\n${MARKED_CARD}\n\nShe waits.`, tokens: undefined }], { lenientHtml: false, cardTrust });
  expect(parts.map((part) => part.kind)).toEqual(["frame", "native", "frame"]);
  const card = parts[1];
  expect(card?.kind === "native" ? card.block : undefined).toEqual({ kind: "html-card", html: CARD_HTML, trust: cardTrust, origin: "fence", title: "Ledger" });
  expect(parts.flatMap((part) => (part.kind === "frame" ? [part.styles.before, part.styles.after] : [])).join("")).not.toContain("ledger");
});

test.each([
  ["inline code", "Use `<style>.run{display:none}</style>` to hide it."],
  ["a tilde code block", "~~~html\n<style>.run{display:none}</style>\n~~~"],
  ["an indented code block", "Like this:\n\n    <style>.run{display:none}</style>"],
])("a stylesheet shown as %s is carried into no other run", (_name, sample) => {
  const parts = replyParts(
    [{ text: `${sample}\n\nShe rolls. [dice: d20 → 15]\n\n<style>.real{color:red}</style><b class="real">After.</b>`, tokens: undefined }],
    {
      lenientHtml: false,
      cardTrust: "tierB",
    },
  );
  // Positive control: the stylesheet the reply draws is carried.
  expect(parts.filter((part) => part.kind === "frame").map((part) => part.styles)).toEqual([
    { before: "", after: "<style>.real{color:red}</style>" },
    { before: "", after: "" },
  ]);
});

test("a lenient card is the reply's own markup and stays in its frame", () => {
  const lenient = '<div class="w">\n<p>One</p>\n<p>Two</p>\n</div>';
  const parts = replyParts([{ text: `${lenient}\n\nShe waits.`, tokens: undefined }], { lenientHtml: true, cardTrust: "tierB" });
  expect(parts.map((part) => part.kind)).toEqual(["frame"]);
  expect(runs(parts)).toEqual([lenient, "\n\nShe waits."]);
});
