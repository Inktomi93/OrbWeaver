// An unclosed registered hidden open runs to the end of the body for members; the model wire and the host render keep it.
// @subject packages/kit/src/content/index.ts

import { contentSpanRaw, projectBodyForPreview, projectBodyForSummary, scanHiddenSpans, stripHiddenSpans, tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const LEAD = "A cut reply. ";
const WHOLE_TAG = '<lie character="Witness" truth="the ledger"/>';
const SECRET_LETTERS = "ledger";

/** Every prefix of a whole tag that a stop can leave behind once its name has arrived. */
const cuts = Array.from({ length: WHOLE_TAG.length - "<lie".length }, (_, index) => WHOLE_TAG.slice(0, "<lie".length + index));

test.each(cuts)("an open cut at %j is hidden from members to the end of the body", (cut) => {
  const body = LEAD + cut;
  expect(stripHiddenSpans(body)).toEqual({ content: LEAD, hadHidden: true });
  expect(projectBodyForSummary(body)).toBe(LEAD);
  expect(projectBodyForPreview(body)).toBe(LEAD.trim());
  expect(scanHiddenSpans(body)).toHaveLength(1);
});

test.each(cuts)("an open cut at %j stays literal on the render and wire grammar", (cut) => {
  const body = LEAD + cut;
  const spans = tokenizeContent(body, { committed: true });
  expect(spans.map((span) => span.kind)).toEqual(["text"]);
  expect(spans.map(contentSpanRaw).join("")).toBe(body);
});

test.each([
  ["a comparison", "if a < b then"],
  ["a bare trailing bracket", "more to say <"],
  ["a closing tag", "</lie"],
  ["a shorter name", "she said <li"],
  ["a longer name", 'she said <lied truth="x'],
  ["an unregistered open", '<div class="unclosed'],
  ["a malformed registered tag", "<lie down on the bed"],
])("%s stays prose", (_name, body) => {
  expect(stripHiddenSpans(body)).toEqual({ content: body, hadHidden: false });
  expect(projectBodyForSummary(body)).toBe(body);
});

test("an open that swallows a code fence delimiter conceals past it", () => {
  const body = `${LEAD}<lie truth="${SECRET_LETTERS}\n\`\`\`\nstill the attr value`;
  expect(stripHiddenSpans(body).content).toBe(LEAD);
  expect(projectBodyForSummary(body)).toBe(LEAD);
  expect(projectBodyForPreview(body)).toBe(LEAD.trim());
});

test("a code block is no shelter: a tag inside one strips, and an open inside one conceals the rest", () => {
  const closed = `\`\`\`\n<lie truth="${SECRET_LETTERS}"/>\n\`\`\`\nafter`;
  expect(stripHiddenSpans(closed)).toEqual({ content: "```\n\n```\nafter", hadHidden: true });
  const open = `\`\`\`\n<lie truth="${SECRET_LETTERS}\n\`\`\`\nafter`;
  expect(stripHiddenSpans(open)).toEqual({ content: "```\n", hadHidden: true });
  expect(projectBodyForSummary(open)).not.toContain(SECRET_LETTERS);
  expect(projectBodyForPreview(open)).not.toContain(SECRET_LETTERS);
});

test("the render and the wire grammar still show a code block's tag as written", () => {
  const body = `\`\`\`\n<lie truth="${SECRET_LETTERS}"/>\n\`\`\``;
  expect(tokenizeContent(body, { committed: true })).toEqual([{ kind: "text", text: body }]);
});

test("an unclosed open inside a card still leaves the fence bytes around it", () => {
  const body = `:::card title="Terminal"\nA line.\n<lie truth="${SECRET_LETTERS}`;
  expect(stripHiddenSpans(body).content).toBe(':::card title="Terminal"\nA line.\n');
  expect(projectBodyForSummary(body)).not.toContain(SECRET_LETTERS);
  expect(projectBodyForPreview(body)).not.toContain(SECRET_LETTERS);
});

test("a closed span before an open one is stripped with it", () => {
  const body = `Before. ${WHOLE_TAG} Between. <ofilter reason="${SECRET_LETTERS}`;
  expect(stripHiddenSpans(body).content).toBe("Before.  Between. ");
});
