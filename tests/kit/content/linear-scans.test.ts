// A message body is model output: a long run of brackets or backticks must cost its length, not its square, and the
// scanners must keep reading links, code spans and dice stamps the way the patterns they replaced did.
// @subject packages/kit/src/content/index.ts

import { projectBodyForPreview, tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const BUDGET_MS = 1000;

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

test.each([
  ["a link keeps its label", "see [the docs](http://x.y) now", "see the docs now"],
  ["an image ref drops with its empty label", "![pic](http://x/y.png) after", "after"],
  ["a nested bracket is left as written", "[[nested]](u) and [a](b", "[[nested]](u) and [a](b"],
  ["a bracket pair with no target is prose", "[no link] (not)", "[no link] (not)"],
  ["an earlier open bracket joins the label up to the first close", "[ open and [real](u) end", "open and [real end"],
])("preview: %s", (_name, body, preview) => {
  expect(projectBodyForPreview(body)).toBe(preview);
});

test("preview: a long run of open brackets is read in linear time", () => {
  const body = "[".repeat(120_000);
  expect(elapsedMs(() => projectBodyForPreview(body))).toBeLessThan(BUDGET_MS);
});

const DICE = (label: string, total: number): { kind: "dice"; label: string; total: number; raw: string } => ({
  kind: "dice",
  label,
  total,
  raw: `[dice: ${label} → ${String(total)}]`,
});

test.each([
  ["a stamp between words", "roll [dice: 1d6 → 4] done", ["roll ", DICE("1d6", 4), " done"]],
  ["a stamp inside an inline code span stays text", "code `[dice: 1d6 → 4]` and [dice: 2d8+1 → 9]", ["code `[dice: 1d6 → 4]` and ", DICE("2d8+1", 9)]],
  ["a double-tick span hides its stamp", "``[dice: 1d6 → 4]`` then [dice: 1d6 → 2]", ["``[dice: 1d6 → 4]`` then ", DICE("1d6", 2)]],
])("dice stamps: %s", (_name, body, expected) => {
  const spans = tokenizeContent(body, { committed: true }).map((span) => (span.kind === "text" ? span.text : span));
  expect(spans).toEqual(expected);
});

test("dice stamps: runs of ticks that never close are read in linear time", () => {
  // Each run is shorter than the last, so no opener finds its own length again; the pattern retried every
  // shorter opener against the rest of the body.
  let body = "";
  for (let run = 700; run >= 1; run -= 1) {
    body += `${"`".repeat(run)}a`;
  }
  expect(elapsedMs(() => tokenizeContent(body, { committed: true }))).toBeLessThan(BUDGET_MS);
});
