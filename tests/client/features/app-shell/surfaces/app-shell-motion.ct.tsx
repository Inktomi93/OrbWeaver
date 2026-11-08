// The shell's motion on the production panes and a corpus room: what each door's FLIP holds on its first painted
// frame and keeps inside its corridor, what reduced motion does instead, the phone's cancel, and the scoped section
// view transition. Every sampler records per animation frame, because the defects it judges are one frame wide.

import { spawn } from "node:child_process";
import { contextToggleLabel, SIDECAR_PANELS_NOUN } from "@orb/client/lib";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { emulateMedia, releaseEmulatedMedia, resolvedLength, seedShellState, shellTracks } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { nonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page, PlaywrightTestArgs } from "@playwright/test";
import { z } from "zod";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, PHONE, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const WIDE = { width: 1280, height: 800 } as const;
// At rem 20 the context pane resolves to an auto-overlay at 1280, so the both-docked layout needs a wider viewport.
const WIDE_REM20 = { width: 1680, height: 900 } as const;
const SQUEEZE_BINDS = { width: 1360, height: 900 } as const;
const OVERLAY_WIDTH = { width: 900, height: 800 } as const;
const REM20 = 1.25;
// The UA root font size the `:root { font-size }` scale multiplies; no token names a browser default.
const UA_ROOT_PX = 16;
const BOTH_DOCKED = { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } } as const;
// What an open room offers a door to read, and what a section without a room offers.
const ROOM_BOXES = ["main", "trail", "listPanel", "contextPanel", "row", "composer", "listAction"] as const;
type DoorBox = (typeof ROOM_BOXES)[number];
// The boxes a door moves. The rail is absent: it is grid column 1 and no door moves it.
const DOOR_BOXES = {
  main: ".shell-main",
  trail: ".shell-topbar-trail",
  listPanel: LIST,
  contextPanel: CONTEXT,
  row: '[data-slot="message-row"]',
  composer: '[data-slot="composer"]',
  listAction: '[data-slot="list-pane-action"]',
} as const satisfies Readonly<Record<DoorBox, string>>;
// The LIST door moves the list pane itself, so its action travels with it by design and is not held.
const LIST_DOOR: readonly DoorBox[] = ["main", "trail", "listPanel", "row", "composer"];
const CONTEXT_DOOR: readonly DoorBox[] = ["main", "trail", "contextPanel", "listAction", "row", "composer"];
const CARRIERS: readonly DoorBox[] = ["row", "composer"];
// What a section without a room offers a door to read.
const SECTION_BOXES: readonly DoorBox[] = ["main", "trail", "listPanel"];
// A rounded pixel either side: the panel tracks and the centring margin each round to the device pixel.
const HOLD_SLACK = 2;
// Any real track is wider than this; a smaller travel means the door moved nothing.
const REAL_TRACK = 100;
// The good-layout ceiling of the cumulative layout shift score.
const CLS_BUDGET = 0.1;
const SAMPLE_FRAMES = 60;

type Frame = Record<string, number>;
interface Census {
  readonly rest: Frame;
  readonly samples: readonly Frame[];
  readonly end: Frame;
}

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let roomId: ChatId;

test.beforeAll(async () => {
  root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  roomId = namedGroupRoom((await (await root.internalCallerFor(root.ownerId)).chat.listChats({ limit: 100 })).items).id;
});

test.beforeEach(async ({ page }) => {
  await emulateMedia(page, {});
});

// The media session is per page and the page outlives the test; detach it so no later spec inherits the overrides.
test.afterEach(async ({ page }) => {
  await releaseEmulatedMedia(page);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

// The motion cases follow the OS query at the default text size, whatever the corpus viewer chose.
const MOTION_BASE: Partial<AppearanceSettings> = { reducedMotion: "system", fontScale: 1 };

const FLANK_PANEL = "motion witness  ○○○○○○ 0/6";

/** Serve the shell, its sections and a room, with the corpus viewer's settings under `appearance`, and with
 *  `flank` the shipped Story Clocks readout, explicitly selected as a sidecar. */
async function routeMotion(page: Page, corpus: CorpusPlayback, appearance: Partial<AppearanceSettings> = {}, flank = false): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  // The settings verbs run on the shared root, so each case writes its own appearance, and the flank column starts
  // open whatever an earlier case's door left.
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { ...MOTION_BASE, ...appearance } });
  if (flank) {
    const plugin = (await caller.plugin.list()).find((candidate) => candidate.slug === "story-clocks");
    if (plugin === undefined) {
      throw new Error("The corpus has no shipped Story Clocks plugin");
    }
    await caller.plugin.setGrant({
      pluginId: plugin.id,
      grant: ["ui.surface", "chat.read", "chat.variables.write"],
      acknowledgedNetHosts: [...(plugin.netHosts ?? [])],
      enable: true,
    });
    const surfaces = (await caller.plugin.listSurfaces()).filter((candidate) => candidate.pluginId === plugin.id);
    const sidecar = surfaces.find((candidate) => candidate.anchor === "chat-flank");
    const controls = surfaces.find((candidate) => candidate.anchor === "chat-settings-section");
    if (sidecar === undefined || controls === undefined) {
      throw new Error("Story Clocks did not register its room readout and controls");
    }
    await caller.plugin.invokeUiAction({
      pluginId: plugin.id,
      surfaceId: controls.id,
      actionId: "start",
      values: { name: "Motion witness", segments: "6" },
      chatId: roomId,
    });
    await caller.settings.updateUserSettingsSection({
      section: "profile",
      patch: { flankCollapsed: false, sidecarChatPluginSurfaces: [{ pluginId: plugin.id, surfaceId: sidecar.id }] },
    });
  } else {
    await caller.settings.updateUserSettingsSection({ section: "profile", patch: { flankCollapsed: false, sidecarChatPluginSurfaces: [] } });
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.getSurfaceState", "settings.updateUserSettingsSection"]),
  });
}

/** The boxes every read names besides the caller's: the corridor test needs `.shell-main`'s and the list pane's width. */
const WIDTH_BOXES = { mainWidth: ".shell-main", listPanelWidth: '.shell-panel[data-panel-side="list"]' } as const;

/**
 * Every named box's x, `.shell-main`'s width and the list pane's width, in one read so no two are a frame apart. A box
 * that is absent or has no box throws with its name: a missing box reads as NaN, and a NaN corridor passes or fails for
 * the wrong reason.
 */
function readBoxes(page: Page, boxes: readonly DoorBox[]): Promise<Frame> {
  return page.evaluate(
    ({ selectors, widths }) => {
      const read = (name: string, selector: string): DOMRect => {
        const element = document.querySelector(selector);
        if (element === null || element.getClientRects().length === 0) {
          throw new Error(`The ${name} box (${selector}) is ${element === null ? "absent" : "not rendered"}`);
        }
        return element.getBoundingClientRect();
      };
      const frame: Record<string, number> = {};
      for (const [name, selector] of Object.entries(selectors)) {
        frame[name] = Math.round(read(name, selector).x * 10) / 10;
      }
      for (const [name, selector] of Object.entries(widths)) {
        frame[name] = Math.round(read(name, selector).width);
      }
      return frame;
    },
    { selectors: Object.fromEntries(boxes.map((box) => [box, DOOR_BOXES[box]])), widths: WIDTH_BOXES },
  );
}

/** Record the same frame on every animation frame from now on, bounded so it cannot outlive the case. */
function startSampler(page: Page, boxes: readonly DoorBox[]): Promise<void> {
  return page.evaluate(
    ({ selectors, widths, limit }) => {
      const ring: Record<string, number>[] = [];
      Reflect.set(globalThis, "__shellFrames", ring);
      Reflect.set(globalThis, "__shellFramesError", null);
      const read = (name: string, selector: string): DOMRect => {
        const element = document.querySelector(selector);
        if (element === null || element.getClientRects().length === 0) {
          throw new Error(`The ${name} box (${selector}) is ${element === null ? "absent" : "not rendered"}`);
        }
        return element.getBoundingClientRect();
      };
      const sample = (): Record<string, number> => {
        const frame: Record<string, number> = {};
        for (const [name, selector] of Object.entries(selectors)) {
          frame[name] = Math.round(read(name, selector).x * 10) / 10;
        }
        for (const [name, selector] of Object.entries(widths)) {
          frame[name] = Math.round(read(name, selector).width);
        }
        return frame;
      };
      const tick = (): void => {
        if (ring.length > limit) {
          return;
        }
        try {
          ring.push(sample());
          requestAnimationFrame(tick);
        } catch (error) {
          Reflect.set(globalThis, "__shellFramesError", error instanceof Error ? error.message : String(error));
        }
      };
      requestAnimationFrame(tick);
    },
    { selectors: Object.fromEntries(boxes.map((box) => [box, DOOR_BOXES[box]])), widths: WIDTH_BOXES, limit: SAMPLE_FRAMES },
  );
}

async function readSamples(page: Page): Promise<Frame[]> {
  const { frames, error } = z.object({ frames: z.array(z.record(z.string(), z.number())), error: z.string().nullable() }).parse(
    await page.evaluate((): unknown => {
      const recorded: unknown = Reflect.get(globalThis, "__shellFrames");
      const failure: unknown = Reflect.get(globalThis, "__shellFramesError");
      return { frames: recorded, error: failure };
    }),
  );
  if (error !== null) {
    throw new Error(error);
  }
  return frames;
}

/**
 * Nothing in the grid is gliding: an endpoint read now is a resting position, not a frame of the glide. A scroll-driven
 * animation (the scroll fades on a scrolling pane) is "running" for as long as its pane exists and moves no box, so only
 * the document-timeline animations count.
 */
function waitForShellIdle(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const grid = document.querySelector(".shell-grid");
    return (
      grid !== null &&
      !grid.getAnimations({ subtree: true }).some((animation) => animation.playState === "running" && animation.timeline instanceof DocumentTimeline)
    );
  });
}

/** Drive one door and return the resting frame before, the per-frame ring across, and the resting frame after. */
async function driveDoor(page: Page, button: string, boxes: readonly DoorBox[]): Promise<Census> {
  await waitForShellIdle(page);
  const rest = await readBoxes(page, boxes);
  await startSampler(page, boxes);
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.waitForFunction(
    (width) => Math.abs(Math.round(document.querySelector(".shell-main")?.getBoundingClientRect().width ?? width) - width) > 2,
    rest["mainWidth"] ?? 0,
  );
  await waitForShellIdle(page);
  return { rest, samples: await readSamples(page), end: await readBoxes(page, boxes) };
}

/** The frame the track resized in: every countered box must still be where it rested in that frame. */
function flipFrame(census: Census): number {
  const restWidth = census.rest["mainWidth"] ?? Number.NaN;
  return census.samples.findIndex((sample) => Math.abs((sample["mainWidth"] ?? Number.NaN) - restWidth) > HOLD_SLACK);
}

/** Per box: how far it stood from its rest on the first flipped frame, and every later frame outside its corridor. */
function doorVerdict(census: Census, boxes: readonly string[]): { readonly travelled: number; readonly cuts: string[]; readonly strays: string[] } {
  const index = flipFrame(census);
  const flipped = census.samples[index] ?? {};
  const cuts: string[] = [];
  const strays: string[] = [];
  for (const box of boxes) {
    const rest = census.rest[box] ?? Number.NaN;
    const end = census.end[box] ?? Number.NaN;
    if (!(Math.abs((flipped[box] ?? Number.NaN) - rest) <= HOLD_SLACK)) {
      cuts.push(`${box} ${String(flipped[box])} against rest ${String(rest)}`);
    }
    const low = Math.min(rest, end) - HOLD_SLACK;
    const high = Math.max(rest, end) + HOLD_SLACK;
    for (const sample of census.samples.slice(Math.max(index, 0))) {
      const x = sample[box] ?? Number.NaN;
      if (!(x >= low && x <= high)) {
        strays.push(`${box} ${String(x)} outside ${String(low)}…${String(high)}`);
      }
    }
  }
  const travelled = boxes.filter((box) => Math.abs((census.end[box] ?? 0) - (census.rest[box] ?? 0)) > REAL_TRACK / 2).length;
  return { travelled, cuts, strays };
}

/** Record every animation that starts in the document from now on. */
function recordAnimationStarts(page: Page): Promise<void> {
  return page.evaluate(() => {
    const names: string[] = [];
    Reflect.set(globalThis, "__animationStarts", names);
    document.addEventListener("animationstart", (event) => names.push(event.animationName));
  });
}

/** The FLIPs among them: a pane's own scroll fade starts an animation too, and it is no door's motion. */
async function animationStarts(page: Page): Promise<string[]> {
  const names = z.array(z.string()).parse(await page.evaluate((): unknown => Reflect.get(globalThis, "__animationStarts")));
  return names.filter((name) => name.endsWith("-flip"));
}

/** Sum every layout shift the browser scores from now on. A click drives each case, so recent input is not filtered. */
function recordLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    const values: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ("value" in entry && typeof entry.value === "number") {
          values.push(entry.value);
        }
      }
    });
    observer.observe({ type: "layout-shift" });
    Reflect.set(globalThis, "__shiftObserver", observer);
    Reflect.set(globalThis, "__shiftValues", values);
  });
}

/** The scored total after two painted frames, with the observer's queued entries taken rather than waited for. */
async function layoutShift(page: Page): Promise<number> {
  const scored = await page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const observer: unknown = Reflect.get(globalThis, "__shiftObserver");
            const values: unknown = Reflect.get(globalThis, "__shiftValues");
            const taken = observer instanceof PerformanceObserver ? observer.takeRecords() : [];
            const fresh = taken.flatMap((entry) => ("value" in entry && typeof entry.value === "number" ? [entry.value] : []));
            if (Array.isArray(values)) {
              values.push(...fresh);
            }
            resolve(values);
          }),
        );
      }),
  );
  return z
    .array(z.number())
    .parse(scored)
    .reduce((sum, value) => sum + value, 0);
}

/** The instrument's positive control: push the content region's children down by one chrome row, a shift the browser must score. */
async function plantShift(page: Page): Promise<void> {
  await page
    .locator("main.shell-content .shell-region-fill")
    .first()
    .evaluate((region, dimensionChromeRow) => {
      const spacer = region.ownerDocument.createElement("div");
      spacer.style.blockSize = `var(${dimensionChromeRow})`;
      spacer.style.flex = "none";
      region.prepend(spacer);
    }, TOKENS["dimension.chrome-row"].cssVar);
}

function mainX(page: Page): Promise<number> {
  return page.locator(".shell-main").evaluate((element) => Math.round(element.getBoundingClientRect().x));
}

function rootFontPx(page: Page): Promise<number> {
  return page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
}

/**
 * Record each FLIP's first keyframe translate, in px, by animation name, as the animation starts: a read after the
 * click can land after a short FLIP has already finished on a loaded machine.
 */
function recordFlipKeyframes(page: Page): Promise<void> {
  return page.evaluate(() => {
    const seen: Record<string, number> = {};
    Reflect.set(globalThis, "__flipKeyframes", seen);
    document.addEventListener("animationstart", (event) => {
      const animation =
        event.target instanceof Element
          ? event.target.getAnimations().find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === event.animationName)
          : undefined;
      const translate = animation?.effect instanceof KeyframeEffect ? animation.effect.getKeyframes()[0]?.["translate"] : undefined;
      // A `calc()` with a percentage (the trail's counter reads its own width) has no px to read before it resolves, so it is not recorded.
      const px = typeof translate === "string" ? Number.parseFloat(translate) : Number.NaN;
      if (Number.isFinite(px)) {
        seen[event.animationName] = px;
      }
    });
  });
}

function flipKeyframes(page: Page): Promise<Record<string, number>> {
  return page.evaluate((): unknown => Reflect.get(globalThis, "__flipKeyframes")).then((keyframes) => z.record(z.string(), z.number()).parse(keyframes));
}

test.describe("the list door on Chats", () => {
  test.beforeEach(async ({ corpus, page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
    await routeMotion(page, corpus);
  });

  test("the content FLIP and the collapsing pane run as one event, and the grid track itself is never transitioned", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await waitForShellIdle(page);
    await page.getByRole("button", { name: "Hide list panel", exact: true }).click();
    await page.waitForFunction(() => (document.querySelector(".shell-main")?.getAnimations().length ?? 0) > 0);
    const motion = await page.evaluate(() => {
      const main = document.querySelector(".shell-main");
      const pane = document.querySelector('.shell-panel[data-panel-side="list"]');
      const grid = document.querySelector(".shell-grid");
      if (main === null || pane === null || grid === null) {
        throw new Error("The shell is not mounted");
      }
      const pushStyle = getComputedStyle(main);
      const paneStyle = getComputedStyle(pane);
      // A timing function holds commas of its own, so the transition lists split only on top-level commas.
      const arms = (list: string): string[] =>
        list
          .replace(/(?<!\()\([^)]*\)/gu, (group) => group.replaceAll(",", "\u{e000}"))
          .split(",")
          .map((part) => part.trim().replaceAll("\u{e000}", ","));
      const arm = arms(paneStyle.transitionProperty).indexOf("transform");
      return {
        push: { duration: pushStyle.animationDuration, easing: pushStyle.animationTimingFunction },
        pane: { duration: arms(paneStyle.transitionDuration)[arm] ?? "absent", easing: arms(paneStyle.transitionTimingFunction)[arm] ?? "absent" },
        gridTransition: getComputedStyle(grid).transitionProperty,
      };
    });
    expect(motion.push.duration).not.toBe("0s");
    expect(motion.push).toStrictEqual(motion.pane);
    expect(motion.gridTransition).not.toContain("grid-template-columns");
  });

  test("hiding and showing the docked list scores no meaningful layout shift", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await waitForShellIdle(page);
    await recordLayoutShift(page);
    await driveDoor(page, "Hide list panel", SECTION_BOXES);
    await driveDoor(page, "Show list panel", SECTION_BOXES);
    const toggled = await layoutShift(page);
    expect(toggled).toBeLessThan(CLS_BUDGET);
    await plantShift(page);
    expect(await layoutShift(page)).toBeGreaterThan(toggled);
  });

  test("the FLIP distance is the squeezed track and holds still while the list leaves", async ({ mount, page }) => {
    await page.setViewportSize(SQUEEZE_BINDS);
    await seedShellState(page, BOTH_DOCKED);
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    const docked = await resolvedLength(page, "var(--list-track-docked)");
    const [, listTrack = 0] = await shellTracks(page);
    expect(docked).toBeCloseTo(listTrack, 0);
    expect(docked).toBeLessThan(await resolvedLength(page, "var(--panel-w)"));
    await page.getByRole("button", { name: "Hide list panel", exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    expect(await resolvedLength(page, "var(--list-track-docked)")).toBeCloseTo(docked, 0);
  });
});

test.describe("a section swap", () => {
  test.beforeEach(async ({ corpus, page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
    await routeMotion(page, corpus);
  });

  test("with motion off the swap to Home arms no FLIP, keeps .shell-main in its corridor and scores no shift; with motion on the swap back runs it", async ({
    mount,
    page,
  }) => {
    await emulateMedia(page, { motion: "reduce" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await waitForShellIdle(page);
    await recordAnimationStarts(page);
    await recordLayoutShift(page);
    const startX = await mainX(page);
    await startSampler(page, ["main"]);
    await page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.home, exact: true }).click();
    await expect.poll(() => mainX(page)).not.toBe(startX);
    await waitForShellIdle(page);
    const endX = await mainX(page);
    const samples = (await readSamples(page)).map((frame) => frame["main"] ?? Number.NaN);
    expect(Math.abs(endX - startX)).toBeGreaterThan(REAL_TRACK);
    expect(samples.filter((x) => !(x >= Math.min(startX, endX) - 1 && x <= Math.max(startX, endX) + 1))).toStrictEqual([]);
    expect(await animationStarts(page)).toStrictEqual([]);
    const swapped = await layoutShift(page);
    expect(swapped).toBeLessThan(CLS_BUDGET);
    await plantShift(page);
    expect(await layoutShift(page)).toBeGreaterThan(swapped);

    await emulateMedia(page, {});
    await page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
    await expect.poll(() => animationStarts(page)).toContain("shell-main-flip");
  });

  test("a read of a box the page does not have throws with the box's name, instead of measuring a NaN corridor", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    // The section has no room, so the transcript row is absent: both readers must say so.
    await expect(readBoxes(page, ["row"])).rejects.toThrow(`The row box (${DOOR_BOXES.row}) is absent`);
    await startSampler(page, ["row"]);
    await expect
      .poll(() =>
        readSamples(page).then(
          () => "read",
          (error: Error) => error.message,
        ),
      )
      .toBe(`The row box (${DOOR_BOXES.row}) is absent`);
    await expect(readBoxes(page, SECTION_BOXES)).resolves.toMatchObject({ main: expect.any(Number) });
  });

  test("under full motion the swap captures the content pane only, crossfaded at a fixed scale", async ({ mount, page }) => {
    await page.addInitScript(() => {
      const seen: { pseudos: string[]; groupMorphs: boolean; fit: string; anchor: string; oldReturns: boolean }[] = [];
      Reflect.set(globalThis, "__viewTransitions", seen);
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (update?: StartViewTransitionOptions | ViewTransitionUpdateCallback): ViewTransition => {
        const transition = start(update);
        // Sampled only until THIS transition finishes, so the next swap's fresh old snapshot is never read as a return.
        let finished = false;
        const stop = (): void => {
          finished = true;
        };
        transition.finished.then(stop, stop);
        transition.ready
          .then(() => {
            const pseudos = document
              .getAnimations()
              .map((animation) => (animation.effect instanceof KeyframeEffect ? animation.effect.pseudoElement : null))
              .filter((pseudo): pseudo is string => pseudo?.startsWith("::view-transition") === true);
            const image = getComputedStyle(document.documentElement, "::view-transition-new(orb-section-content)");
            const record = {
              pseudos,
              groupMorphs: pseudos.some((pseudo) => pseudo.startsWith("::view-transition-group(")),
              fit: image.objectFit,
              anchor: image.objectPosition,
              oldReturns: false,
            };
            seen.push(record);
            // The outgoing pane fades out and must stay out until the incoming one finishes: flag any return.
            const old = getComputedStyle(document.documentElement, "::view-transition-old(orb-section-content)");
            let faded = false;
            const tick = (): void => {
              if (finished || !document.documentElement.matches(":active-view-transition")) {
                return;
              }
              const opacity = Number.parseFloat(old.opacity);
              record.oldReturns ||= faded && opacity > 0.5;
              faded ||= opacity < 0.05;
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })
          .catch(() => undefined);
        return transition;
      };
    });
    await mount<typeof AppShellStory>(STORY, {});
    const grid = page.locator(".shell-grid");
    for (const [label, id] of [
      [SECTION_LABELS.home, "home"],
      [SECTION_LABELS.chats, "chats"],
      [SECTION_LABELS.characters, "characters"],
    ] as const) {
      await page.locator(".shell-rail").getByRole("button", { name: label, exact: true }).click();
      await expect(grid).toHaveAttribute("data-section", id);
      await page.waitForFunction(() => !document.documentElement.matches(":active-view-transition"));
    }
    const seen = z
      .array(z.object({ pseudos: z.array(z.string()), groupMorphs: z.boolean(), fit: z.string(), anchor: z.string(), oldReturns: z.boolean() }))
      .parse(await page.evaluate((): unknown => Reflect.get(globalThis, "__viewTransitions")));
    expect(seen.length).toBeGreaterThan(0);
    const pseudos = seen.flatMap((transition) => transition.pseudos);
    expect(pseudos).toContain("::view-transition-new(orb-section-content)");
    expect(pseudos.filter((pseudo) => pseudo.includes("(root)"))).toStrictEqual([]);
    await page.waitForFunction(() => !document.documentElement.matches(":active-view-transition"));
    expect(seen.map(({ groupMorphs, fit, anchor, oldReturns }) => ({ groupMorphs, fit, anchor, oldReturns }))).toStrictEqual(
      seen.map(() => ({ groupMorphs: false, fit: "none", anchor: "0px 0px", oldReturns: false })),
    );
  });
});

test.describe("the doors in an open room", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
  });

  test("the LIST door holds every box it moves on the first painted frame and in its corridor, both ways, and releases its flip", async ({
    corpus,
    mount,
    page,
  }) => {
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    // The composer's track is capped at the reading measure and the row's at the dial, so the two share a centre, not an edge.
    const [rowCentre = Number.NaN, composerCentre = Number.NaN] = await page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return box === undefined ? Number.NaN : box.x + box.width / 2;
        }),
      [DOOR_BOXES.row, DOOR_BOXES.composer],
    );
    expect(Math.abs(rowCentre - composerCentre)).toBeLessThanOrEqual(1);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      const census = await driveDoor(page, leg, ROOM_BOXES);
      expect(flipFrame(census)).toBeGreaterThan(-1);
      const verdict = doorVerdict(census, LIST_DOOR);
      expect(verdict.travelled).toBeGreaterThan(0);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
      // The END-pinned trail's honest distance is zero: its corridor is a point.
      expect(Math.abs((census.end["trail"] ?? 0) - (census.rest["trail"] ?? 0))).toBeLessThanOrEqual(1);
      await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-list-flip", /.*/u);
    }
  });

  test("the CONTEXT door holds every box it moves, the list band's action included, both ways, and releases its flip", async ({ corpus, mount, page }) => {
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    for (const leg of [contextToggleLabel(true), contextToggleLabel(false)]) {
      const census = await driveDoor(page, leg, ROOM_BOXES);
      expect(flipFrame(census)).toBeGreaterThan(-1);
      const verdict = doorVerdict(census, CONTEXT_DOOR);
      expect(verdict.travelled).toBeGreaterThan(0);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
      await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-context-flip", /.*/u);
    }
  });

  test("the centred carriers' counter is half of .shell-main's FLIP, the other way", async ({ corpus, mount, page }) => {
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await waitForShellIdle(page);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      await recordFlipKeyframes(page);
      await page.getByRole("button", { name: leg, exact: true }).click();
      await expect.poll(async () => Object.keys(await flipKeyframes(page))).toEqual(expect.arrayContaining(["shell-main-flip", "shell-centre-flip"]));
      const { "shell-main-flip": main = Number.NaN, "shell-centre-flip": centre = Number.NaN } = await flipKeyframes(page);
      expect(Math.abs(main)).toBeGreaterThan(REAL_TRACK);
      expect(Math.abs(centre * -2 - main)).toBeLessThan(1);
      await waitForShellIdle(page);
    }
  });

  test("with motion off both doors arm no animation, hold the trail and the carriers in their corridors, and release the settle", async ({
    corpus,
    mount,
    page,
  }) => {
    await emulateMedia(page, { motion: "reduce" });
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await waitForShellIdle(page);
    await recordAnimationStarts(page);
    const grid = page.locator(".shell-grid");
    for (const [leg, boxes] of [
      ["Hide list panel", LIST_DOOR],
      [contextToggleLabel(true), CONTEXT_DOOR],
    ] as const) {
      const census = await driveDoor(page, leg, ROOM_BOXES);
      const verdict = doorVerdict(
        census,
        boxes.filter((box) => box !== "listPanel" && box !== "contextPanel"),
      );
      expect(verdict.strays).toStrictEqual([]);
      await expect(grid).not.toHaveAttribute("data-list-settle", /.*/u);
      await expect(grid).not.toHaveAttribute("data-context-settle", /.*/u);
    }
    expect(await animationStarts(page)).toStrictEqual([]);
  });

  test("a collapsing LIST pane keeps its squeezed width for the whole exit and re-enters at it", async ({ corpus, mount, page }) => {
    await seedShellState(page, BOTH_DOCKED);
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    await waitForShellIdle(page);
    expect((await readBoxes(page, SECTION_BOXES))["listPanelWidth"]).toBeLessThan((await resolvedLength(page, "var(--panel-w)")) - HOLD_SLACK);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      const census = await driveDoor(page, leg, ROOM_BOXES);
      const verdict = doorVerdict(census, ["listPanelWidth", ...LIST_DOOR]);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
    }
  });
});

const PHASE_TOLERANCE_MS = 1;
const ENTRY_PLAYBACK_RATE = 0.001;

// Hold the document timeline, not individual rows: newcomers must inherit the production observer's cached origin.
async function holdDoorClock(page: Page, button: string, selector: string, animationName: string): Promise<AsyncDisposable> {
  const cdp = await page.context().newCDPSession(page);
  const release = async (): Promise<void> => {
    try {
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    } finally {
      await cdp.detach();
    }
  };
  try {
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: ENTRY_PLAYBACK_RATE });
    await page.getByRole("button", { name: button, exact: true }).dispatchEvent("click");
    await page.waitForFunction(
      ({ target, name, phase }) => {
        const animation = document
          .querySelector(target)
          ?.getAnimations()
          .find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === name);
        return animation?.playState === "running" && Number(animation.currentTime) > phase;
      },
      { target: selector, name: animationName, phase: 2 * PHASE_TOLERANCE_MS },
    );
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
    return { [Symbol.asyncDispose]: release };
  } catch (error) {
    await release();
    throw error;
  }
}

test.describe("a row mounted mid-door", () => {
  test("joins the list door's flip in phase instead of starting its own from the corner", async ({ corpus, mount, page }) => {
    await seedShellState(page, BOTH_DOCKED);
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await waitForShellIdle(page);
    // The tracks already mounted, kept in page memory so the read below can tell a newcomer from them.
    await page.evaluate(() => {
      for (const track of document.querySelectorAll('[data-track="chat"]')) {
        track.setAttribute("data-ct-at-rest", "");
      }
    });
    await using _clock = await holdDoorClock(page, "Hide list panel", ".shell-main", "shell-main-flip");
    const read = await page.evaluate(async () => {
      const frame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));
      const scroller = document.querySelector('[data-slot="message-list-scroll"]');
      if (scroller === null) {
        throw new Error("The transcript scroller is absent");
      }
      const flip = (element: Element | null, name: string): Animation | undefined =>
        element?.getAnimations().find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === name);
      const reference = flip(document.querySelector(".shell-main"), "shell-main-flip");
      if (reference === undefined) {
        throw new Error("The held list door animation is absent");
      }
      scroller.scrollTop = 0;
      let newcomers: Element[] = [];
      while (reference.playState === "running" && newcomers.length === 0) {
        await frame();
        newcomers = Array.from(document.querySelectorAll('[data-track="chat"]')).filter((track) => !track.hasAttribute("data-ct-at-rest"));
      }
      // Read in the next painted frame, over the newcomers still mounted then: the list drops rows it scrolled past.
      await frame();
      const mounted = Array.from(document.querySelectorAll('[data-track="chat"]')).filter((track) => !track.hasAttribute("data-ct-at-rest"));
      return {
        reference: reference.playState === "running" ? Number(reference.currentTime) : null,
        newcomers: mounted.map((track) => {
          const animation = flip(track, "shell-centre-flip");
          return animation === undefined ? null : Number(animation.currentTime);
        }),
      };
    });
    expect(read.reference, "the door's flip had already finished, so the read proves nothing").not.toBeNull();
    expect(read.reference).toBeGreaterThan(2 * PHASE_TOLERANCE_MS);
    expect(read.newcomers.length, "the scroll mounted no row mid-door, so the read proves nothing").toBeGreaterThan(0);
    for (const time of read.newcomers) {
      expect(Math.abs((time ?? Number.NaN) - (read.reference ?? Number.NaN))).toBeLessThan(PHASE_TOLERANCE_MS);
    }
  });
});

test.describe("a row mounted mid flank door", () => {
  test("joins the flank door's flip in phase instead of starting its own from the corner", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeMotion(page, corpus, {}, true);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await expect(page.getByText(FLANK_PANEL, { exact: true })).toBeVisible();
    await waitForShellIdle(page);
    await using _clock = await holdDoorClock(
      page,
      `Hide ${SIDECAR_PANELS_NOUN}`,
      '[data-slot="chat-room-flank-row"] [data-track="chat"]',
      "room-flank-centre-flip",
    );
    const read = await page.evaluate(async (maxFrames) => {
      const frame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));
      const scroller = document.querySelector('[data-slot="message-list-scroll"]');
      if (scroller === null) {
        throw new Error("The transcript scroller is absent");
      }
      // Read the row fresh each time: the room may re-render it across the door.
      const row = (): Element | null => document.querySelector('[data-slot="chat-room-flank-row"]');
      const flip = (element: Element): Animation | undefined =>
        element.getAnimations().find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === "room-flank-centre-flip");
      const tracks = (): Element[] => Array.from(row()?.querySelectorAll('[data-track="chat"]') ?? []);
      const armed = new Set(tracks().filter((track) => flip(track) !== undefined));
      // Read before the scroll: the held clock fixes this time, and the scroll can replace every armed row.
      const at = Array.from(armed)
        .map(flip)
        .find((animation) => animation?.playState === "running");
      const reference = at === undefined ? null : Number(at.currentTime);
      scroller.scrollTop = 0;
      const newcomers = (): Element[] => tracks().filter((track) => !armed.has(track));
      for (let frames = 0; frames < maxFrames && newcomers().length === 0; frames += 1) {
        await frame();
      }
      await frame();
      return {
        reference,
        newcomers: newcomers().map((track) => {
          const animation = flip(track);
          return animation === undefined ? null : Number(animation.currentTime);
        }),
      };
    }, SAMPLE_FRAMES);
    expect(read.reference, "the door's flip had already finished, so the read proves nothing").not.toBeNull();
    expect(read.reference).toBeGreaterThan(2 * PHASE_TOLERANCE_MS);
    expect(read.newcomers.length, "the scroll mounted no row mid-door, so the read proves nothing").toBeGreaterThan(0);
    for (const time of read.newcomers) {
      expect(Math.abs((time ?? Number.NaN) - (read.reference ?? Number.NaN))).toBeLessThan(PHASE_TOLERANCE_MS);
    }
  });
});

test.describe("a door cut short", () => {
  test("a resize to a phone mid-door cancels the flip and releases its stamp", async ({ corpus, mount, page }) => {
    await seedShellState(page, BOTH_DOCKED);
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await waitForShellIdle(page);
    // The page's animation clock stands still for the door, so its flip cannot end before the resize lands; the
    // release can then only come from the cancel.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
    try {
      // Dispatched on the button: a stopped clock never lets the page's own transitions settle, which a pointer click's
      // actionability wait and hit test need.
      await page.getByRole("button", { name: "Hide list panel", exact: true }).dispatchEvent("click");
      await expect(page.locator(".shell-grid")).toHaveAttribute("data-list-flip", /.*/u);
      await page.setViewportSize(PHONE);
      await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-list-flip", /.*/u);
    } finally {
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
      await cdp.detach();
    }
  });
});

test.describe("the doors at rem 20", () => {
  test("docking the list at 1280, where the reading cap binds while docked, holds the shell's boxes", async ({ corpus, mount, page }) => {
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "chats" });
    await routeMotion(page, corpus, { fontScale: REM20 });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await expect.poll(() => rootFontPx(page)).toBeCloseTo(UA_ROOT_PX * REM20, 0);
    const dockedWidth = await page.locator(DOOR_BOXES.composer).evaluate((element) => Math.round(element.getBoundingClientRect().width));
    await driveDoor(page, "Hide list panel", ROOM_BOXES);
    // The cap binds while docked, so the carrier grows once the track goes: the clamped regime this case is for.
    expect(await page.locator(DOOR_BOXES.composer).evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeGreaterThan(
      dockedWidth + HOLD_SLACK,
    );
    const verdict = doorVerdict(await driveDoor(page, "Show list panel", ROOM_BOXES), ["main", "trail", "listPanel", ...CARRIERS]);
    expect(verdict.travelled).toBeGreaterThan(0);
    expect(verdict.cuts).toStrictEqual([]);
    expect(verdict.strays).toStrictEqual([]);
  });

  test("at 1680 the context door holds its boxes and a collapsing list keeps its exit width", async ({ corpus, mount, page }) => {
    await page.setViewportSize(WIDE_REM20);
    await seedShellState(page, { activeSection: "chats" });
    await routeMotion(page, corpus, { fontScale: REM20 });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await expect.poll(() => rootFontPx(page)).toBeCloseTo(UA_ROOT_PX * REM20, 0);
    for (const leg of [contextToggleLabel(true), contextToggleLabel(false), contextToggleLabel(true)]) {
      const verdict = doorVerdict(await driveDoor(page, leg, ROOM_BOXES), CONTEXT_DOOR);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
    }
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    expect((await readBoxes(page, SECTION_BOXES))["listPanelWidth"]).toBeLessThan((await resolvedLength(page, "var(--panel-w)")) - HOLD_SLACK);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      const verdict = doorVerdict(await driveDoor(page, leg, ROOM_BOXES), ["listPanelWidth"]);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
    }
  });
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: PHONE });

  test("the docking list sheet never enters from beyond its own width, and no shell box carries a FLIP rule", async ({ corpus, mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await routeMotion(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(DOOR_BOXES.composer)).toBeVisible();
    await expect(page.locator(DOOR_BOXES.row).first()).toBeVisible();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    await waitForShellIdle(page);
    const width = Math.round((await page.locator(LIST).boundingBox())?.width ?? 0);
    expect(width).toBeGreaterThan(REAL_TRACK);
    await startSampler(page, ["listPanel"]);
    // Each mutation-observer delivery is one task's writes, so the stamp's records, kept by delivery, show whether the
    // stamp was dropped in the task that wrote it or waited for an animation to end.
    await page.evaluate(() => {
      const deliveries: (string | null)[][] = [];
      Reflect.set(globalThis, "__flipStamps", deliveries);
      const grid = document.querySelector(".shell-grid");
      if (grid === null) {
        throw new Error("The shell grid is absent");
      }
      new MutationObserver((records) => deliveries.push(records.map((record) => record.oldValue))).observe(grid, {
        attributeFilter: ["data-list-flip"],
        attributeOldValue: true,
      });
    });
    await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    // The phone arms no FLIP, so nothing would ever end one: the stamp is released in the commit that wrote it.
    await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-list-flip", /.*/u);
    expect(z.array(z.array(z.string().nullable())).parse(await page.evaluate((): unknown => Reflect.get(globalThis, "__flipStamps")))).toStrictEqual([
      [null, "in"],
    ]);
    const names = await page
      .locator(`${DOOR_BOXES.main}, ${DOOR_BOXES.trail}, ${LIST}, ${CONTEXT}`)
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
    expect(names).toStrictEqual(["none", "none", "none", "none"]);
    await waitForShellIdle(page);
    const xs = (await readSamples(page)).map((frame) => frame["listPanel"] ?? Number.NaN);
    expect(xs.length).toBeGreaterThan(2);
    expect(xs.filter((x) => !(x >= -width - HOLD_SLACK && x <= HOLD_SLACK))).toStrictEqual([]);
    // The stamp is gone before any style reads it, so each arm is stamped here and read on the list band's action, the
    // one box a desktop door moves inside the list pane: on a phone no arm may move it.
    const arms = await page.locator(DOOR_BOXES.listAction).evaluate((action) => {
      const grid = document.querySelector(".shell-grid");
      if (grid === null) {
        throw new Error("The shell grid is absent");
      }
      return [
        ["data-list-flip", "in"],
        ["data-context-flip", "in"],
        ["data-list-settle", "in"],
      ].map(([name = "", value = ""]) => {
        grid.setAttribute(name, value);
        const style = getComputedStyle(action);
        const read = `${name}: ${style.animationName} / ${style.translate}`;
        grid.removeAttribute(name);
        return read;
      });
    });
    expect(arms).toStrictEqual(["data-list-flip: none / none", "data-context-flip: none / none", "data-list-settle: none / none"]);
  });
});

test("at an overlay width a closing details sheet keeps its box below the topbar for its whole exit", async ({ corpus, mount, page }) => {
  await page.setViewportSize(OVERLAY_WIDTH);
  await seedShellState(page, { activeSection: "chats" });
  await routeMotion(page, corpus);
  await mount<typeof AppShellStory>(STORY, {});
  const pane = page.locator(CONTEXT);
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await expect(pane).toHaveAttribute("data-panel-mode", "overlay");
  await waitForShellIdle(page);
  const openTop = Math.round((await pane.boundingBox())?.y ?? Number.NaN);
  expect(openTop).toBeGreaterThan(0);
  await page.evaluate((limit) => {
    const panel = document.querySelector('.shell-panel[data-panel-side="context"]');
    const tops: number[] = [];
    Reflect.set(globalThis, "__sheetTops", tops);
    let frames = 0;
    const tick = (): void => {
      const box = panel?.getBoundingClientRect();
      if (box !== undefined && box.left < window.innerWidth) {
        tops.push(Math.round(box.top));
      }
      frames += 1;
      if (frames < limit) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, SAMPLE_FRAMES);
  await page.getByRole("button", { name: contextToggleLabel(false), exact: true }).click();
  await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
  await waitForShellIdle(page);
  const tops = z.array(z.number()).parse(await page.evaluate((): unknown => Reflect.get(globalThis, "__sheetTops")));
  expect(tops.length).toBeGreaterThan(3);
  expect(tops.filter((top) => top !== openTop)).toStrictEqual([]);
});

// The thread's rows and the composer sit on one axis whether the plugin column is in the row, parked or absent, and the
// composer glides with the rows when the column joins or leaves.
const ROOM_TRACKS = {
  chat: '[data-slot="chat-room-flank-row"] [data-slot="message-row"]',
  composer: '[data-slot="chat-room-composer-region"] [data-track="composer"]',
} as const;
const FLANK_ROOM = { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } } as const;
const AXIS_SLACK = 1;
// What each resting state of the column asks of the room: whether it is registered, and whether its edge control hid it.
const COLUMN_STATE_NAMES = ["absent", "inline", "parked"] as const;
type ColumnState = (typeof COLUMN_STATE_NAMES)[number];
const COLUMN_STATES = {
  absent: { flank: false, hidden: false },
  inline: { flank: true, hidden: false },
  parked: { flank: true, hidden: true },
} as const satisfies Record<ColumnState, { readonly flank: boolean; readonly hidden: boolean }>;

interface TrackBox {
  readonly left: number;
  readonly width: number;
}

function readTracks(page: Page): Promise<Record<keyof typeof ROOM_TRACKS, TrackBox>> {
  return page.evaluate((selectors) => {
    const box = (selector: string): TrackBox => {
      const element = Array.from(document.querySelectorAll(selector)).at(-1);
      if (element === undefined) {
        throw new Error(`The track ${selector} is absent`);
      }
      const { left, width } = element.getBoundingClientRect();
      return { left, width };
    };
    return { chat: box(selectors.chat), composer: box(selectors.composer) };
  }, ROOM_TRACKS);
}

const centreOf = (track: TrackBox): number => track.left + track.width / 2;

/** Mount the named group room in the shell. */
function mountRoom(mount: PlaywrightTestArgs["mount"]): Promise<unknown> {
  return mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
}

/** Serve the room at `width` with the column in `state`; the caller mounts it. */
async function routeRoom(page: Page, corpus: CorpusPlayback, width: number, state: ColumnState): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await seedShellState(page, FLANK_ROOM);
  await routeMotion(page, corpus, {}, COLUMN_STATES[state].flank);
}

/** Where the mounted room's two tracks stand once the column is in `state` and the room is still. */
async function restingTracks(page: Page, state: ColumnState): Promise<Record<keyof typeof ROOM_TRACKS, TrackBox>> {
  await page.locator(ROOM_TRACKS.chat).last().waitFor();
  if (COLUMN_STATES[state].hidden) {
    await page.getByRole("button", { name: `Hide ${SIDECAR_PANELS_NOUN}`, exact: true }).click();
    await page.getByRole("button", { name: `Show ${SIDECAR_PANELS_NOUN}`, exact: true }).waitFor();
  }
  await waitForShellIdle(page);
  return readTracks(page);
}

const AxisFrames = z.array(z.object({ chat: z.number(), composer: z.number(), flipping: z.boolean() }));

/** Press `leg` and read both tracks' centres on every frame after it, with the resting boxes either side. */
async function toggleRecorded(
  page: Page,
  leg: string,
): Promise<{
  readonly before: Record<keyof typeof ROOM_TRACKS, TrackBox>;
  readonly after: Record<keyof typeof ROOM_TRACKS, TrackBox>;
  readonly frames: z.infer<typeof AxisFrames>;
}> {
  const before = await readTracks(page);
  await page.evaluate(
    ({ selectors, limit }) => {
      const frames: { chat: number; composer: number; flipping: boolean }[] = [];
      Reflect.set(globalThis, "__axisFrames", frames);
      const centre = (selector: string): number => {
        const box = Array.from(document.querySelectorAll(selector)).at(-1)?.getBoundingClientRect();
        return box === undefined ? Number.NaN : box.left + box.width / 2;
      };
      const tick = (): void => {
        frames.push({
          chat: centre(selectors.chat),
          composer: centre(selectors.composer),
          flipping: document.querySelector('[data-slot="chat-room-flank-row"]')?.hasAttribute("data-flank-flip") === true,
        });
        if (frames.length < limit) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    },
    { selectors: ROOM_TRACKS, limit: SAMPLE_FRAMES },
  );
  await page.getByRole("button", { name: leg, exact: true }).click();
  await page.waitForFunction((limit) => {
    const frames: unknown = Reflect.get(globalThis, "__axisFrames");
    return Array.isArray(frames) && frames.length >= limit;
  }, SAMPLE_FRAMES);
  const frames = AxisFrames.parse(await page.evaluate((): unknown => Reflect.get(globalThis, "__axisFrames")));
  await waitForShellIdle(page);
  return { before, after: await readTracks(page), frames };
}

// The keyframes the room's glide runs on the rows and on the composer; the CSS owns the names.
const GLIDE_ANIMATIONS = ["room-flank-centre-flip", "room-flank-composer-flip"] as const;
const GLIDE_HELD_DURATION = "20s";
const GLIDE_POLL_MS = 50;
// Where in the glide the tracks are read: its first instant, its middle and its last.
const GLIDE_POINTS = [0, 0.5, 1] as const;
const GlideCentres = z.array(z.object({ chat: z.number(), composer: z.number() }));

/**
 * Press `leg` and freeze both glides the instant they start, then read both tracks' centres at the start, middle and end
 * of the glide. The glide is read where it stands, never by painted frames, so a slow frame cannot hide a snap or invent one.
 */
async function toggleGlideSampled(
  page: Page,
  leg: string,
): Promise<{
  readonly before: Record<keyof typeof ROOM_TRACKS, TrackBox>;
  readonly after: Record<keyof typeof ROOM_TRACKS, TrackBox>;
  readonly centres: z.infer<typeof GlideCentres>;
}> {
  const before = await readTracks(page);
  // A glide this long outlasts any stalled first frame, so it is still running when it is frozen and read.
  await page.addStyleTag({ content: `.shell-grid { --shell-motion: ${GLIDE_HELD_DURATION}; }` });
  await page.evaluate((glideNames) => {
    const names: readonly string[] = glideNames;
    const onStart = (event: Event): void => {
      if (!(event instanceof AnimationEvent && names.includes(event.animationName))) {
        return;
      }
      for (const animation of document.getAnimations()) {
        if (animation instanceof CSSAnimation && names.includes(animation.animationName)) {
          animation.pause();
        }
      }
      Reflect.set(globalThis, "__glideFrozen", true);
    };
    Reflect.set(globalThis, "__glideFrozen", false);
    document.addEventListener("animationstart", onStart, { capture: true, once: true });
    // An animation starts on a rendered frame, so keep frames coming until the glide is frozen.
    const pump = (): void => {
      if (Reflect.get(globalThis, "__glideFrozen") !== true) {
        requestAnimationFrame(pump);
      }
    };
    requestAnimationFrame(pump);
  }, GLIDE_ANIMATIONS);
  await page.getByRole("button", { name: leg, exact: true }).click();
  await page.waitForFunction(() => Reflect.get(globalThis, "__glideFrozen") === true, undefined, { polling: GLIDE_POLL_MS });
  const centres = GlideCentres.parse(
    await page.evaluate(
      ({ selectors, glideNames, points }) => {
        const names: readonly string[] = glideNames;
        const glides = document
          .getAnimations()
          .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation && names.includes(animation.animationName));
        const centre = (selector: string): number => {
          const box = Array.from(document.querySelectorAll(selector)).at(-1)?.getBoundingClientRect();
          return box === undefined ? Number.NaN : box.left + box.width / 2;
        };
        const read = (point: number): { chat: number; composer: number } => {
          for (const glide of glides) {
            const duration = Number(glide.effect?.getComputedTiming().duration);
            glide.currentTime = duration * point;
          }
          return { chat: centre(selectors.chat), composer: centre(selectors.composer) };
        };
        const sampled = points.map(read);
        // The stretched duration reaches every shell animation the toggle started, so all of them end here.
        for (const animation of document.getAnimations()) {
          if (animation.timeline instanceof DocumentTimeline && animation.playState !== "finished") {
            animation.finish();
          }
        }
        return sampled;
      },
      { selectors: ROOM_TRACKS, glideNames: GLIDE_ANIMATIONS, points: GLIDE_POINTS },
    ),
  );
  await waitForShellIdle(page);
  return { before, after: await readTracks(page), centres };
}

/** Serve the room with the column in the row at 1440 under `motion`; the caller mounts it. */
async function routeFlankRoom(page: Page, corpus: CorpusPlayback, motion: "no-preference" | "reduce"): Promise<void> {
  await emulateMedia(page, { motion });
  await routeRoom(page, corpus, 1440, "inline");
}

async function settleFlankRoom(page: Page): Promise<void> {
  await page.getByText(FLANK_PANEL, { exact: true }).waitFor();
  await waitForShellIdle(page);
}

/** How far the two tracks' middles stand apart. Their caps differ by design (the dial and the reading measure), so their edges meet only where both caps give way to the room. */
function axisGap(tracks: Record<keyof typeof ROOM_TRACKS, TrackBox>): number {
  return Math.abs(centreOf(tracks.chat) - centreOf(tracks.composer));
}

test.describe("the room's one axis", () => {
  for (const width of [1280, 1440]) {
    for (const state of COLUMN_STATE_NAMES) {
      test(`at ${String(width)} the rows and the composer share a middle with the column ${state}`, async ({ corpus, mount, page }) => {
        await routeRoom(page, corpus, width, state);
        await mountRoom(mount);
        expect(axisGap(await restingTracks(page, state))).toBeLessThanOrEqual(AXIS_SLACK);
      });
    }
  }

  test("the composer glides with the rows when the column leaves and joins, with no snap at either toggle", async ({ corpus, mount, page }) => {
    await routeFlankRoom(page, corpus, "no-preference");
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await settleFlankRoom(page);
    for (const leg of [`Hide ${SIDECAR_PANELS_NOUN}`, `Show ${SIDECAR_PANELS_NOUN}`]) {
      const { before, after, centres } = await toggleGlideSampled(page, leg);
      expect(axisGap(before), "before").toBeLessThanOrEqual(AXIS_SLACK);
      expect(axisGap(after), "after").toBeLessThanOrEqual(AXIS_SLACK);
      // Every point of the glide has the two tracks on one axis.
      expect(centres.filter((point) => Math.abs(point.chat - point.composer) > AXIS_SLACK)).toStrictEqual([]);
      const travel = centreOf(after.composer) - centreOf(before.composer);
      expect(Math.abs(travel), "the toggle moved nothing, so the read proves nothing").toBeGreaterThan(REAL_TRACK / 2);
      const [first, middle, last] = centres;
      // The composer starts where it stood, is still on its way at the middle of the glide, and ends where the room puts it.
      const travelled = (centre: number | undefined): number => Math.abs((centre ?? Number.NaN) - centreOf(before.composer));
      expect(travelled(first?.composer), "the glide's first instant").toBeLessThanOrEqual(AXIS_SLACK);
      expect(travelled(middle?.composer), "the glide's middle moved").toBeGreaterThan(AXIS_SLACK);
      expect(travelled(middle?.composer), "the glide's middle has not arrived").toBeLessThan(Math.abs(travel) - AXIS_SLACK);
      expect(Math.abs((last?.composer ?? Number.NaN) - centreOf(after.composer)), "the glide's last instant").toBeLessThanOrEqual(AXIS_SLACK);
    }
  });

  test("with motion off the composer and the rows still move together, and no flip runs", async ({ corpus, mount, page }) => {
    await routeFlankRoom(page, corpus, "reduce");
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    await settleFlankRoom(page);
    for (const leg of [`Hide ${SIDECAR_PANELS_NOUN}`, `Show ${SIDECAR_PANELS_NOUN}`]) {
      const { before, after, frames } = await toggleRecorded(page, leg);
      expect(axisGap(before), "before").toBeLessThanOrEqual(AXIS_SLACK);
      expect(axisGap(after), "after").toBeLessThanOrEqual(AXIS_SLACK);
      expect(frames.filter((frame) => Math.abs(frame.chat - frame.composer) > AXIS_SLACK)).toStrictEqual([]);
      expect(Math.abs(centreOf(after.composer) - centreOf(before.composer)), "the toggle moved nothing, so the read proves nothing").toBeGreaterThan(
        REAL_TRACK / 2,
      );
      expect(nonEmpty(frames).some((frame) => frame.flipping)).toBe(false);
    }
  });
});
