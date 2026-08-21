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
//  3. an UNEXPECTED shift (past the 500ms input window) counts toward `cls` and is tagged `unexpected`;
//  4. a VIRTUALIZED shift (issue #109) moves `cls`/`observedCls`/`virtualizedCls` but leaves
//     `nonVirtualizedCls` — the total motion-audit's budget gates on — at zero.
//
// The observers are module-global by design; CT gives each test a fresh browser context, so the totals
// start at zero per test (the `_ct-stories` header's own note).
//
// TWO TIMING LAWS THIS FILE OBEYS (issue #121 — the flake this file carried until 2026-08-17):
//
//  A. A SHIFT NEEDS A PRESENTED "BEFORE". `layout-shift` is a DELTA: the browser emits an entry only when
//     an element that was already PAINTED moves. Measured control (a two-arm probe in this exact CT
//     chromium): growing the spacer in the same frame as the victim's first paint produced **0** entries;
//     doing it after two presented animation frames produced **1**. So a trigger that fires before the
//     stage's first paint yields NO evidence AT ALL — not late evidence — and every poll below can only
//     run out its budget. `locator.click()` hides this by accident: its actionability check waits for two
//     stable animation frames, which IS the barrier. `locator.evaluate(el => el.click())` — which the
//     agent-navigation arm must use, because a TRUSTED input event would set `hadRecentInput` and prove the
//     opposite of that test's name — performs no such wait, so that one arm barriers explicitly
//     (`settlePaint`). This is the only test in the file that can lose the evidence outright.
//
//  B. THE DEFAULT POLL SCHEDULE FORFEITS THE TAIL OF ITS OWN BUDGET. Playwright's `pollAgainstDeadline`
//     (playwright-core/lib/coreBundle.js) repeats the LAST interval forever AND breaks out early when the
//     next interval would cross the deadline — so the default `[100, 250, 500, 1000]` stops probing at
//     ~3.85s of a 5s expect timeout and never samples the last 1.15s. It also MUTATES the array it is
//     handed (`pop()` + `shift()`), so a shared module-level `intervals` array is drained by its first use
//     and every later poll silently falls back to 1000ms. Hence ONE schedule, minted fresh per call
//     (`evidencePoll()`), with a fine tail and a stated budget — never the inherited default.

import { setTimeout as delay } from "node:timers/promises";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { loafOverBudget, loafTotals } from "../../../scripts/probes/motion-audit.ts";
import { MotionAnchoredPortalStory, MotionShiftFlaggerStory, MotionVirtualizedShiftStory } from "./_ct-stories.tsx";

/** The score the flagger prints — `shift 0.1234`. Hoisted: a regex literal inside a test body is a
 *  biome `useTopLevelRegex` error. */
const SCORE_RE = /shift 0\.\d{4}/u;

/** The budget for browser-delivered evidence. Measured under a 1120-test / 24-worker CT run, the
 *  agent-driven shift landed in 34–135ms — so this is ~70× the observed worst case, and a run that spends
 *  it has lost the evidence (law A), not merely been slow. Well under the 30s test timeout. */
const EVIDENCE_TIMEOUT_MS = 10_000;

/** The ONE poll schedule this file uses — a NEW object every call, because the poll loop mutates the
 *  interval array it is given (header law B). The tail is fine (250ms) so the deadline-crossing break
 *  forfeits a quarter-second instead of the default's 1.15s. */
function evidencePoll(): { intervals: number[]; timeout: number } {
  return { intervals: [50, 100, 200, 250], timeout: EVIDENCE_TIMEOUT_MS };
}

/** Two PRESENTED animation frames — the same barrier `locator.click()`'s actionability check applies, made
 *  explicit for the one arm that cannot use a real click (header law A). */
function settlePaint(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

interface MotionRead {
  readonly loafs: readonly {
    readonly startTime: number;
    readonly duration: number;
    readonly blockingDuration: number;
    readonly styleAndLayoutStart: number;
    readonly scripts: readonly { readonly sourceURL: string; readonly duration: number }[];
    readonly selectEntrance?: {
      readonly id: number;
      readonly startedAt: number;
      readonly confirmedAt?: number;
      readonly endedAt?: number;
      readonly firstForTrigger: boolean;
    };
  }[];
  readonly cls: number;
  readonly observedCls: number;
  readonly virtualizedCls: number;
  readonly nonVirtualizedCls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
  readonly shifts: readonly {
    readonly value: number;
    readonly hadRecentInput: boolean;
    readonly agentNavigation: boolean;
    readonly virtualized: boolean;
    readonly sources: readonly string[];
  }[];
}

async function resetMotion(page: Page): Promise<void> {
  // FABRICATION-OK: paired with MotionAnchoredPortalStory's same-module probe slot.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // A LoAF is keyed by its frame start. Let preparation paint, then set the threshold in the
          // second presented frame so its pre-click work remains below the checkpoint.
          (globalThis as typeof globalThis & { __motionReset: () => void }).__motionReset();
          resolve();
        });
      });
    });
  });
}

async function hitPoint(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error("visible CT control has no bounding box");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
  await expect.poll(() => lines.length, evidencePoll()).toBeGreaterThan(0);

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
  await expect.poll(() => lines.length, evidencePoll()).toBeGreaterThan(0);

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
  await expect.poll(() => lines.some((l) => l.includes("unexpected")), evidencePoll()).toBe(true);

  const motion = await readMotion(page);
  expect(motion.cls).toBeGreaterThan(0);
});

test("agent navigation keeps attributed shift evidence without emitting a false unexpected warning", async ({ mount, page }) => {
  const lines = captureClsLines(page);
  const component = await mount(<MotionShiftFlaggerStory />);

  // The stage must have PAINTED before the spacer grows, or there is no "before" position and the browser
  // emits no entry at all (header law A). A real click would wait for this; `evaluate(el => el.click())` —
  // required here, since a trusted event would set `hadRecentInput` — does not.
  await settlePaint(page);
  await component.getByRole("button", { name: "agent-driven shift" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect.poll(async () => (await readMotion(page)).observedCls, evidencePoll()).toBeGreaterThan(0);

  const motion = await readMotion(page);
  expect(motion.shifts.some((shift) => shift.agentNavigation && shift.sources.some((source) => source.includes("cls-victim")))).toBe(true);
  expect(lines).toEqual([]);
});

test("a VIRTUALIZED shift moves the raw CLS totals but never the budgeted non-virtualized one", async ({ mount, page }) => {
  const lines = captureClsLines(page);
  const component = await mount(<MotionVirtualizedShiftStory />);

  // 900ms after the click ⇒ past the input window ⇒ the shift really does enter `cls` (the whole point:
  // this is the number that made "journey under 0.1" unreachable, issue #109).
  await component.getByRole("button", { name: "settle rows later" }).click();
  await expect.poll(async () => (await readMotion(page)).cls, evidencePoll()).toBeGreaterThan(0);

  const motion = await readMotion(page);
  expect(motion.shifts.some((s) => s.virtualized && s.sources.some((src) => src.includes("virtual-row")))).toBe(true);
  // Raw moves, the instrument's virtualized share accounts for ALL of it…
  expect(motion.virtualizedCls).toBe(motion.cls);
  // …and the total the budget gates on stays clean — no app fix could have moved it.
  expect(motion.nonVirtualizedCls).toBe(0);
  // Still warn-suppressed: virtual-row settling is the list doing its job, not an accusation.
  expect(lines).toEqual([]);
});

test("the checkpoint reset clears accumulated shifts without reinstalling the observer", async ({ mount, page }) => {
  const component = await mount(<MotionShiftFlaggerStory />);

  await component.getByRole("button", { name: "shift now" }).click();
  await expect.poll(async () => (await readMotion(page)).observedCls, evidencePoll()).toBeGreaterThan(0);
  await component.getByRole("button", { name: "reset evidence" }).click();

  await expect.poll(async () => await readMotion(page), evidencePoll()).toMatchObject({ cls: 0, observedCls: 0, shifts: [] });
});

test("a real sealed Select classifies its confirmed first and repeat entrance lifetimes only", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(<MotionAnchoredPortalStory />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  const triggerPoint = await hitPoint(trigger);
  await delay(500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await resetMotion(page);
  await page.mouse.click(triggerPoint.x, triggerPoint.y);
  await delay(250);

  const first = await readMotion(page);
  expect(first.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined && loaf.selectEntrance.firstForTrigger)).toBe(true);
  expect(loafTotals(first).classifiedInitializations).toBe(1);
  expect(loafOverBudget(first)).toBe(false);

  await page.keyboard.press("Escape");
  await delay(150);
  await page.getByRole("button", { name: "arm Select blocking" }).click();
  await resetMotion(page);
  await page.mouse.click(triggerPoint.x, triggerPoint.y);
  await delay(250);
  const repeated = await readMotion(page);
  expect(repeated.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined && !loaf.selectEntrance.firstForTrigger)).toBe(true);
  expect(loafTotals(repeated).budgetedStyleLayout).toBe(0);
  // The entrance classification may accept Base UI's style/positioning frame, but a repeat receives no
  // blocking allowance: this planted app-owned 120ms handler must still fail the unchanged 50ms budget.
  expect(loafOverBudget(repeated)).toBe(true);
  await page.keyboard.press("Escape");
  await delay(150);

  const blockingPoint = await hitPoint(page.getByRole("button", { name: "plant app blocking" }));
  await resetMotion(page);
  await page.mouse.click(blockingPoint.x, blockingPoint.y);
  await delay(150);
  const blocked = await readMotion(page);
  expect(blocked.loafs.every((loaf) => loaf.selectEntrance === undefined)).toBe(true);
  expect(loafOverBudget(blocked)).toBe(true);

  const stylePoint = await hitPoint(page.getByRole("button", { name: "plant app style" }));
  await resetMotion(page);
  await page.mouse.click(stylePoint.x, stylePoint.y);
  await delay(150);
  const styled = await readMotion(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(loafTotals(styled).budgetedStyleLayout).toBeGreaterThan(0);
  expect(loafOverBudget(styled)).toBe(true);
});
