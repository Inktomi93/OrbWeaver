// The find-pattern editor reflows at enlarged text: a long pattern wraps inside the field, so the editor's scroller
// never scrolls sideways on a phone at the browser's 300% text size (WCAG 1.4.10 reflow).
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { REGEX_FIND_PATTERN_NAME } from "#client/features/regex/lib/regex-names.ts";
import type { RegexMemberSaveStory } from "./_member-save-stories.tsx";

const STORY = "tests/client/features/regex/surfaces/_member-save-stories/RegexMemberSaveStory";
// Several times wider than a phone's field at 300% text, so only the editor's own wrapping can keep it inside the field.
const LONG_PATTERN = `/${"(?:out-of-character-aside|bracketed-stage-direction)|".repeat(6)}narration/gi`;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a long find pattern wraps at 300% text and the editor does not scroll sideways", async ({ mount, page, browserName }) => {
  test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
  await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const script = await caller.regex.createScript({ input: { name: "Reflow witness", findRegex: LONG_PATTERN, replaceString: "", placement: ["AI_OUTPUT"] } });
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.updateScript"]));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: script.id });
  const field = page.getByRole("textbox", { name: REGEX_FIND_PATTERN_NAME, exact: true });
  await expect(field).toContainText("narration");
  const scroller = page.locator(".cm-scroller");
  const reach = await scroller.evaluate((element) => ({ visible: element.clientWidth, content: element.scrollWidth }));
  expect(reach.visible).toBeGreaterThan(0);
  expect(reach.content).toBeLessThanOrEqual(reach.visible + LAYOUT_SUBPIXEL_PX);
  // Positive control: the pattern is long enough to fill more than one line, so the bound above is wrapping's doing.
  const rows = await field.locator(".cm-line").evaluate((line) => line.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(line).lineHeight));
  expect(rows).toBeGreaterThan(1.5);
});
