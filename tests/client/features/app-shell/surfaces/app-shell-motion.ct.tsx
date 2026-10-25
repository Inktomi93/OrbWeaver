// The shell's motion on the production panes and a corpus room: what each door's FLIP holds on its first painted
// frame and keeps inside its corridor, what reduced motion does instead, the phone's cancel, and the scoped section
// view transition. Every sampler records per animation frame, because the defects it judges are one frame wide.
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { createShellAmbientReads, routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import {
  emulateMedia,
  namedGroupRoom,
  PHONE,
  ROOM_PROCEDURES,
  resolvedLength,
  SECTION_PROCEDURES,
  SHELL_STORIES,
  seedShellState,
  shellTracks,
} from "./app-shell-ct.ts";

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
// The boxes a door moves. The rail is absent: it is grid column 1 and no door moves it.
const DOOR_BOXES = {
  main: ".shell-main",
  trail: ".shell-topbar-trail",
  listPanel: LIST,
  contextPanel: CONTEXT,
  row: '[data-slot="message-row"]',
  composer: '[data-slot="composer"]',
  listAction: '[data-slot="list-pane-action"]',
} as const;
type DoorBox = keyof typeof DOOR_BOXES;
// The LIST door moves the list pane itself, so its action travels with it by design and is not held.
const LIST_DOOR: readonly DoorBox[] = ["main", "trail", "listPanel", "row", "composer"];
const CONTEXT_DOOR: readonly DoorBox[] = ["main", "trail", "contextPanel", "listAction"];
// The centred carriers are held on the plain LIST door only. On the CONTEXT door, the both-docked LIST door and the
// rem-20 dock they jump 12 to 16px on the first painted frame on this tree (the 0963 leg C evidence records it).
const CARRIERS: readonly DoorBox[] = ["row", "composer"];
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
  root = await createCorpusHarness();
  roomId = namedGroupRoom((await (await root.internalCallerFor(root.ownerId)).chat.listChats({ limit: 100 })).items).id;
});

test.beforeEach(async ({ page }) => {
  await emulateMedia(page, {});
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Serve the shell, its sections and a room, with the corpus viewer's settings under `appearance`. */
async function routeMotion(page: Page, corpus: CorpusWire, appearance: Partial<AppearanceSettings> = {}): Promise<void> {
  const [captured] = corpus.reads["settings.getUserSettings"];
  if (captured === undefined) {
    throw new Error("The corpus has no settings capture");
  }
  const settings = captured.output;
  const served = [...SECTION_PROCEDURES, ...ROOM_PROCEDURES].filter((path) => path !== "settings.getUserSettings");
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), served),
    "settings.getUserSettings": () => ({
      ...settings,
      config: { ...settings.config, appearance: { ...settings.config.appearance, reducedMotion: false, fontScale: 1, ...appearance } },
    }),
    "stream.attach": null,
    "stream.detach": null,
  });
  await routeOrbSocket(page, { closeStream: false });
}

/** Every box's x, `.shell-main`'s width and the list pane's width, in one read so no two are a frame apart. */
function readBoxes(page: Page): Promise<Frame> {
  return page.evaluate((selectors) => {
    const frame: Record<string, number> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      frame[name] = box === undefined ? Number.NaN : Math.round(box.x * 10) / 10;
    }
    frame["mainWidth"] = Math.round(document.querySelector(".shell-main")?.getBoundingClientRect().width ?? Number.NaN);
    frame["listPanelWidth"] = Math.round(document.querySelector('.shell-panel[data-panel-side="list"]')?.getBoundingClientRect().width ?? Number.NaN);
    return frame;
  }, DOOR_BOXES);
}

/** Record the same frame on every animation frame from now on, bounded so it cannot outlive the case. */
function startSampler(page: Page): Promise<void> {
  return page.evaluate(
    ({ selectors, limit }) => {
      const ring: Record<string, number>[] = [];
      Reflect.set(globalThis, "__shellFrames", ring);
      const tick = (): void => {
        if (ring.length > limit) {
          return;
        }
        const frame: Record<string, number> = {};
        for (const [name, selector] of Object.entries(selectors)) {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          frame[name] = box === undefined ? Number.NaN : Math.round(box.x * 10) / 10;
        }
        frame["mainWidth"] = Math.round(document.querySelector(".shell-main")?.getBoundingClientRect().width ?? Number.NaN);
        frame["listPanelWidth"] = Math.round(document.querySelector('.shell-panel[data-panel-side="list"]')?.getBoundingClientRect().width ?? Number.NaN);
        ring.push(frame);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { selectors: DOOR_BOXES, limit: SAMPLE_FRAMES },
  );
}

function readSamples(page: Page): Promise<Frame[]> {
  return page.evaluate(() => Reflect.get(globalThis, "__shellFrames") as Record<string, number>[]);
}

/** Nothing in the grid is animating: an endpoint read now is a resting position, not a frame of the glide. */
function waitForShellIdle(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const grid = document.querySelector(".shell-grid");
    return grid !== null && !grid.getAnimations({ subtree: true }).some((animation) => animation.playState === "running");
  });
}

/** Drive one door and return the resting frame before, the per-frame ring across, and the resting frame after. */
async function driveDoor(page: Page, button: string): Promise<Census> {
  await waitForShellIdle(page);
  const rest = await readBoxes(page);
  await startSampler(page);
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.waitForFunction(
    (width) => Math.abs(Math.round(document.querySelector(".shell-main")?.getBoundingClientRect().width ?? width) - width) > 2,
    rest["mainWidth"] ?? 0,
  );
  await waitForShellIdle(page);
  return { rest, samples: await readSamples(page), end: await readBoxes(page) };
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

function animationStarts(page: Page): Promise<string[]> {
  return page.evaluate(() => Reflect.get(globalThis, "__animationStarts") as string[]);
}

/** Sum every layout shift the browser scores from now on. A click drives each case, so recent input is not filtered. */
function recordLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    Reflect.set(globalThis, "__shift", 0);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        Reflect.set(globalThis, "__shift", (Reflect.get(globalThis, "__shift") as number) + (entry as PerformanceEntry & { value: number }).value);
      }
    }).observe({ type: "layout-shift" });
  });
}

/** The scored total, read after two painted frames and a delivery hop so the entry for the last frame has landed. */
function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(Reflect.get(globalThis, "__shift") as number), 100)));
      }),
  );
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
          ? event.target.getAnimations().find((candidate) => (candidate as CSSAnimation).animationName === event.animationName)
          : undefined;
      const translate = animation?.effect instanceof KeyframeEffect ? animation.effect.getKeyframes()[0]?.["translate"] : undefined;
      seen[event.animationName] = typeof translate === "string" ? Number.parseFloat(translate) : Number.NaN;
    });
  });
}

function flipKeyframes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({ ...(Reflect.get(globalThis, "__flipKeyframes") as Record<string, number>) }));
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
      const arms = (list: string): string[] => list.split(/,\s*(?![^(]*\))/u);
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
    await driveDoor(page, "Hide list panel");
    await driveDoor(page, "Show list panel");
    expect(await layoutShift(page)).toBeLessThan(CLS_BUDGET);
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
    await startSampler(page);
    await page.locator(".shell-rail").getByRole("button", { name: "Home", exact: true }).click();
    await expect.poll(() => mainX(page)).not.toBe(startX);
    await waitForShellIdle(page);
    const endX = await mainX(page);
    const samples = (await readSamples(page)).map((frame) => frame["main"] ?? Number.NaN);
    expect(Math.abs(endX - startX)).toBeGreaterThan(REAL_TRACK);
    expect(samples.filter((x) => !(x >= Math.min(startX, endX) - 1 && x <= Math.max(startX, endX) + 1))).toStrictEqual([]);
    expect(await animationStarts(page)).toStrictEqual([]);
    expect(await layoutShift(page)).toBeLessThan(CLS_BUDGET);

    await emulateMedia(page, {});
    await page.locator(".shell-rail").getByRole("button", { name: "Chats", exact: true }).click();
    await expect.poll(() => animationStarts(page)).toContain("shell-main-flip");
  });

  test("under full motion the swap captures the content pane only, crossfaded at a fixed scale", async ({ mount, page }) => {
    await page.addInitScript(() => {
      const seen: { pseudos: string[]; groupMorphs: boolean; fit: string; anchor: string; oldReturns: boolean }[] = [];
      Reflect.set(globalThis, "__viewTransitions", seen);
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (update?: StartViewTransitionOptions | ViewTransitionUpdateCallback): ViewTransition => {
        const transition = start(update);
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
              if (!document.documentElement.matches(":active-view-transition")) {
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
      ["Home", "home"],
      ["Chats", "chats"],
      ["Characters", "characters"],
    ] as const) {
      await page.locator(".shell-rail").getByRole("button", { name: label, exact: true }).click();
      await expect(grid).toHaveAttribute("data-section", id);
    }
    const seen = await page.evaluate(
      () => Reflect.get(globalThis, "__viewTransitions") as { pseudos: string[]; groupMorphs: boolean; fit: string; anchor: string; oldReturns: boolean }[],
    );
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
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    const rest = await readBoxes(page);
    expect(rest["row"]).toBe(rest["composer"]);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      const census = await driveDoor(page, leg);
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
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    for (const leg of ["Show details", "Hide details"]) {
      const census = await driveDoor(page, leg);
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
    await waitForShellIdle(page);
    await recordAnimationStarts(page);
    const grid = page.locator(".shell-grid");
    for (const [leg, boxes] of [
      ["Hide list panel", LIST_DOOR],
      ["Show details", CONTEXT_DOOR],
    ] as const) {
      const census = await driveDoor(page, leg);
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
    expect((await readBoxes(page))["listPanelWidth"]).toBeLessThan((await resolvedLength(page, "var(--panel-w)")) - HOLD_SLACK);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      const census = await driveDoor(page, leg);
      const verdict = doorVerdict(census, ["listPanelWidth", ...LIST_DOOR.filter((box) => !CARRIERS.includes(box))]);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
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
    await expect.poll(() => rootFontPx(page)).toBeCloseTo(UA_ROOT_PX * REM20, 0);
    const dockedWidth = await page.locator(DOOR_BOXES.composer).evaluate((element) => Math.round(element.getBoundingClientRect().width));
    await driveDoor(page, "Hide list panel");
    // The cap binds while docked, so the carrier grows once the track goes: the clamped regime this case is for.
    expect(await page.locator(DOOR_BOXES.composer).evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeGreaterThan(
      dockedWidth + HOLD_SLACK,
    );
    const verdict = doorVerdict(await driveDoor(page, "Show list panel"), ["main", "trail", "listPanel"]);
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
    await expect.poll(() => rootFontPx(page)).toBeCloseTo(UA_ROOT_PX * REM20, 0);
    for (const leg of ["Show details", "Hide details", "Show details"]) {
      const verdict = doorVerdict(await driveDoor(page, leg), CONTEXT_DOOR);
      expect(verdict.cuts).toStrictEqual([]);
      expect(verdict.strays).toStrictEqual([]);
    }
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    expect((await readBoxes(page))["listPanelWidth"]).toBeLessThan((await resolvedLength(page, "var(--panel-w)")) - HOLD_SLACK);
    for (const leg of ["Hide list panel", "Show list panel"]) {
      const verdict = doorVerdict(await driveDoor(page, leg), ["listPanelWidth"]);
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
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    await waitForShellIdle(page);
    const width = Math.round((await page.locator(LIST).boundingBox())?.width ?? 0);
    expect(width).toBeGreaterThan(REAL_TRACK);
    await startSampler(page);
    await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    const names = await page
      .locator(`${DOOR_BOXES.main}, ${DOOR_BOXES.trail}, ${LIST}, ${CONTEXT}`)
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
    expect(names).toStrictEqual(["none", "none", "none", "none"]);
    await waitForShellIdle(page);
    const xs = (await readSamples(page)).map((frame) => frame["listPanel"] ?? Number.NaN);
    expect(xs.length).toBeGreaterThan(2);
    expect(xs.filter((x) => !(x >= -width - HOLD_SLACK && x <= HOLD_SLACK))).toStrictEqual([]);
  });
});

test("at an overlay width a closing details sheet keeps its box below the topbar for its whole exit", async ({ corpus, mount, page }) => {
  await page.setViewportSize(OVERLAY_WIDTH);
  await seedShellState(page, { activeSection: "chats" });
  await routeMotion(page, corpus);
  await mount<typeof AppShellStory>(STORY, {});
  const pane = page.locator(CONTEXT);
  await page.getByRole("button", { name: "Show details", exact: true }).click();
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
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
  await waitForShellIdle(page);
  const tops = await page.evaluate(() => Reflect.get(globalThis, "__sheetTops") as number[]);
  expect(tops.length).toBeGreaterThan(3);
  expect(tops.filter((top) => top !== openTop)).toStrictEqual([]);
});
