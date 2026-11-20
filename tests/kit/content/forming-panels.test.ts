// A reply still streaming draws a held unit only once its bytes are final: every block in it closed and prose after it.
// The prefix case is the invariant the streaming frame rests on: a panel any prefix reports is byte-identical to the
// panel the whole reply reports, so a drawn panel never changes under append and half-written markup never draws.
// @subject packages/kit/src/content/index.ts
import type { FormingPanelSegment } from "@orb/kit/content";
import { scanFormingPanels, scanStyledHold } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const BANNER = '<div class="banner" style="padding:4px">\n<b>Camelot</b>\n</div>\n';
const STYLED_PANEL = '<style>.hud b{color:red}</style>\n<div class="hud">\n\n<b>HP 10</b>\n</div>\n';
const REPLY = `She looks up.\n\n${BANNER}\nThe hall waits.\n\n${STYLED_PANEL}\nHe bows.\n`;

function panels(segments: readonly FormingPanelSegment[]): readonly string[] {
  return segments.flatMap((segment) => (segment.kind === "panel" ? [segment.markup] : []));
}

test("each closed unit with prose after it is a panel carrying its bytes, and the hold reads the same units", () => {
  const segments = scanFormingPanels(REPLY);
  expect(segments.map((segment) => segment.kind)).toEqual(["text", "panel", "text", "panel", "text"]);
  expect(panels(segments)).toEqual([BANNER, STYLED_PANEL]);
  // The hold reads the same units, each held with no bytes.
  expect(scanStyledHold(REPLY).map((segment) => segment.kind)).toEqual(["text", "forming-markup", "text", "forming-markup", "text"]);
});

const STILL_FORMING = {
  "an element whose close has not arrived": `She looks up.\n\n<div class="banner">\n<b>Camelot</b>\n`,
  "a close tag cut mid-name": `She looks up.\n\n<div class="banner">\n<b>Camelot</b>\n</di`,
  "a closed unit with nothing after it": `She looks up.\n\n${BANNER}`,
  "a closed unit with only a blank line after it": `She looks up.\n\n${BANNER}\n`,
  "a closed unit with only a line still arriving after it": `She looks up.\n\n${BANNER}\nThe hall`,
  "a stylesheet whose panel has not closed": `She looks up.\n\n<style>.hud b{color:red}</style>\n<div class="hud">\n<b>HP`,
} as const;

for (const [name, text] of Object.entries(STILL_FORMING)) {
  test(`${name} stays forming and carries no bytes`, () => {
    const segments = scanFormingPanels(text);
    expect(panels(segments)).toEqual([]);
    expect(segments.filter((segment) => segment.kind === "forming-markup")).toHaveLength(1);
    // Positive control: the same text with prose after a complete unit draws.
    expect(panels(scanFormingPanels(`She looks up.\n\n${BANNER}\nThe hall waits.\n`))).toHaveLength(1);
  });
}

test("markup in a code block is prose, never a panel", () => {
  expect(scanFormingPanels(`Here:\n\n\`\`\`html\n${BANNER}\`\`\`\n\nDone.`).map((segment) => segment.kind)).toEqual(["text"]);
});

test("every panel a prefix of the reply reports is byte-identical to the whole reply's, at every cut", () => {
  const whole = panels(scanFormingPanels(REPLY));
  let drawn = 0;
  for (let cut = 0; cut <= REPLY.length; cut += 1) {
    const prefix = panels(scanFormingPanels(REPLY.slice(0, cut)));
    expect(prefix, `cut ${String(cut)}`).toEqual(whole.slice(0, prefix.length));
    drawn = Math.max(drawn, prefix.length);
  }
  // Positive control: the prefixes drew both panels before the reply ended.
  expect(drawn).toBe(whole.length);
});
