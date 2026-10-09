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
//     `nonVirtualizedCls` — the total motion-audit's budget gates on — at zero;
//  5. the OBSERVED total carries the SAME virtual-row split (#1071): a virtualized shift INSIDE the input
//     window moves `observedCls`/`observedVirtualizedCls` and leaves `observedNonVirtualizedCls` at zero,
//     while every spec total stays zero. That is the field motion-audit subtracts before gating an
//     interaction cell — without it, budgeting a click on raw `observedCls` would charge virtual-row
//     reconciliation as an app defect, which is exactly what #109 removed from the budget.
//
// The observers are module-global by design; CT reuses its context/page but navigates the harness before
// each test, so each document starts a new module instance and observer totals.
//
// THREE TIMING LAWS THIS FILE OBEYS (issues #121 and #1911):
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
//
//  C. A FIXED SLEEP IS NOT AN OBSERVER BARRIER. `long-animation-frame` delivery is asynchronous, and
//     Select attribution itself stays mutable through the real transition end. Poll the exact settled
//     evidence the next assertion consumes, using the same 10s evidence-delivery budget as every other
//     observer arm in this file.

import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { errorMessage } from "@orb/kit/error-message";
import { expect, test } from "@playwright/experimental-ct-react";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { CT_CACHE_DIR_ENV } from "../../../tooling/src/_shared/ct-run-slot.ts";
import { processEnvValue } from "../../../tooling/src/_shared/process-env.ts";
import { NATIVE_TIMING_CASE_ANNOTATION } from "../../../tooling/src/_shared/timing-capability.ts";
import { BLOCKING_BUDGET_MS, loafOverBudget, loafTotals } from "../../../tooling/src/motion-audit/index.ts";
import type { TraceCapture } from "../../../tooling/src/snap/lib/react-profile-trace.ts";
import { recordOf, startTrace, stopTrace } from "../../../tooling/src/snap/lib/react-profile-trace.ts";
import { DIAGNOSTIC_ONLY_ANNOTATION } from "../../../tooling/src/verify/contract/scoped-test.ts";
import type { AppBlockingReceipt } from "../../support/iso/app-blocking-receipt.ts";
import { matchAppBlockingFrame } from "../../support/iso/app-blocking-receipt.ts";
import {
  retainNativeSources,
  SELECT_BUILD_DIAGNOSTIC_ENV,
  SELECT_CPU_DIAGNOSTIC_ENV,
  SELECT_CPU_PROFILING_ENV,
  SELECT_NATIVE_SOURCES_ATTACHMENT,
  SELECT_NATIVE_TRACE_ENV,
} from "../../support/node/select-native-sources.ts";
import { assertTimingBudget } from "../../support/node/timing-budget.ts";
import { MotionAnchoredPortalStory, MotionShiftFlaggerStory, MotionVirtualizedShiftStory } from "./_ct-stories.tsx";
import { SELECT_OPENING_TEST_CASES } from "./select-opening-cases.ts";
import type { SelectOpeningProbe } from "./select-opening-fixtures.tsx";

// Manufactured blocking controls must not run beside this file's cold-opening budget measurements.
test.describe.configure({ mode: "default" });

/** The score the flagger prints — `shift 0.1234`. */
const SCORE_RE = /shift 0\.\d{4}/u;

/** The budget for browser-delivered evidence. Measured under a 1120-test / 24-worker CT run, the
 *  agent-driven shift landed in 34–135ms — so this is ~70× the observed worst case, and a run that spends
 *  it has lost the evidence (law A), not merely been slow. Well under the 30s test timeout. */
const EVIDENCE_TIMEOUT_MS = 10_000;
const SOURCE_REQUEST_TIMEOUT_MS = 1000;
const SOURCE_TOTAL_TIMEOUT_MS = 2000;
const SOURCE_DEADLINE_CONTROL_MS = 200;
const SELECT_CPU_PROFILING = processEnvValue(SELECT_CPU_PROFILING_ENV) !== "0";
const SELECT_NATIVE_TRACE = processEnvValue(SELECT_NATIVE_TRACE_ENV) === "1";
const SELECT_NATIVE_TRACE_ATTACHMENT = "select-native-first-repeat-trace-diagnostic";
const SELECT_CPU_DIAGNOSTIC_RATE = 4;
const SELECT_CPU_DIAGNOSTIC_ANNOTATION = {
  type: DIAGNOSTIC_ONLY_ANNOTATION,
  description: "CPU profiling perturbs timing; this is not budget qualification.",
} as const;
const SELECT_TRACE_SYNC_MARK = "orb:select-cpu-diagnostic:clock";
const SELECT_COMPILE_CONTROL_START = "orb:select-cpu-diagnostic:compile-control:start";
const SELECT_COMPILE_CONTROL_END = "orb:select-cpu-diagnostic:compile-control:end";
const SELECT_TRACE_CATEGORIES = ["disabled-by-default-v8.compile"] as const;

async function syncSelectTraceClock(page: Page): Promise<void> {
  await page.evaluate((name) => {
    performance.mark(name, {
      detail: {
        // @orb-waive test-determinism(performance.timeOrigin): this diagnostic measures browser-native LoAF/trace clock alignment; an injected epoch cannot calibrate that subject. Ends when native clock calibration is removed.
        timeOrigin: performance.timeOrigin,
        // @orb-waive test-determinism(performance.now): this UserTiming synchronization mark calibrates the measured browser-native trace clock, not a test deadline. Ends when native clock calibration is removed.
        now: performance.now(),
      },
    });
  }, SELECT_TRACE_SYNC_MARK);
}

interface SelectTraceReceipt {
  readonly attachmentName: string;
  readonly cpuProfiling: boolean;
  readonly compileControl: boolean;
}

async function finishSelectTrace(page: Page, capture: TraceCapture, receipt: SelectTraceReceipt): Promise<void> {
  const { attachmentName, cpuProfiling, compileControl } = receipt;
  const traceError = await stopTrace(capture);
  // @orb-waive test-determinism(performance.timeOrigin): the artifact must align browser-native LoAF timestamps with calibrated trace timestamps; an injected epoch cannot describe the measured document. Ends when native clock calibration is removed.
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await test.info().attach(attachmentName, {
    body: JSON.stringify({
      diagnosticOnly: true,
      qualification: false,
      cpuProfiling,
      traceEvents: capture.events,
      calibration: capture.calibration,
      timeOrigin,
      syncMark: SELECT_TRACE_SYNC_MARK,
      ...(compileControl ? { compileControl: { startMark: SELECT_COMPILE_CONTROL_START, endMark: SELECT_COMPILE_CONTROL_END } } : {}),
      additionalCategories: SELECT_TRACE_CATEGORIES,
      error: traceError,
    }),
    contentType: "application/json",
  });
  expect(traceError).toBeNull();
  expect(capture.calibration).not.toBeNull();
  expect(capture.events.length).toBeGreaterThan(0);
  expect(capture.events.some((event) => recordOf(event)?.["name"] === SELECT_TRACE_SYNC_MARK)).toBe(true);
}

async function attachNativeSelectSources(page: Page, capture: TraceCapture, profileUrls: readonly string[] = []): Promise<void> {
  // Retention is diagnostic cleanup: an attachment failure must not replace a trace or budget failure.
  try {
    const scriptUrls = capture.events.flatMap((event) => {
      const url = recordOf(recordOf(recordOf(event)?.["args"])?.["data"])?.["url"];
      return typeof url === "string" ? [url] : [];
    });
    const receipt = await retainNativeSources({
      cacheDir: processEnvValue(CT_CACHE_DIR_ENV),
      pageUrl: page.url(),
      scriptUrls: [...scriptUrls, ...profileUrls],
      buildDiagnostic: processEnvValue(SELECT_BUILD_DIAGNOSTIC_ENV) !== undefined,
      attach: (name, options) => test.info().attach(name, options),
    });
    await test.info().attach(SELECT_NATIVE_SOURCES_ATTACHMENT, { body: JSON.stringify(receipt), contentType: "application/json" });
    if (!receipt.complete) {
      console.error("Native Select source retention is incomplete", JSON.stringify(receipt));
    }
  } catch (error) {
    console.error(`Native Select source retention could not be reported: ${errorMessage(error)}`);
  }
}

interface NativeSelectTrace extends AsyncDisposable {
  readonly finish: () => Promise<void>;
}

async function startNativeSelectTrace(page: Page, cdp: CDPSession): Promise<NativeSelectTrace> {
  const disposeSession = async (): Promise<void> => {
    try {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    } finally {
      await cdp.detach();
    }
  };
  const { capture, error } = await startTrace(page, SELECT_TRACE_CATEGORIES);
  if (capture === null) {
    const failure = new Error(`Native Select diagnostic trace could not start: ${error ?? "missing capture"}`);
    const [cleanup] = await Promise.allSettled([disposeSession()] as const);
    if (cleanup.status === "rejected") {
      throw new AggregateError([failure, cleanup.reason], "Native Select diagnostic start and cleanup failed");
    }
    await test.info().attach("select-native-trace-startup-cleanup", {
      body: JSON.stringify({
        diagnosticOnly: true,
        qualification: false,
        cpuProfiling: false,
        rateResetAcknowledged: 1,
        detached: true,
        error: failure.message,
      }),
      contentType: "application/json",
    });
    throw failure;
  }
  const finish = async (): Promise<void> => {
    if (!capture.started) {
      return;
    }
    try {
      await finishSelectTrace(page, capture, { attachmentName: SELECT_NATIVE_TRACE_ATTACHMENT, cpuProfiling: false, compileControl: false });
    } finally {
      await attachNativeSelectSources(page, capture);
    }
  };
  const dispose = async (): Promise<void> => {
    try {
      await finish();
    } finally {
      await disposeSession();
    }
  };
  const [started] = await Promise.allSettled([
    (async (): Promise<void> => {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: SELECT_CPU_DIAGNOSTIC_RATE });
      await syncSelectTraceClock(page);
    })(),
  ] as const);
  if (started.status === "rejected") {
    const [cleanup] = await Promise.allSettled([dispose()] as const);
    if (cleanup.status === "rejected") {
      throw new AggregateError([started.reason, cleanup.reason], "Native Select diagnostic start and cleanup failed");
    }
    throw started.reason;
  }
  return { finish, [Symbol.asyncDispose]: dispose };
}

async function profileSelectOpening(page: Page, cdp: CDPSession, opening: () => Promise<MotionRead>): Promise<MotionRead> {
  const { capture, error } = await startTrace(page, SELECT_TRACE_CATEGORIES);
  if (capture === null) {
    throw new Error(`Select diagnostic trace could not start: ${error ?? "missing capture"}`);
  }
  let profilerEnabled = false;
  let profilerStarted = false;
  let profileUrls: string[] = [];
  const [outcome] = await Promise.allSettled([
    (async (): Promise<MotionRead> => {
      // The trace owns another CDP session; establish the requested rate after its attachment.
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: SELECT_CPU_DIAGNOSTIC_RATE });
      if (SELECT_CPU_PROFILING) {
        await cdp.send("Profiler.enable");
        profilerEnabled = true;
        await cdp.send("Profiler.start");
        profilerStarted = true;
      }
      await syncSelectTraceClock(page);
      return await opening();
    })(),
  ] as const);
  const cpuCleanup = async (): Promise<void> => {
    let capturedSamples = 0;
    let capturedFrames = false;
    try {
      if (profilerStarted) {
        const { profile } = await cdp.send("Profiler.stop");
        profileUrls = profile.nodes.flatMap(({ callFrame }) => (callFrame.url === "" ? [] : [callFrame.url]));
        await test.info().attach("select-first-cpu-diagnostic", {
          body: JSON.stringify({ diagnosticOnly: true, qualification: false, cpuProfiling: SELECT_CPU_PROFILING, profile }),
          contentType: "application/json",
        });
        capturedSamples = profile.samples?.length ?? 0;
        capturedFrames = profile.nodes.some((node) => node.callFrame.url !== "" && (node.children?.length ?? 0) > 0);
      }
    } finally {
      if (profilerEnabled) {
        await cdp.send("Profiler.disable");
      }
    }
    expect(capturedSamples > 0).toBe(SELECT_CPU_PROFILING);
    expect(capturedFrames).toBe(SELECT_CPU_PROFILING);
  };
  const traceCleanup = async (): Promise<void> => {
    await finishSelectTrace(page, capture, { attachmentName: "select-first-trace-diagnostic", cpuProfiling: SELECT_CPU_PROFILING, compileControl: true });
    const controlStart = capture.events.map(recordOf).find((event) => event?.["name"] === SELECT_COMPILE_CONTROL_START)?.["ts"];
    const controlEnd = capture.events.map(recordOf).find((event) => event?.["name"] === SELECT_COMPILE_CONTROL_END)?.["ts"];
    expect(typeof controlStart).toBe("number");
    expect(typeof controlEnd).toBe("number");
    const controlCompiles = capture.events.map(recordOf).filter((event) => {
      const name = event?.["name"];
      const timestamp = event?.["ts"];
      return (
        typeof name === "string" &&
        name.startsWith("V8.Compile") &&
        typeof timestamp === "number" &&
        typeof controlStart === "number" &&
        typeof controlEnd === "number" &&
        timestamp >= controlStart &&
        timestamp <= controlEnd
      );
    });
    expect(controlCompiles.length).toBeGreaterThan(0);
  };
  const cleanupOutcomes = await Promise.allSettled([cpuCleanup(), traceCleanup()]);
  // Sampled component bundles may have no timeline FunctionCall; retain both populations after measurement stops.
  await attachNativeSelectSources(page, capture, profileUrls);
  const failures = cleanupOutcomes.flatMap((cleanup) => (cleanup.status === "rejected" ? [cleanup.reason] : []));
  if (failures.length > 0) {
    throw new AggregateError(outcome.status === "rejected" ? [outcome.reason, ...failures] : failures, "Select diagnostic cleanup failed");
  }
  if (outcome.status === "rejected") {
    throw outcome.reason;
  }
  return outcome.value;
}

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
    readonly scripts: readonly {
      readonly sourceURL: string;
      readonly duration: number;
      readonly sourceFunctionName: string;
      readonly invoker: string;
      readonly sourceCharPosition?: number;
      readonly executionStart?: number;
    }[];
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
  readonly observedVirtualizedCls: number;
  readonly observedNonVirtualizedCls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
  readonly shifts: readonly {
    readonly startTime: number;
    readonly value: number;
    readonly hadRecentInput: boolean;
    readonly agentNavigation: boolean;
    readonly virtualized: boolean;
    readonly sources: readonly string[];
  }[];
}

interface SourceLocation {
  readonly script: MotionRead["loafs"][number]["scripts"][number];
  readonly responseStatus: number | null;
  readonly excerptStart: number | null;
  readonly source: string | null;
  readonly error: string | null;
}

async function readSourceLocation(script: SourceLocation["script"], position: number, signal: AbortSignal): Promise<SourceLocation> {
  let responseStatus: number | null = null;
  try {
    const response = await fetch(script.sourceURL, { signal });
    responseStatus = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return { script, responseStatus: response.status, excerptStart: null, source: null, error: `source diagnostic HTTP ${response.status}` };
    }
    const excerptStart = Math.max(0, position - 250);
    return { script, responseStatus: response.status, excerptStart, source: (await response.text()).slice(excerptStart, position + 750), error: null };
  } catch (error) {
    const cause = Error.isError(error) && error.cause !== undefined ? `; cause: ${errorMessage(error.cause)}` : "";
    const abort = signal.aborted ? `; deadline: ${errorMessage(signal.reason)}` : "";
    return { script, responseStatus, excerptStart: null, source: null, error: `source diagnostic transport: ${errorMessage(error)}${cause}${abort}` };
  }
}

async function attachSourceLocations(motion: MotionRead, budgetMs = SOURCE_TOTAL_TIMEOUT_MS): Promise<readonly SourceLocation[]> {
  const locations: SourceLocation[] = [];
  const deadline = AbortSignal.timeout(budgetMs);
  for (const script of motion.loafs.flatMap((loaf) => loaf.scripts).filter((entry) => entry.duration > 50)) {
    if (script.sourceCharPosition === undefined || script.sourceCharPosition < 0) {
      continue;
    }
    if (deadline.aborted) {
      locations.push({ script, responseStatus: null, excerptStart: null, source: null, error: "source diagnostic aggregate deadline exhausted" });
      continue;
    }
    locations.push(await readSourceLocation(script, script.sourceCharPosition, AbortSignal.any([deadline, AbortSignal.timeout(SOURCE_REQUEST_TIMEOUT_MS)])));
  }
  await test.info().attach("select-first-source-locations", { body: JSON.stringify(locations, null, 2), contentType: "application/json" });
  return locations;
}

async function resetMotion(page: Page): Promise<void> {
  // Paired with MotionAnchoredPortalStory's same-module probe slot.
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
  await expect.poll(async () => await locator.boundingBox()).not.toBeNull();
  const box = await locator.boundingBox();
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
  // @orb-waive no-test-fabrication(unknown): the probe slot the story writes; declared and read in this spec alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return page.evaluate(() => (globalThis as unknown as { __motionRead: () => MotionRead }).__motionRead());
}

function readOpening(page: Page): Promise<SelectOpeningProbe> {
  return page.evaluate(() => (globalThis as typeof globalThis & { __motionOpeningRead: () => SelectOpeningProbe }).__motionOpeningRead());
}

function entranceTaskMotion(page: Page): Promise<MotionRead> {
  return motionWhen(page, (snapshot) => snapshot.loafs.some((loaf) => loaf.scripts.some((script) => script.sourceFunctionName === "plantEntranceFrame")));
}

function resetAppBlockingReceipt(page: Page): Promise<void> {
  return page.evaluate(() => (globalThis as typeof globalThis & { __resetAppBlockingReceipt: () => void }).__resetAppBlockingReceipt());
}

function readAppBlockingInput(page: Page): Promise<AppBlockingReceipt> {
  return page.evaluate(() =>
    (globalThis as typeof globalThis & { __readAppBlockingReceiptForTest: () => AppBlockingReceipt }).__readAppBlockingReceiptForTest(),
  );
}

async function appBlockingMotion(page: Page, trusted: boolean): Promise<{ motion: MotionRead; frame: MotionRead["loafs"][number] }> {
  let receipt = await readAppBlockingInput(page);
  let motion = await readMotion(page);
  let match = matchAppBlockingFrame(receipt, motion.loafs, trusted);
  try {
    await expect
      .poll(async () => {
        receipt = await readAppBlockingInput(page);
        motion = await readMotion(page);
        match = matchAppBlockingFrame(receipt, motion.loafs, trusted);
        return typeof match === "string" ? match : "matched";
      }, evidencePoll())
      .toBe("matched");
    if (typeof match === "string") {
      throw new Error(match);
    }
    const frame = motion.loafs[match.retainedIndex];
    if (frame === undefined) {
      throw new Error("matched app blocking frame is not retained");
    }
    // Judge the matched plant itself; an unrelated slow frame cannot make the control pass.
    const matched = { ...motion, loafs: [frame] };
    expect(loafOverBudget(matched)).toBe(true);
    return { motion, frame };
  } finally {
    await test.info().attach("app-blocking-receipt", {
      body: JSON.stringify({ input: receipt, motion, match, trusted }),
      contentType: "application/json",
    });
  }
}

async function postPopupAppBlockingMotion(page: Page): Promise<MotionRead> {
  await resetMotion(page);
  await resetAppBlockingReceipt(page);
  // Actionability separates this post-popup input from the checkpoint's rendering update and proves its receiver.
  await page.getByRole("button", { name: "plant app blocking", exact: true }).click();
  const { motion } = await appBlockingMotion(page, true);
  return motion;
}

async function motionWhen(page: Page, predicate: (motion: MotionRead) => boolean): Promise<MotionRead> {
  let motion = await readMotion(page);
  try {
    await expect
      .poll(async () => {
        motion = await readMotion(page);
        return predicate(motion);
      }, evidencePoll())
      .toBe(true);
  } catch (error) {
    const entranceMarks = await page.evaluate(() =>
      performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("orb:select-entrance:"))
        .map(({ name, startTime }) => ({ name, startTime })),
    );
    await test.info().attach("motion-evidence", { body: JSON.stringify({ motion, entranceMarks }, null, 2), contentType: "application/json" });
    throw error;
  }
  return motion;
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
  // …and the whole of it is chargeable: nothing here is virtual-row reconciliation, so the number
  // motion-audit gates an INTERACTION on (#1071) equals the observed total.
  expect(motion.observedVirtualizedCls).toBe(0);
  expect(motion.observedNonVirtualizedCls).toBe(motion.observedCls);
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

test("a native timer retains its exact source offset and execution start in motion evidence", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory />);
  await resetMotion(page);
  await page.getByRole("button", { name: "plant app style", exact: true }).click();
  const motion = await motionWhen(page, (snapshot) =>
    snapshot.loafs.some((loaf) => loaf.scripts.some((script) => script.invoker === "TimerHandler:setTimeout")),
  );
  const frame = motion.loafs.find((loaf) => loaf.scripts.some((script) => script.invoker === "TimerHandler:setTimeout"));
  const timer = frame?.scripts.find((script) => script.invoker === "TimerHandler:setTimeout");
  expect(timer?.sourceCharPosition).toBeGreaterThan(0);
  if (frame === undefined || timer?.sourceCharPosition === undefined || timer.executionStart === undefined) {
    throw new Error("native timer source offset or execution start was dropped");
  }
  expect(Math.round(timer.executionStart)).toBeGreaterThanOrEqual(frame.startTime);
  expect(Math.round(timer.executionStart)).toBeLessThan(frame.startTime + frame.duration);
  const source = await (await page.request.get(timer.sourceURL)).text();
  expect(source.slice(timer.sourceCharPosition, timer.sourceCharPosition + 500)).toContain('"180px"');
  const locations = await attachSourceLocations(motion);
  expect(locations.some((location) => location.responseStatus === 200 && location.source?.includes('"180px"') && location.error === null)).toBe(true);
});

// Profiling changes timings. These opt-in captures never qualify the unchanged native budget below.
if (processEnvValue(SELECT_CPU_DIAGNOSTIC_ENV) === "1") {
  for (const failOpening of [false, true]) {
    test(`Select CPU diagnostic only — ${failOpening ? "opening failure cleanup" : "native first opening"}`, {
      annotation: SELECT_CPU_DIAGNOSTIC_ANNOTATION,
    }, async ({ mount, page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mount(<MotionAnchoredPortalStory />);
      const triggerPoint = await hitPoint(page.getByRole("combobox", { name: "Anchored portal control" }));
      await delay(500);
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: SELECT_CPU_DIAGNOSTIC_RATE });
        await resetMotion(page);
        const failure = new Error("diagnostic opening fault after settled evidence");
        const opening = profileSelectOpening(page, cdp, async () => {
          await page.mouse.click(triggerPoint.x, triggerPoint.y);
          const motion = await motionWhen(page, (snapshot) =>
            snapshot.loafs.some(
              (loaf) => loaf.selectEntrance?.confirmedAt !== undefined && loaf.selectEntrance.endedAt !== undefined && loaf.selectEntrance.firstForTrigger,
            ),
          );
          await test.info().attach("select-first-profiled-motion-diagnostic", {
            body: JSON.stringify(
              { diagnosticOnly: true, qualification: false, cpuProfiling: SELECT_CPU_PROFILING, motion, totals: loafTotals(motion) },
              null,
              2,
            ),
            contentType: "application/json",
          });
          expect(motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined && loaf.selectEntrance.firstForTrigger)).toBe(true);
          // Compile observability is proved after the settled snapshot, never charged to the opening interval.
          const control = await cdp.send("Runtime.evaluate", {
            expression: `(() => { performance.mark(${JSON.stringify(SELECT_COMPILE_CONTROL_START)}); const compile = new Function(${JSON.stringify(`return ${JSON.stringify(test.info().testId)}`)}); const value = compile(); performance.mark(${JSON.stringify(SELECT_COMPILE_CONTROL_END)}); return value; })()`,
            returnByValue: true,
          });
          expect(control.exceptionDetails).toBeUndefined();
          expect(control.result.value).toBe(test.info().testId);
          if (failOpening) {
            throw failure;
          }
          return motion;
        });
        const openingError = await opening.then(
          () => null,
          (error: Error) => error,
        );
        expect(openingError).toBe(failOpening ? failure : null);
        expect(test.info().attachments.map(({ name }) => name)).toContain("select-first-trace-diagnostic");
        expect(test.info().attachments.some(({ name }) => name === "select-first-cpu-diagnostic")).toBe(SELECT_CPU_PROFILING);
        // A second start/stop succeeds only after the first capture released its profiler session.
        if (SELECT_CPU_PROFILING) {
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.start");
          await cdp.send("Profiler.stop");
          await cdp.send("Profiler.disable");
        }
        const restarted = await startTrace(page);
        if (restarted.capture === null) {
          throw new Error(`Select diagnostic trace was not released: ${restarted.error ?? "missing capture"}`);
        }
        const restartedError = await stopTrace(restarted.capture);
        expect(restartedError).toBeNull();
      } finally {
        try {
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        } finally {
          await cdp.detach();
        }
      }
    });
  }
}

for (const sourceTransport of ["normal", "missing", "aborted", "deadline"] as const) {
  test(sourceTransport === "normal"
    ? "a native sealed Select records timing and preserves its repeat entrance controls"
    : `Select budget and lifecycle acceptance survives ${sourceTransport} source diagnostics`, { annotation: NATIVE_TIMING_CASE_ANNOTATION }, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(<MotionAnchoredPortalStory />);
    const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
    const triggerPoint = await hitPoint(trigger);
    await delay(500);
    const cdp = await page.context().newCDPSession(page);
    await resetMotion(page);
    await using nativeTrace = SELECT_NATIVE_TRACE && sourceTransport === "normal" ? await startNativeSelectTrace(page, cdp) : null;
    await page.mouse.click(triggerPoint.x, triggerPoint.y);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            performance.getEntriesByType("mark").some((entry) => entry.name.startsWith("orb:select-entrance:") && entry.name.endsWith(":end")),
          ),
        evidencePoll(),
      )
      .toBe(true);
    await settlePaint(page);
    const first = await readMotion(page);
    await test
      .info()
      .attach("select-first-loaf", { body: JSON.stringify({ motion: first, totals: loafTotals(first) }, null, 2), contentType: "application/json" });
    const totals = loafTotals(first);
    await assertTimingBudget(test.info(), { metric: "loaf-blocking-ms", measured: totals.budgetedWorstBlocking, budget: BLOCKING_BUDGET_MS });
    await assertTimingBudget(test.info(), { metric: "loaf-style-layout-count", measured: totals.budgetedStyleLayout, budget: 0 });

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "arm Select blocking" }).click();
    await resetMotion(page);
    await page.mouse.click(triggerPoint.x, triggerPoint.y);
    const repeated = await motionWhen(page, (motion) =>
      motion.loafs.some(
        (loaf) => loaf.selectEntrance?.confirmedAt !== undefined && loaf.selectEntrance.endedAt !== undefined && !loaf.selectEntrance.firstForTrigger,
      ),
    );
    expect(repeated.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined && !loaf.selectEntrance.firstForTrigger)).toBe(true);
    await assertTimingBudget(test.info(), { metric: "repeat-loaf-style-layout-count", measured: loafTotals(repeated).budgetedStyleLayout, budget: 0 });
    // The entrance classification may accept Base UI's style/positioning frame, but a repeat receives no
    // blocking allowance: this planted app-owned 120ms handler must still fail the unchanged 50ms budget.
    expect(loafOverBudget(repeated)).toBe(true);
    // Source transport controls use the already-planted repeat; they do not perturb the native timing window.
    await using server = createServer((_request, response) => {
      if (sourceTransport === "missing") {
        response.writeHead(404).end();
      } else if (sourceTransport === "aborted") {
        response.destroy();
      } else if (sourceTransport === "deadline") {
        response.writeHead(200, { "content-type": "application/javascript" });
        response.flushHeaders();
        response.write("partial source body");
      }
    });
    let diagnostic = repeated;
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    if (sourceTransport !== "normal") {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("source diagnostic fault server has no TCP address");
      }
      diagnostic = {
        ...repeated,
        loafs: repeated.loafs.map((loaf) => ({
          ...loaf,
          scripts: loaf.scripts.map((script) => ({ ...script, sourceURL: `http://127.0.0.1:${address.port}/source.js` })),
        })),
      };
    }
    const sources = await attachSourceLocations(diagnostic, sourceTransport === "deadline" ? SOURCE_DEADLINE_CONTROL_MS : SOURCE_TOTAL_TIMEOUT_MS);
    server.closeAllConnections();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await nativeTrace?.finish();
    const blocked = await postPopupAppBlockingMotion(page);
    expect(blocked.loafs.every((loaf) => loaf.selectEntrance === undefined)).toBe(true);
    expect(loafOverBudget(blocked)).toBe(true);

    const stylePoint = await hitPoint(page.getByRole("button", { name: "plant app style" }));
    await resetMotion(page);
    await page.mouse.click(stylePoint.x, stylePoint.y);
    const styled = await motionWhen(page, (motion) => loafTotals(motion).budgetedStyleLayout > 0);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(styled.loafs.every((loaf) => loaf.selectEntrance === undefined)).toBe(true);
    expect(loafTotals(styled).budgetedStyleLayout).toBeGreaterThan(0);
    expect(loafOverBudget(styled)).toBe(true);
    await test.info().attach("select-acceptance-complete", {
      body: JSON.stringify({ first: loafTotals(first), repeated: loafTotals(repeated), blocked: loafTotals(blocked), styled: loafTotals(styled) }),
      contentType: "application/json",
    });
    const expectedError = { normal: /$/u, missing: /HTTP 404/u, deadline: /timeout/iu, aborted: /fetch failed/u }[sourceTransport];
    expect(sourceTransport === "normal" || (sources.length > 0 && sources.every((location) => location.error !== null && location.source === null))).toBe(true);
    expect(sourceTransport === "normal" || sources.some((location) => expectedError.test(location.error ?? ""))).toBe(true);
    expect(sourceTransport !== "deadline" || sources.some((location) => location.responseStatus === 200 && location.error?.includes("deadline:"))).toBe(true);
  });
}

test("a slow first Select render confirms its entrance without hiding its app blocking", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Exceed the ordinary budget; the lifecycle cap still starts after confirmation.
  await mount(<MotionAnchoredPortalStory firstRenderBlockMs={750} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  const point = await hitPoint(trigger);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await resetMotion(page);
  await page.mouse.click(point.x, point.y);
  const motion = await motionWhen(page, (snapshot) =>
    snapshot.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined && loaf.selectEntrance.endedAt !== undefined),
  );
  const entrance = motion.loafs.find((loaf) => loaf.selectEntrance?.confirmedAt !== undefined)?.selectEntrance;
  expect(entrance?.firstForTrigger).toBe(true);
  expect((entrance?.confirmedAt ?? 0) - (entrance?.startedAt ?? 0)).toBeGreaterThan(300);
  expect((entrance?.endedAt ?? 0) - (entrance?.confirmedAt ?? 0)).toBeLessThanOrEqual(300);
  expect(loafOverBudget(motion)).toBe(true);
  expect(loafTotals(motion).budgetedWorstBlocking).toBeGreaterThan(50);
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const capEnd = (entrance?.confirmedAt ?? 0) + 300;
  await delay(300);
  await resetAppBlockingReceipt(page);
  await page.getByRole("button", { name: "plant app blocking" }).click();
  const { motion: outside, frame: outsideFrame } = await appBlockingMotion(page, true);
  expect(outsideFrame.startTime).toBeGreaterThan(capEnd);
  expect(outside.loafs.filter((loaf) => loaf.startTime > capEnd).every((loaf) => loaf.selectEntrance === undefined)).toBe(true);
  expect(loafOverBudget(outside)).toBe(true);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("a rejected Select intent cannot classify a later app-controlled mount", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory rejectTriggerOpen={true} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  await resetMotion(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "mount without Select intent" }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const motion = await motionWhen(page, (snapshot) =>
    snapshot.loafs.some((loaf) => loaf.scripts.some((script) => script.sourceFunctionName === "plantEntranceFrame")),
  );
  expect(motion.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
});

test("a controlled timer mount without another gesture never confirms the ignored native request", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory automaticControlledOpen={true} />);
  await resetMotion(page);
  await page.getByRole("combobox", { name: "Anchored portal control" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const motion = await motionWhen(page, (snapshot) =>
    snapshot.loafs.some((loaf) => loaf.scripts.some((script) => script.sourceFunctionName === "plantEntranceFrame")),
  );
  expect(motion.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
});

for (const key of ["mouse", "ArrowDown", "ArrowUp", "Enter", "Space"] as const) {
  test(`the uncontrolled ${key} opening authorizes its exact native request after the caller`, async ({ mount, page }) => {
    await mount(<MotionAnchoredPortalStory eachEntranceTask={true} />);
    const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
    await resetMotion(page);
    if (key === "mouse") {
      await trigger.click();
    } else {
      await trigger.press(key);
    }
    await expect(page.getByRole("listbox")).toBeVisible();
    const motion = await entranceTaskMotion(page);
    await expect.poll(() => readOpening(page), evidencePoll()).toMatchObject({ callbacks: [{ open: true, trusted: true, canceled: false }] });
    const probe = await readOpening(page);
    const captured = probe.observations.find((observation) => observation.phase === "captured");
    const accepted = probe.observations.find((observation) => observation.phase === "accepted");
    expect(accepted).toMatchObject({ requestId: captured?.requestId, originTrusted: true, callbackTrusted: true, sameCallerEvent: true });
    expect(captured?.originType).toBe(key === "mouse" ? "pointerdown" : "keydown");
    expect(motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined && loaf.selectEntrance.firstForTrigger)).toBe(true);
  });
}

for (const openingCase of SELECT_OPENING_TEST_CASES.filter((value) => value.startsWith("controlled-") && value !== "controlled-ignore")) {
  test(`${openingCase} remains ordinary despite its genuine native callback and real mount`, async ({ mount, page }) => {
    await mount(<MotionAnchoredPortalStory openingCase={openingCase} eachEntranceTask={true} />);
    await resetMotion(page);
    await page.getByRole("combobox", { name: "Anchored portal control" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    const motion = await entranceTaskMotion(page);
    const probe = await readOpening(page);
    expect(probe.callbacks).toMatchObject([{ open: true, trusted: true, canceled: false }]);
    expect(probe.observations.filter((observation) => observation.phase === "accepted")).toEqual([]);
    expect(motion.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
    expect(loafTotals(motion).classifiedInitializations).toBe(0);
  });
}

test("caller cancellation rejects the native request before any later synthetic mount", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory openingCase="cancel" eachEntranceTask={true} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  await resetMotion(page);
  await trigger.click();
  await expect.poll(() => readOpening(page), evidencePoll()).toMatchObject({ callbacks: [{ open: true, trusted: true, canceled: true }] });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const canceled = await readOpening(page);
  expect(canceled.callbacks).toMatchObject([{ open: true, trusted: true, canceled: true }]);
  expect(canceled.observations.some((observation) => observation.phase === "invalidated")).toBe(true);
  expect(canceled.observations.some((observation) => observation.phase === "accepted")).toBe(false);
  await trigger.evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByRole("listbox")).toBeVisible();
  const motion = await entranceTaskMotion(page);
  expect(motion.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
});

test("a canceled native callback followed by its timer's synthetic mount remains ordinary without another gesture", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory openingCase="cancel-timer" eachEntranceTask={true} />);
  await resetMotion(page);
  await page.getByRole("combobox", { name: "Anchored portal control" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const motion = await entranceTaskMotion(page);
  const probe = await readOpening(page);
  expect(probe.callbacks).toMatchObject([
    { open: true, trusted: true, canceled: true },
    { open: true, trusted: false, canceled: false },
  ]);
  expect(probe.observations.some((observation) => observation.phase === "accepted")).toBe(false);
  expect(motion.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
});

for (const openingCase of ["default-open", "synthetic"] as const) {
  test(`an ordinary ${openingCase} mount prevents a later native reopen receiving the first allowance`, async ({ mount, page }) => {
    await mount(
      <MotionAnchoredPortalStory openingCase={openingCase === "synthetic" ? "native" : openingCase} eachEntranceTask={true} firstRenderBlockMs={60} />,
    );
    const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
    if (openingCase === "synthetic") {
      await trigger.evaluate((element: HTMLButtonElement) => element.click());
    }
    await expect(page.getByRole("listbox")).toBeVisible();
    // Receipt-only reset preserves this page's ordinary Select mount and first-allowance history.
    await resetAppBlockingReceipt(page);
    await page.getByRole("button", { name: "plant app blocking", exact: true }).evaluate((element: HTMLButtonElement) => element.click());
    const { motion: ordinary } = await appBlockingMotion(page, false);
    expect(ordinary.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
    expect(loafOverBudget(ordinary)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await resetMotion(page);
    await trigger.click();
    const repeated = await motionWhen(page, (motion) => motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined));
    expect(repeated.loafs.filter((loaf) => loaf.selectEntrance?.confirmedAt !== undefined).every((loaf) => !loaf.selectEntrance?.firstForTrigger)).toBe(true);
    expect(loafTotals(repeated).classifiedInitializations).toBe(0);
  });
}

test("a checkpoint between native request and mount cannot revive it or relabel the next reopen first", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory openingCase="reset-request" eachEntranceTask={true} firstRenderBlockMs={60} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const ordinary = await entranceTaskMotion(page);
  expect((await readOpening(page)).observations.some((observation) => observation.phase === "accepted")).toBe(true);
  expect(ordinary.loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await resetMotion(page);
  await trigger.click();
  const repeated = await motionWhen(page, (motion) => motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined));
  expect(repeated.loafs.filter((loaf) => loaf.selectEntrance?.confirmedAt !== undefined).every((loaf) => !loaf.selectEntrance?.firstForTrigger)).toBe(true);
});

test("removing the trigger during its accepted callback invalidates its request before a fresh mount", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory openingCase="remove-request" eachEntranceTask={true} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  await trigger.click();
  await expect(trigger).toHaveCount(0);
  await expect
    .poll(() => readOpening(page), evidencePoll())
    .toMatchObject({ observations: [{ phase: "captured" }, { phase: "accepted" }, { phase: "invalidated" }] });
  expect((await readMotion(page)).loafs.every((loaf) => loaf.selectEntrance?.confirmedAt === undefined)).toBe(true);
  await page.getByRole("button", { name: "mount Select", exact: true }).click();
  await resetMotion(page);
  await trigger.click();
  const fresh = await motionWhen(page, (motion) => motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined));
  expect(fresh.loafs.some((loaf) => loaf.selectEntrance?.firstForTrigger)).toBe(true);
});

test("a superseded native mouse callback cannot clear the newer keyboard request", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory eachEntranceTask={true} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  const point = await hitPoint(trigger);
  const cdp = await page.context().newCDPSession(page);
  // Queue both genuine inputs together: useClick defers the mouse callback, while the opening key
  // reaches Root immediately. Assert that actual callback order below rather than infer it from time.
  await Promise.all([
    cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }),
    cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }),
    cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }),
  ]);
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect.poll(async () => (await readOpening(page)).callbacks.map((callback) => callback.eventType), evidencePoll()).toEqual(["keydown", "mousedown"]);
  const probe = await readOpening(page);
  const keyboard = probe.observations.find((observation) => observation.phase === "captured" && observation.originType === "keydown");
  expect(keyboard).toBeDefined();
  expect(probe.observations.filter((observation) => observation.phase === "accepted")).toMatchObject([
    { requestId: keyboard?.requestId, callbackType: "keydown", sameCallerEvent: true, originTrusted: true, callbackTrusted: true },
  ]);
  expect(probe.observations.some((observation) => observation.phase === "invalidated" && observation.requestId === keyboard?.requestId)).toBe(false);
  const motion = await entranceTaskMotion(page);
  expect(motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined)).toBe(true);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.detach();
});

test("rapid native double-click requests never authorize a superseded gesture", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory eachEntranceTask={true} firstRenderBlockMs={60} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  const point = await hitPoint(trigger);
  await page.mouse.dblclick(point.x, point.y);
  await expect
    .poll(async () => (await readOpening(page)).observations.filter((observation) => observation.phase === "captured").length, evidencePoll())
    .toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await readOpening(page)).observations.some((observation) => observation.phase === "accepted"), evidencePoll()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await entranceTaskMotion(page);
  const observations = (await readOpening(page)).observations;
  const activeRequests = new Set<number>();
  const acceptedOwnership: boolean[] = [];
  for (const observation of observations) {
    if (observation.phase === "captured") {
      activeRequests.add(observation.requestId);
    } else if (observation.phase === "invalidated") {
      activeRequests.delete(observation.requestId);
    } else {
      acceptedOwnership.push(
        activeRequests.has(observation.requestId) && observation.sameCallerEvent && observation.originTrusted && observation.callbackTrusted,
      );
    }
  }
  expect(acceptedOwnership.length).toBeGreaterThan(0);
  expect(acceptedOwnership.every(Boolean)).toBe(true);
  const captures = observations.filter((observation) => observation.phase === "captured");
  expect(observations.filter((observation) => observation.phase === "accepted").at(-1)?.requestId).toBe(captures.at(-1)?.requestId);
});

test("a native mouse close and retained-positioner reopen keep separate request identities", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory eachEntranceTask={true} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const first = await motionWhen(page, (motion) => motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined));
  expect(first.loafs.some((loaf) => loaf.selectEntrance?.firstForTrigger)).toBe(true);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await resetMotion(page);
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const repeated = await motionWhen(page, (motion) => motion.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined));
  expect(repeated.loafs.filter((loaf) => loaf.selectEntrance?.confirmedAt !== undefined).every((loaf) => !loaf.selectEntrance?.firstForTrigger)).toBe(true);
  const accepted = (await readOpening(page)).observations.filter((observation) => observation.phase === "accepted");
  expect(accepted).toHaveLength(2);
  expect(accepted[0]?.requestId).not.toBe(accepted[1]?.requestId);
  expect(accepted.every((observation) => observation.sameCallerEvent)).toBe(true);
});

test("independent triggers do not share the native request or first-page allowance identity", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory eachEntranceTask={true} secondTrigger={true} />);
  for (const name of ["Anchored portal control", "Second portal control"]) {
    await resetMotion(page);
    await page.getByRole("combobox", { name, exact: true }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    const motion = await motionWhen(page, (snapshot) => snapshot.loafs.some((loaf) => loaf.selectEntrance?.confirmedAt !== undefined));
    expect(motion.loafs.some((loaf) => loaf.selectEntrance?.firstForTrigger)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveAttribute("aria-expanded", "false");
  }
  const accepted = (await readOpening(page)).observations.filter((observation) => observation.phase === "accepted");
  expect(accepted.map((observation) => observation.triggerName)).toEqual(["Anchored portal control", "Second portal control"]);
  expect(accepted[0]?.requestId).not.toBe(accepted[1]?.requestId);
});

test("a genuinely disabled Select cannot capture or accept a native opening", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory disabled={true} />);
  const trigger = page.getByRole("combobox", { name: "Anchored portal control" });
  await expect(trigger).toBeDisabled();
  const point = await hitPoint(trigger);
  await page.mouse.click(point.x, point.y);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const probe = await readOpening(page);
  expect(probe.callbacks).toEqual([]);
  expect(probe.observations).toEqual([]);
});

test("reduced motion uses only the unchanged post-confirmation hard cap", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<MotionAnchoredPortalStory firstRenderBlockMs={60} />);
  await resetMotion(page);
  await page.getByRole("combobox", { name: "Anchored portal control" }).click();
  await expect(page.locator('[data-slot="select-popup"]')).toHaveCSS("transition-property", "none");
  const motion = await motionWhen(page, (snapshot) => snapshot.loafs.some((loaf) => loaf.selectEntrance?.endedAt !== undefined));
  const entrance = motion.loafs.find((loaf) => loaf.selectEntrance?.endedAt !== undefined)?.selectEntrance;
  expect((entrance?.endedAt ?? 0) - (entrance?.confirmedAt ?? 0)).toBe(300);
  expect((await readOpening(page)).transitions).toEqual([]);
});

test("real transition cancellation ends accepted evidence before the unchanged hard cap", async ({ mount, page }) => {
  await mount(<MotionAnchoredPortalStory openingCase="cancel-transition" />);
  await resetMotion(page);
  await page.getByRole("combobox", { name: "Anchored portal control" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const motion = await motionWhen(page, (snapshot) => snapshot.loafs.some((loaf) => loaf.selectEntrance?.endedAt !== undefined));
  const entrance = motion.loafs.find((loaf) => loaf.selectEntrance?.endedAt !== undefined)?.selectEntrance;
  expect((await readOpening(page)).transitions.some((transition) => transition.type === "transitioncancel" && transition.trusted)).toBe(true);
  expect((entrance?.endedAt ?? 0) - (entrance?.confirmedAt ?? 0)).toBeLessThan(300);
});

test("a virtualized shift INSIDE the input window moves only the OBSERVED virtualized share (#1071)", async ({ mount, page }) => {
  // The regression the observed split exists to prevent. motion-audit's measured click is a real CDP
  // dispatch, so the spec metric zeroes everything within 500ms of it — and the interaction budget
  // therefore has to judge the OBSERVED total instead. If that total did not carry the #109 split, this
  // shape (a click that settles a message list) would be charged as an app defect nothing could fix.
  const lines = captureClsLines(page);
  const component = await mount(<MotionVirtualizedShiftStory />);

  // A real click: its actionability wait supplies the presented "before" header law A requires, and the
  // trusted event is precisely what sets `hadRecentInput` on the resulting entry.
  await component.getByRole("button", { name: "settle rows now" }).click();
  await expect.poll(async () => (await readMotion(page)).observedCls, evidencePoll()).toBeGreaterThan(0);

  const motion = await readMotion(page);
  expect(motion.shifts.some((s) => s.hadRecentInput && s.virtualized && s.sources.some((src) => src.includes("virtual-row")))).toBe(true);
  // Every spec total is blind to it (input-adjacent)…
  expect(motion.cls).toBe(0);
  expect(motion.virtualizedCls).toBe(0);
  expect(motion.nonVirtualizedCls).toBe(0);
  // …the observed total sees it, and classifies ALL of it as reconciliation…
  expect(motion.observedVirtualizedCls).toBe(motion.observedCls);
  // …so the number an interaction cell is gated on stays clean.
  expect(motion.observedNonVirtualizedCls).toBe(0);
  expect(lines).toEqual([]);
});
