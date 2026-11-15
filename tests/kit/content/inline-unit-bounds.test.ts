// An inline code span and a comment opened mid-line run only within their own block, as a Markdown renderer reads
// them: a span or comment whose close sits past a block start is no span or comment, so a panel after its opener is
// still an element. The frame's lift and the inert strip read it through the one reader, so both take its stylesheet.
// @subject packages/kit/src/content/index.ts

import { liftRawTextBodies, stripStyleElements } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const MARK = "\u{E000}";
const CSS = ".hud{FLATCSS:1}";
const PANEL = `<div class="hud"><style>${CSS}</style><b>Tracker</b></div>`;

test.each([
  ["a span opened in prose and closed after a panel line", `She says \`hi.\n${PANEL}\nThen \`x\` appears.`],
  ["a span opened in a heading", `# Status \`ok\n${PANEL}\nmore \`x\``],
  ["a span opened in a quote and closed after it", `> she says \`hi\n> ${PANEL}\nThen \`x\``],
  ["a span opened in an HTML block's own text", `<div class="hud">Press \`Enter\n<style>${CSS}</style>\nto go\`</div>`],
  ["a comment opened mid-line and closed after a panel", `She waits <!-- note\n${PANEL}\n-->`],
  ["a comment opened mid-line and closed past a blank line", `She waits <!-- note\n\n${PANEL}\n\n-->`],
  ["a comment opened in an HTML block and closed in a later one", `<div>a <!-- x</div>\n\n${PANEL}\n\n<p>-->`],
])("the lift and the strip take the stylesheet past %s", (_name, body) => {
  expect(liftRawTextBodies(body, MARK).bodies).toEqual([CSS]);
  expect(stripStyleElements(body)).not.toContain(CSS);
});

test.each([
  ["a span within one paragraph's lines", `Use \`a\nthen <style>${CSS}</style>\` here.`],
  ["a span in a list item's continued line", `- use \`a\n  then <style>${CSS}</style>\` here`],
  ["a comment within one paragraph's lines", `She waits <!-- a\nthen <style>${CSS}</style> --> b`],
  ["a comment that opens its own block, across a blank line", `<!-- a\n\n<style>${CSS}</style>\n-->`],
])("a unit within its block still holds the sample: %s", (_name, body) => {
  expect(liftRawTextBodies(body, MARK).bodies).toEqual([]);
  expect(stripStyleElements(body)).toContain(CSS);
});
