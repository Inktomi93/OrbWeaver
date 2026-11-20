// A styled reply splits into frame runs around what must stay native (D354): a dice paragraph, a choices set, media and
// a marked card. A blank line inside a display script's `<style>` is no paragraph break, a marked card keeps its own
// block at the row's tier while a lenient one stays in the reply's frame, and every run carries the reply's other runs'
// stylesheets, the last copy of a repeated one only and every copy of a layered one, while a native card carries none.
// Past the carry budget the whole reply takes the plain path. One run's carry stays under the frame's own bound, which
// sits under the mint's markup cap, so a long room's carry never refuses a mint, and each run names the room sheets'
// authors for its mint.
// @subject packages/client/src/features/chat/lib/reply-parts.ts

import { PLAIN_REPLY_REASON } from "@orb/client/lib";
import type { CardTrust } from "@orb/contracts/chat";
import { CARD_FRAME_CARRIED_AUTHORS_MAX, CARD_FRAME_HTML_MAX_CHARS } from "@orb/contracts/chat";
import type { FrameStyleSheet } from "@orb/kit/content";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ReplyPart } from "#client/features/chat/lib/reply-parts.ts";
import {
  carriedRoomSheets,
  formingParts,
  REPLY_CARRY_BUDGET_CHARS,
  REPLY_CARRY_BUDGET_SHEETS,
  REPLY_FRAME_CARRY_BUDGET_CHARS,
  replyLayout,
} from "#client/features/chat/lib/reply-parts.ts";

// The room's sheets as `carriedRoomSheets` reads them; `room-sheets.test.ts` proves which rows contribute them.
type RoomSheet = Parameters<typeof carriedRoomSheets>[0][number];

const ids = createSeededIds();
const keeperId = mintTypeId(ID_PREFIX.character, ids.next);
const guardId = mintTypeId(ID_PREFIX.character, ids.next);

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

// Each frame run's carried sheets: those it draws above its body and those below.
function sides(parts: readonly ReplyPart[]): readonly { readonly before: readonly FrameStyleSheet[]; readonly after: readonly FrameStyleSheet[] }[] {
  return parts.flatMap((part) =>
    part.kind === "frame" ? [{ before: part.styles.sheets.slice(0, part.styles.own.start), after: part.styles.sheets.slice(part.styles.own.end) }] : [],
  );
}

function carried(parts: readonly ReplyPart[]): readonly { readonly before: readonly string[]; readonly after: readonly string[] }[] {
  return sides(parts).map((run) => ({ before: run.before.map((sheet) => sheet.css), after: run.after.map((sheet) => sheet.css) }));
}

function splitBy(count: number, run: (index: number) => string): string {
  return Array.from({ length: count }, (_, index) => run(index)).join(`\n\n${DICE}\n\n`);
}

test("a dice reply splits at its paragraphs, never inside a stylesheet", () => {
  const parts = framed(`${PANEL}\n\n${DICE}\n\nThe hall goes quiet.`);
  expect(runs(parts)).toEqual([PANEL, "The hall goes quiet."]);
  // Positive control: the stamp's paragraph is split out, native.
  expect(parts.map((part) => part.kind)).toEqual(["frame", "native", "frame"]);
});

test("a run after a split carries the stylesheet the run before it holds, and the run before carries the one after", () => {
  const parts = framed(`${PANEL}\n\n:::choices\n1. Go\n:::\n\n<style media="screen">.later{color:red}</style><b class="later">Later</b>`);
  expect(sides(parts)).toEqual([
    { before: [], after: [{ media: "screen", title: undefined, css: ".later{color:red}" }] },
    { before: [{ media: undefined, title: undefined, css: PANEL_CSS }], after: [] },
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
  expect(sides(parts)).toEqual([
    {
      before: [],
      after: [
        { media: "print", title: undefined, css: ".t{color:red}" },
        { media: undefined, title: undefined, css: ".t{color:red}" },
      ],
    },
    { before: [], after: [{ media: undefined, title: undefined, css: ".t{color:red}" }] },
    { before: [{ media: "print", title: undefined, css: ".t{color:red}" }], after: [] },
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

// A sheet each run may carry on its own, so only the runs' total passes a budget.
const UNDER_FRAME_BOUND = Math.floor(REPLY_FRAME_CARRY_BUDGET_CHARS / 2);
const RUNS_PAST_REPLY_BUDGET = Math.ceil(REPLY_CARRY_BUDGET_CHARS / UNDER_FRAME_BOUND) + 1;

test("a reply whose runs would carry more than the budget renders plain whole, and says why", () => {
  const heavy = `<style>.h{content:"${"x".repeat(UNDER_FRAME_BOUND)}"}</style>Panel.`;
  const splits = (count: number): string => [heavy, ...Array.from({ length: count }, () => `${DICE}\n\nProse.`)].join("\n\n");
  expect(replyLayout([{ text: splits(RUNS_PAST_REPLY_BUDGET), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" })).toEqual({
    kind: "plain",
    reason: PLAIN_REPLY_REASON.carriedStylesOverBudget,
  });
  // Positive control: two splits carry the sheet twice, under the budget.
  expect(replyLayout([{ text: splits(2), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" }).kind).toBe("framed");
});

test("one run that would carry past the frame's bound renders the reply plain whole, though the reply's total fits", () => {
  const sheet = (chars: number): string => `<style>.h{content:"${"x".repeat(chars)}"}</style>Panel.`;
  const reply = (chars: number): string => [sheet(chars), `${DICE}\n\nProse.`].join("\n\n");
  expect(replyLayout([{ text: reply(REPLY_FRAME_CARRY_BUDGET_CHARS), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" })).toEqual({
    kind: "plain",
    reason: PLAIN_REPLY_REASON.carriedStylesOverBudget,
  });
  // Positive control: the same reply a little lighter frames, and the bound is a quarter of the mint's markup cap.
  expect(replyLayout([{ text: reply(UNDER_FRAME_BOUND), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" }).kind).toBe("framed");
  expect(REPLY_FRAME_CARRY_BUDGET_CHARS * 4).toBeLessThanOrEqual(CARD_FRAME_HTML_MAX_CHARS);
});

test("a lenient card is the reply's own markup and stays in its frame", () => {
  const lenient = '<div class="w">\n<p>One</p>\n<p>Two</p>\n</div>';
  const parts = framed(`${lenient}\n\nShe waits.`, { lenientHtml: true });
  expect(parts.map((part) => part.kind)).toEqual(["frame"]);
  expect(runs(parts)).toEqual([lenient, "\n\nShe waits."]);
});

// Text alone cannot bound the carry: an empty or tiny sheet costs another run's document an element all the same.
test("a reply of many runs, each with a small sheet of its own, renders plain whole on the sheet count", () => {
  const runCount = Math.ceil(Math.sqrt(REPLY_CARRY_BUDGET_SHEETS)) + 1;
  const reply = splitBy(runCount, (index) => `<style>.r${String(index)}{}</style>Run.`);
  expect(replyLayout([{ text: reply, tokens: undefined }], { lenientHtml: false, cardTrust: "tierB" })).toEqual({
    kind: "plain",
    reason: PLAIN_REPLY_REASON.carriedStylesOverBudget,
  });
  // Positive control: the same reply's text alone is far under the character budget.
  expect(reply.length).toBeLessThan(REPLY_CARRY_BUDGET_CHARS / runCount);
});

test("every run of a reply shares one list of the carried sheets, each run marking only its own", () => {
  const parts = framed(splitBy(3, (index) => `<style>.s${String(index)}{}</style>Run.`));
  const lists = parts.flatMap((part) => (part.kind === "frame" ? [part.styles] : []));
  expect(lists.map((styles) => styles.sheets.map((sheet) => sheet.css))).toEqual([
    [".s0{}", ".s1{}", ".s2{}"],
    [".s0{}", ".s1{}", ".s2{}"],
    [".s0{}", ".s1{}", ".s2{}"],
  ]);
  expect(new Set(lists.map((styles) => styles.sheets)).size).toBe(1);
  expect(lists.map((styles) => styles.own)).toEqual([
    { start: 0, end: 1 },
    { start: 1, end: 2 },
    { start: 2, end: 3 },
  ]);
});

test.each([
  ["a type that names another language", '<style type="text/less">.x{}</style>', []],
  ["a type in another case, with spaces", '<style type=" Text/CSS ">.x{}</style>', [".x{}"]],
  ["an empty type", '<style type="">.x{}</style>', [".x{}"]],
  ["no type", "<style>.x{}</style>", [".x{}"]],
])("a sheet with %s is carried only when a browser applies it as CSS", (_name, sheet, expected) => {
  expect(carried(framed(`${sheet}A.\n\n${DICE}\n\nB.`))).toEqual([
    { before: [], after: [] },
    { before: expected, after: [] },
  ]);
});

// In one document the first titled sheet names the preferred set, and a sheet under another title is an alternate the
// document leaves off.
test("a titled sheet is carried only under the reply's first title, and an untitled one always", () => {
  const reply = splitBy(
    4,
    (index) =>
      ['<style title="Day">.day{}</style>', '<style title="Night">.night{}</style>', "<style>.plain{}</style>", '<style title="Day">.day2{}</style>'][index] ??
      "",
  );
  expect(sides(framed(reply)).at(-1)?.before).toEqual([
    { media: undefined, title: "Day", css: ".day{}" },
    { media: undefined, title: undefined, css: ".plain{}" },
  ]);
});

// A carried sheet is written as raw text into another run's document, so its text must hold no close HTML ends a
// style element at, or what follows the close would run there as markup.
const HTML_STYLE_CLOSE_RE = /<\/style[\t\n\f\r />]/iu;

test.each([
  ["an uppercase close", "</STYLE>"],
  ["a close with a tab", "</style\t>"],
  ["a close with a form feed", "</style\f>"],
  ["a close with a slash", "</style/>"],
  ["a close with a newline", "</style\n>"],
  ["a close with a no-break space", `</style${String.fromCodePoint(0xa0)}>`],
])("no script reaches another run past %s", (_name, close) => {
  const parts = framed(`<style>.a{}${close}<script>alert(1)</script><b>A.</b>\n\n${DICE}\n\nB.`);
  const sheets = sides(parts).flatMap((run) => [...run.before, ...run.after]);
  // Positive control: the sheet is carried, as far as its close.
  expect(sheets.map((sheet) => sheet.css.slice(0, ".a{}".length))).toEqual([".a{}"]);
  expect(sheets.filter((sheet) => HTML_STYLE_CLOSE_RE.test(sheet.css) || sheet.css.includes("<script"))).toEqual([]);
});

const roomSheet = (css: string, authorId: CharacterId = keeperId): RoomSheet => ({ media: undefined, title: undefined, css, authorId });

test("a reply carries only the room's sheets naming a class its prose markup uses, the last copy of a repeat", () => {
  const room = [roomSheet(".mark{color:red}"), roomSheet(".other{}"), roomSheet("@media (width > 1px){.mark b{}}"), roomSheet(".mark{color:red}")];
  const text = 'Prose with a <span class="mark">marked</span> word and `<b class="other">code</b>`.';
  expect(carriedRoomSheets(room, text, { lenientHtml: false }).map((sheet) => sheet.css)).toEqual(["@media (width > 1px){.mark b{}}", ".mark{color:red}"]);
  // Positive control: the class in code names the other sheet once it is prose.
  expect(carriedRoomSheets(room, '<b class="other">x</b>', { lenientHtml: false }).map((sheet) => sheet.css)).toEqual([".other{}"]);
  expect(carriedRoomSheets(room, "No markup at all.", { lenientHtml: false })).toEqual([]);
});

test("the room's sheets ride every run ahead of the reply's own", () => {
  const room = [roomSheet(".mark{}")];
  const layout = replyLayout([{ text: `<style>.own{}</style>A.\n\n${DICE}\n\nB.`, tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room });
  if (layout.kind !== "framed") {
    throw new Error(`expected a framed reply, got the plain path: ${layout.reason}`);
  }
  expect(carried(layout.parts)).toEqual([
    { before: [".mark{}"], after: [] },
    { before: [".mark{}", ".own{}"], after: [] },
  ]);
});

test("a room sheet the reply repeats rides once, as the reply's own, and a layered one at both copies", () => {
  const room = [roomSheet(".mark{}"), roomSheet("@layer base{.mark{}}"), roomSheet(".other{}")];
  const layout = replyLayout([{ text: `<style>.mark{}</style><style>@layer base{.mark{}}</style>A.\n\n${DICE}\n\nB.`, tokens: undefined }], {
    lenientHtml: false,
    cardTrust: "tierB",
    room,
  });
  if (layout.kind !== "framed") {
    throw new Error(`expected a framed reply, got the plain path: ${layout.reason}`);
  }
  expect(carried(layout.parts).at(-1)?.before).toEqual(["@layer base{.mark{}}", ".other{}", ".mark{}", "@layer base{.mark{}}"]);
});

test("a room sheet past the carry budget across the reply's runs renders the reply plain whole", () => {
  const room = [roomSheet(`.mark{content:"${"x".repeat(UNDER_FRAME_BOUND)}"}`)];
  const splits = (count: number): string => ["A.", ...Array.from({ length: count }, () => `${DICE}\n\nProse.`)].join("\n\n");
  expect(replyLayout([{ text: splits(RUNS_PAST_REPLY_BUDGET), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room })).toEqual({
    kind: "plain",
    reason: PLAIN_REPLY_REASON.carriedStylesOverBudget,
  });
  // Positive control: two runs carry the room's sheet twice, under the budget.
  expect(replyLayout([{ text: splits(1), tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room }).kind).toBe("framed");
});

// A long room where the model rewrites its panel stylesheet every turn: each reply the character wrote holds a distinct
// sheet naming the panel class, so every later reply using that class carries all of them.
const PANEL_SHEET_CHARS = 2800;
const LONG_ROOM_ROWS = 300;
const PANEL_REPLY = '<div class="panel">HP 10</div>\n\nThe hall waits.';

function longRoom(rows: number): readonly RoomSheet[] {
  return Array.from({ length: rows }, (_, index) => roomSheet(`.panel{--turn:${String(index)};content:"${"x".repeat(PANEL_SHEET_CHARS)}"}`));
}

// What one room length draws: plain with its reason, or framed with how many sheets and characters its run carries.
function longRoomOutcome(rows: number): { readonly plain: string } | { readonly sheets: number; readonly chars: number } {
  const room = carriedRoomSheets(longRoom(rows), PANEL_REPLY, { lenientHtml: false });
  const layout = replyLayout([{ text: PANEL_REPLY, tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room });
  if (layout.kind === "plain") {
    return { plain: layout.reason };
  }
  const run = layout.parts.find((part) => part.kind === "frame");
  const others = run?.kind === "frame" ? run.styles.sheets.filter((_, index) => index < run.styles.own.start || index >= run.styles.own.end) : [];
  return { sheets: others.length, chars: others.reduce((sum, sheet) => sum + sheet.css.length, 0) };
}

test("on a long room a reply's carry stays under the frame's bound, and past it the reply is plain with its reason", () => {
  const outcomes = [10, 60, LONG_ROOM_ROWS].map(longRoomOutcome);
  // The shorter rooms frame and carry every sheet they name; the long one would carry past the bound.
  expect(outcomes).toEqual([
    { sheets: 10, chars: expect.any(Number) },
    { sheets: 60, chars: expect.any(Number) },
    { plain: PLAIN_REPLY_REASON.carriedStylesOverBudget },
  ]);
  expect(outcomes.flatMap((outcome) => ("chars" in outcome && outcome.chars > REPLY_FRAME_CARRY_BUDGET_CHARS ? [outcome] : []))).toEqual([]);
});

test("each run names the room sheets' authors once, and a carry from more authors than a mint names renders plain", () => {
  const room = [roomSheet(".mark{}", keeperId), roomSheet(".mark b{}", guardId), roomSheet(".mark i{}", keeperId)];
  const split = replyLayout([{ text: `<b class="mark">A.</b>\n\n${DICE}\n\nB.`, tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room });
  if (split.kind !== "framed") {
    throw new Error(`expected a framed reply, got the plain path: ${split.reason}`);
  }
  expect(split.parts.flatMap((part) => (part.kind === "frame" ? [part.styles.authors] : []))).toEqual([
    [keeperId, guardId],
    [keeperId, guardId],
  ]);
  const crowd = Array.from({ length: CARD_FRAME_CARRIED_AUTHORS_MAX + 1 }, (_, index) =>
    roomSheet(`.mark{--n:${String(index)}}`, mintTypeId(ID_PREFIX.character, ids.next)),
  );
  expect(replyLayout([{ text: "A.", tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room: crowd })).toEqual({
    kind: "plain",
    reason: PLAIN_REPLY_REASON.carriedStylesOverBudget,
  });
  // Positive control: one author fewer frames.
  expect(replyLayout([{ text: "A.", tokens: undefined }], { lenientHtml: false, cardTrust: "tierB", room: crowd.slice(1) }).kind).toBe("framed");
});

test("a streaming panel that would carry past the frame's bound holds as forming markup, and a lighter one draws", () => {
  const panel = '<div class="panel">\nHP 10\n</div>\n\nThe hall waits.\n';
  const heavy = [roomSheet(`.panel{content:"${"x".repeat(REPLY_FRAME_CARRY_BUDGET_CHARS)}"}`, guardId)];
  expect(formingParts(panel, heavy).map((part) => part.kind)).toContain("forming-markup");
  const light = formingParts(panel, [roomSheet(".panel{}", guardId)]).find((part) => part.kind === "panel");
  expect(light?.kind === "panel" ? light.styles.authors : undefined).toEqual([guardId]);
});
