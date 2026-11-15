// A styled reply splits into frame runs around what must stay native (D354): a dice paragraph, a choices set, media and
// a marked card. A blank line inside a display script's `<style>` is no paragraph break, a marked card keeps its own
// block at the row's tier while a lenient one stays in the reply's frame, and every run carries the reply's other runs'
// stylesheets, the last copy of a repeated one only and every copy of a layered one, while a native card carries none.
// Past the carry budget the whole reply takes the plain path.
// @subject packages/client/src/features/chat/lib/reply-parts.ts

import { PLAIN_REPLY_REASON } from "@orb/client/lib";
import type { CardTrust } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ReplyPart } from "#client/features/chat/lib/reply-parts.ts";
import { REPLY_CARRY_BUDGET_CHARS, replyLayout } from "#client/features/chat/lib/reply-parts.ts";

const PANEL_CSS = [".hud{display:block}", "", ".hud b{font-weight:600}", "", "/* Order check */ .hud summary{color:red}", ""].join("\n");
const PANEL_STYLE = `<style>${PANEL_CSS}</style>`;
const PANEL = `<div class="hud">${PANEL_STYLE}<details class="hud"><summary>Tracker</summary></details></div>`;
const CARD_HTML = '<div class="ledger">Ledger</div><style>.ledger{color:blue}</style>';
const MARKED_CARD = `:::card title="Ledger"\n${CARD_HTML}\n:::`;
const DICE = "She rolls. [dice: d20 → 15]";

function framed(text: string, options: { readonly lenientHtml?: boolean; readonly cardTrust?: CardTrust } = {}): readonly ReplyPart[] {
  const layout = replyLayout([{ text, tokens: undefined }], { lenientHtml: options.lenientHtml ?? false, cardTrust: options.cardTrust ?? "tierB" });
  if (layout.kind !== "framed") {
    throw new Error(`expected a framed reply, got the plain path: ${layout.reason}`);
  }
  return layout.parts;
}

function runs(parts: readonly ReplyPart[]): readonly string[] {
  return parts.flatMap((part) =>
    part.kind === "frame" ? part.segments.map((segment) => (segment.kind === "markdown" ? segment.markdown : segment.html)) : [],
  );
}

function carried(parts: readonly ReplyPart[]): readonly { readonly before: readonly string[]; readonly after: readonly string[] }[] {
  return parts.flatMap((part) =>
    part.kind === "frame" ? [{ before: part.styles.before.map((sheet) => sheet.css), after: part.styles.after.map((sheet) => sheet.css) }] : [],
  );
}

test("a dice reply splits at its paragraphs, never inside a stylesheet", () => {
  const parts = framed(`${PANEL}\n\n${DICE}\n\nThe hall goes quiet.`);
  expect(runs(parts)).toEqual([PANEL, "The hall goes quiet."]);
  // Positive control: the stamp's paragraph is split out, native.
  expect(parts.map((part) => part.kind)).toEqual(["frame", "native", "frame"]);
});

test("a run after a split carries the stylesheet the run before it holds, and the run before carries the one after", () => {
  const parts = framed(`${PANEL}\n\n:::choices\n1. Go\n:::\n\n<style media="screen">.later{color:red}</style><b class="later">Later</b>`);
  expect(parts.flatMap((part) => (part.kind === "frame" ? [part.styles] : []))).toEqual([
    { before: [], after: [{ media: "screen", css: ".later{color:red}" }] },
    { before: [{ media: undefined, css: PANEL_CSS }], after: [] },
  ]);
});

test.each(["tierA", "tierB"] as const)("a marked card stays native at the row's %s tier, and no run carries its stylesheet", (cardTrust) => {
  const parts = framed(`${PANEL}\n\n${MARKED_CARD}\n\nShe waits.`, { cardTrust });
  expect(parts.map((part) => part.kind)).toEqual(["frame", "native", "frame"]);
  const card = parts[1];
  expect(card?.kind === "native" ? card.block : undefined).toEqual({ kind: "html-card", html: CARD_HTML, trust: cardTrust, origin: "fence", title: "Ledger" });
  expect(carried(parts).flatMap((run) => [...run.before, ...run.after])).not.toContain(".ledger{color:blue}");
});

test.each([
  ["inline code", "Use `<style>.run{display:none}</style>` to hide it."],
  ["a tilde code block", "~~~html\n<style>.run{display:none}</style>\n~~~"],
  ["an indented code block", "Like this:\n\n    <style>.run{display:none}</style>"],
])("a stylesheet shown as %s is carried into no other run", (_name, sample) => {
  const parts = framed(`${sample}\n\n${DICE}\n\n<style>.real{color:red}</style><b class="real">After.</b>`);
  // Positive control: the stylesheet the reply draws is carried.
  expect(carried(parts)).toEqual([
    { before: [], after: [".real{color:red}"] },
    { before: [], after: [] },
  ]);
});

test("a sheet repeated across runs is carried at its last copy only, and one with another media is its own sheet", () => {
  const repeated = '<style>.t{color:red}</style><b class="t">T</b>';
  const parts = framed(`${repeated}\n\n${DICE}\n\n<style media="print">.t{color:red}</style>Middle.\n\n${DICE}\n\n${repeated}`);
  expect(parts.flatMap((part) => (part.kind === "frame" ? [part.styles] : []))).toEqual([
    {
      before: [],
      after: [
        { media: "print", css: ".t{color:red}" },
        { media: undefined, css: ".t{color:red}" },
      ],
    },
    { before: [], after: [{ media: undefined, css: ".t{color:red}" }] },
    { before: [{ media: "print", css: ".t{color:red}" }], after: [] },
  ]);
});

// Layer order is fixed where a layer is first named: dropping the first copy of `first` would let `second` name its
// layers first and reverse them.
test("a sheet that names layers is carried at every copy, so the layer order stays where it was first named", () => {
  const first = "@layer base, theme; @layer theme{.l{color:red}}";
  const second = "@layer theme, base; @layer base{.l{color:blue}}";
  const parts = framed(`<style>${first}</style>A.\n\n${DICE}\n\n<style>${second}</style>B.\n\n${DICE}\n\n<style>${first}</style>C.`);
  expect(carried(parts)).toEqual([
    { before: [], after: [second, first] },
    { before: [first], after: [first] },
    { before: [first, second], after: [] },
  ]);
});

test("a reply whose runs would carry more than the budget renders plain whole, and says why", () => {
  const heavy = `<style>.h{content:"${"x".repeat(Math.ceil(REPLY_CARRY_BUDGET_CHARS / 3))}"}</style>Panel.`;
  const splits = (count: number): string => [heavy, ...Array.from({ length: count }, () => `${DICE}\n\nProse.`)].join("\n\n");
  expect(replyLayout([{ text: splits(4), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" })).toEqual({
    kind: "plain",
    reason: PLAIN_REPLY_REASON.carriedStylesOverBudget,
  });
  // Positive control: two splits carry the sheet twice, under the budget.
  expect(replyLayout([{ text: splits(2), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" }).kind).toBe("framed");
});

test("a lenient card is the reply's own markup and stays in its frame", () => {
  const lenient = '<div class="w">\n<p>One</p>\n<p>Two</p>\n</div>';
  const parts = framed(`${lenient}\n\nShe waits.`, { lenientHtml: true });
  expect(parts.map((part) => part.kind)).toEqual(["frame"]);
  expect(runs(parts)).toEqual([lenient, "\n\nShe waits."]);
});
