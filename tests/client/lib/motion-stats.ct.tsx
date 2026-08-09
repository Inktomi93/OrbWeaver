// CT: the dev CLS FLAGGER half of motion-stats.ts (task #32 item 4). A node test cannot reach this —
// there is no layout to shift and no `layout-shift` entry type outside a browser — so the browser tier
// IS the unit tier here.
//
// What is proven, in the order the module's header claims it:
//  1. a forced shift produces a console line naming the SHIFTED ELEMENT and its score (the whole point:
//     "CLS is 0.26" is not actionable, "[data-testid=cls-victim] moved 0px,200px" is);
//  2. an INPUT-ADJACENT shift is still reported — tagged, not dropped — while `__orb`-facing `cls` stays
//     0 and `observedCls` rises. This is the gap the flagger exists for: measured on the live shell, the
//     docked-panel toggle scored 0.207 of instability with every entry `hadRecentInput: true`, so the
//     CWV metric read ~0 through a full relayout per frame;
//  3. an UNEXPECTED shift (past the 500ms input window) counts toward `cls` and is tagged `unexpected`.
//
// The observers are module-global by design; CT gives each test a fresh browser context, so the totals
// start at zero per test (the `_ct-stories` header's own note).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { MotionShiftFlaggerStory } from "./_ct-stories.tsx";

/** The score the flagger prints — `shift 0.1234`. Hoisted: a regex literal inside a test body is a
 *  biome `useTopLevelRegex` error. */
const SCORE_RE = /shift 0\.\d{4}/u;

interface MotionRead {
  readonly cls: number;
  readonly observedCls: number;
  readonly shifts: readonly { readonly value: number; readonly hadRecentInput: boolean; readonly sources: readonly string[] }[];
}

/** Collect every console line the flagger emits. Attached BEFORE mount so nothing is missed. */
function captureClsLines(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[cls]")) {
      lines.push(text);
    }
  });
  return lines;
}

/** Reads the snapshot the STORY published (see its effect) — never a re-import, which would resolve a
 *  second module instance whose totals are always zero. */
function readMotion(page: Page): Promise<MotionRead> {
  // FABRICATION-OK: the probe slot the story writes; declared and read in this spec alone.
  return page.evaluate(() => (globalThis as unknown as { __motionRead: () => MotionRead }).__motionRead());
}

test("a forced shift is console-warned with the shifted element AND its score", async ({ mount, page }) => {
  const lines = captureClsLines(page);
  const component = await mount(<MotionShiftFlaggerStory />);

  await component.getByRole("button", { name: "shift now" }).click();
  // The observer delivers on a later task, so poll rather than read once.
  await expect.poll(() => lines.length, { intervals: [50, 100, 200, 400] }).toBeGreaterThan(0);

  const line = lines.join("\n");
  // Names WHO moved (the surface marker) and HOW FAR — a bare score would not be actionable.
  expect(line).toContain("[data-testid=cls-victim]");
  expect(line).toContain("moved 0px,200px");
  // …and carries a score, not just a label.
  expect(line).toMatch(SCORE_RE);
});

test("an INPUT-ADJACENT shift is reported but excluded from the CWV metric — the blindness the flagger closes", async ({ mount, page }) => {
  const lines = captureClsLines(page);
  const component = await mount(<MotionShiftFlaggerStory />);

  // Grown inside the click handler ⇒ within the 500ms input window ⇒ `hadRecentInput: true`.
  await component.getByRole("button", { name: "shift now" }).click();
  await expect.poll(() => lines.length, { intervals: [50, 100, 200, 400] }).toBeGreaterThan(0);

  expect(lines.join("\n")).toContain("input-adjacent (excluded from CLS)");

  const motion = await readMotion(page);
  // The spec metric is blind to it…
  expect(motion.cls).toBe(0);
  // …while the flagger's own total, and the attributed ring, are not.
  expect(motion.observedCls).toBeGreaterThan(0);
  expect(motion.shifts.some((s) => s.hadRecentInput && s.sources.some((src) => src.includes("cls-victim")))).toBe(true);
});

test("an UNEXPECTED shift (past the input window) counts toward CLS and is tagged so", async ({ mount, page }) => {
  const lines = captureClsLines(page);
  const component = await mount(<MotionShiftFlaggerStory />);

  // The growth lands 900ms after the click — outside the 500ms window, so the browser does NOT attribute
  // it to input. This is the async-data-arrival shape UI-Architecture §4.3 rule 7 bans.
  await component.getByRole("button", { name: "shift later" }).click();
  await expect.poll(() => lines.some((l) => l.includes("unexpected")), { intervals: [200, 300, 500, 800] }).toBe(true);

  const motion = await readMotion(page);
  expect(motion.cls).toBeGreaterThan(0);
});
