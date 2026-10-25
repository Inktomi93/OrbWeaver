// A cascade layer ranks by its first appearance in the document, so the order @orb/ui declares holds only when its
// entry, or the order file itself, loads before any sheet that opens a layer (client-architecture-lockdown.md §4.5).
// The build may fold the ordering statement into block order, so the served order is read from first appearances,
// through the real CSS door.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { MotionFloorStory } from "./_motion-floor-stories.tsx";

const STORY = "tests/ui/styles/_motion-floor-stories/MotionFloorStory";
const LAYER_ORDER_FILE = new URL("../../../packages/ui/src/styles/layers.css", import.meta.url);

function declaredLayerOrder(): readonly string[] {
  const statement = /^@layer ([a-z, ]+);/mu.exec(readFileSync(LAYER_ORDER_FILE, "utf8"));
  if (!statement?.[1]) {
    throw new Error("layers.css declares no @layer order");
  }
  return statement[1].split(",").map((name) => name.trim());
}

// Runs in the browser: no closure over node-side values.
function servedLayerOrder(): readonly string[] {
  const seen: string[] = [];
  const note = (name: string): void => {
    if (!seen.includes(name)) {
      seen.push(name);
    }
  };
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSLayerStatementRule) {
        rule.nameList.forEach(note);
      } else if (rule instanceof CSSLayerBlockRule) {
        note(rule.name);
      }
    }
  }
  return seen;
}

test("the house layers are served in the order the ui entry declares", async ({ mount, page }) => {
  const declared = declaredLayerOrder();
  await mount<typeof MotionFloorStory>(STORY, {});
  const served = await page.evaluate(servedLayerOrder);
  expect(served.filter((name) => declared.includes(name))).toEqual(declared);
});
