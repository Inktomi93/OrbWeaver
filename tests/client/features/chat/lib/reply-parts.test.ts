// A styled reply that carries a dice stamp splits its frame run at paragraphs, so the stamp's chip stays a live
// control (D354). A blank line inside a display script's `<style>` is no paragraph break: the stylesheet stays whole in
// one run, and none of it lands in a run of its own.
// @subject packages/client/src/features/chat/lib/reply-parts.ts

import { expect, test } from "@orb/testkit/node";
import { replyParts } from "#client/features/chat/lib/reply-parts.ts";

const PANEL = [
  '<div class="hud"><style>.hud{display:block}',
  "",
  ".hud b{font-weight:600}",
  "",
  "/* Order check */ .hud summary{color:red}",
  '</style><details class="hud"><summary>Tracker</summary></details></div>',
].join("\n");

test("a dice reply splits at its paragraphs, never inside a stylesheet", () => {
  const parts = replyParts([{ text: `${PANEL}\n\nShe rolls. [dice: d20 → 15]\n\nThe hall goes quiet.`, tokens: undefined }], { lenientHtml: false });
  const runs = parts.flatMap((part) =>
    part.kind === "frame" ? part.segments.map((segment) => (segment.kind === "markdown" ? segment.markdown : segment.html)) : [],
  );
  expect(runs).toEqual([PANEL, "The hall goes quiet."]);
  // Positive control: the stamp's paragraph is split out, native.
  expect(parts.map((part) => part.kind)).toEqual(["frame", "native", "frame"]);
});
