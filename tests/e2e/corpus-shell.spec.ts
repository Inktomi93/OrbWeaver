// The app shell on the committed corpus: boot readiness and focus, the lazy route's failure surface, the census
// each screen prints, and the phone's tab bar, You sheet and push-and-Back navigation.
import { CORPUS_MODE_LABELS } from "@orb/client/lib";
import { HOME_QUICK_PICKS_LIMIT } from "@orb/contracts/character";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Locator, Page } from "@playwright/test";
import type { ActorClient } from "./support/actors.ts";
import { ownerActor } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";
import { holdTrpcProcedure, isTrpcRequestFor, mintFreshCharacter, removeCharacter } from "./support/trpc.ts";

const LIST_PANEL = '.shell-panel[data-panel-side="list"]';
const CONTEXT_PANEL = '.shell-panel[data-panel-side="context"]';
const LIST_BAND_TITLE = '[data-slot="list-pane-title"]';
const SCREEN_NAME = ".shell-topbar-title";
const GRID = ".shell-grid";
const MAIN = "main.shell-content";
// The lazily imported authenticated graph's built chunk (`compose/authed-app.tsx`).
const AUTHED_APP_CHUNK = /\/authed-app-[\w-]+\.js(?:\?.*)?$/u;
const EXPORT_CLAUSE = "export{";
const REWRITTEN_BODY_HEADERS = new Set(["content-encoding", "content-length", "etag"]);
const ROUTE_CRASH = "corpus shell route render crashed";
const SKIP_LINK = "Skip to content";
// The topbar's list toggle in both regimes: a desktop names the panel, a phone names the screen a tap lands on.
const LIST_TOGGLE = /^(?:(?:Show|Hide) list panel|Show .+ (?:list|overview))$/u;
// The phone's curated bar: three tab sections and the You sheet's door.
const PHONE_BAR = ["Home", "Chats", "Characters", "You"] as const;
const PHONE_ONLY = "The bottom bar, the You sheet and push-and-Back are the phone's navigation model";
const PROBE_GREETING = "The shell probe waits.";
const PROBE_NAMES = ["Shell Probe Aster", "Shell Probe Birch"] as const;
const PROBE_DRAFT = "Shell Probe Aster, unsaved";

/** The real chunk with every export rebound to a namespace whose `AuthedApp` throws on render. The bundler renames a
 *  chunk's exports, so the names are read from the chunk the server actually served. */
function crashingAuthedAppChunk(real: string): string {
  const clause = real.slice(real.lastIndexOf(EXPORT_CLAUSE) + EXPORT_CLAUSE.length, real.lastIndexOf("}"));
  const names = clause.split(",").map((binding) => binding.split(" as ").at(-1)?.trim() ?? "");
  if (names.length === 0 || names.includes("")) {
    throw new Error("The authed-app chunk carries no export clause");
  }
  const rebound = names.map((name) => `crashing as ${name}`).join(",");
  return `const crashing = { AuthedApp() { throw new Error(${JSON.stringify(ROUTE_CRASH)}); } };\nexport { ${rebound} };`;
}

function rail(page: Page): Locator {
  return page.getByRole("navigation", { name: "Primary" });
}

function listPanel(page: Page): Locator {
  return page.locator(LIST_PANEL);
}

async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
}

/** The phone reaches a section from its bar, else through the You sheet. The bar lends the section you stand in a slot,
 *  so an overflow section already open is a tab, not a sheet row. */
async function reachOnPhone(page: Page, label: string): Promise<void> {
  const tab = rail(page).getByRole("button", { name: label, exact: true });
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await rail(page).getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
  // The sheet aria-hides the frame behind it, so the frame is read only once the sheet is gone.
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

interface CensusCase {
  /** The rail and You-sheet door's name. */
  readonly section: string;
  /** A Corpus mode picked once the section shows. */
  readonly mode?: (typeof CORPUS_MODE_LABELS)[keyof typeof CORPUS_MODE_LABELS];
  /** The name the screen and the band print the census beside. */
  readonly label: string;
  /** The desktop LIST band's title where it differs from `label`. */
  readonly bandTitle?: string;
  /** A content-first section docks its LIST only on request. */
  readonly listStartsCollapsed?: boolean;
  /** A phone lands this mode on CONTENT, so its band rides the LIST pane off screen rather than being shed. */
  readonly bandOffScreen?: boolean;
  /** A search typed into the section's own finder before the census is read. */
  readonly search?: { readonly box: string; readonly term: (host: ActorClient) => Promise<string> };
  /** The census text, built from live reads; `null` for an empty census, which prints nothing. */
  readonly census: (host: ActorClient) => Promise<string | null>;
}

/** A census of one number, or nothing when the list is empty. */
function countCensus(count: number): string | null {
  return count === 0 ? null : String(count);
}

/** A name fragment that matches some of the owner's characters but not all, so a narrowed census reads `n of m`. */
async function partialCharacterSearch(host: ActorClient): Promise<string> {
  const [first] = (await host.trpc.character.list.query({ archived: false })).items;
  const term = first?.name.split(" ")[0];
  if (term === undefined) {
    throw new Error("Corpus has no character to search for");
  }
  return term;
}

const CHARACTER_SEARCH = "Search characters";

const CENSUS_CASES: readonly CensusCase[] = [
  { section: "Chats", label: "Chats", census: async (host) => countCensus(await host.trpc.chat.countChats.query({})) },
  { section: "Characters", label: "Characters", census: async (host) => countCensus(await host.trpc.character.count.query({ archived: false })) },
  {
    section: "Characters",
    label: "Characters",
    search: { box: CHARACTER_SEARCH, term: partialCharacterSearch },
    census: async (host) => {
      const search = await partialCharacterSearch(host);
      const shown = await host.trpc.character.count.query({ archived: false, search });
      const total = await host.trpc.character.count.query({ archived: false });
      if (shown === 0 || shown >= total) {
        throw new Error("The narrowing search must match some characters but not all");
      }
      return `${String(shown)} of ${String(total)}`;
    },
  },
  {
    section: "Corpus",
    label: CORPUS_MODE_LABELS.explore,
    census: async (host) => {
      const { totalDistilled, totalCharacters } = await host.trpc.discovery.catalog.query();
      if (totalDistilled === 0 || totalDistilled >= totalCharacters) {
        throw new Error("The Explore census case needs a partly distilled corpus");
      }
      return `${String(totalDistilled)} of ${String(totalCharacters)} distilled`;
    },
  },
  {
    section: "Corpus",
    mode: CORPUS_MODE_LABELS.insights,
    label: CORPUS_MODE_LABELS.insights,
    listStartsCollapsed: true,
    bandOffScreen: true,
    census: async (host) => {
      const { rows, total } = await host.trpc.stats.leaderboard.query({});
      // The committed corpus ranks fewer characters than one leaderboard page holds, so the page is the whole
      // population and the census is the bare count; the narrowed Characters case owns the `n of m` arm.
      if (rows.length !== total) {
        throw new Error("The Insights census case expects the whole leaderboard on one page");
      }
      return countCensus(total);
    },
  },
  {
    section: "Corpus",
    mode: CORPUS_MODE_LABELS.labels,
    label: CORPUS_MODE_LABELS.labels,
    census: async (host) => countCensus((await host.trpc.tag.listTagsWithUsage.query()).length),
  },
  { section: "Presets", label: "Presets", census: async (host) => countCensus((await host.trpc.preset.list.query()).length) },
  { section: "Databank", label: "Databank", census: async (host) => countCensus((await host.trpc.databank.bankHealth.query()).total) },
  {
    section: "Refinery",
    label: "Refinery",
    bandTitle: "Sessions",
    listStartsCollapsed: true,
    census: async (host) => countCensus((await host.trpc.refinery.listSessions.query()).length),
  },
];

async function reachCensusScreen(page: Page, host: ActorClient, kase: CensusCase, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await reachOnPhone(page, kase.section);
  } else {
    await rail(page).getByRole("button", { name: kase.section, exact: true }).click();
  }
  if (kase.mode !== undefined) {
    await page.getByRole("radio", { name: kase.mode, exact: true }).first().click();
  }
  if (kase.search !== undefined) {
    await page.getByRole("textbox", { name: kase.search.box, exact: true }).fill(await kase.search.term(host));
  }
}

/** Where the LIST band's title is: not rendered, rendered outside the viewport, or on screen. */
async function bandPlacement(band: Locator): Promise<"hidden" | "off screen" | "on screen"> {
  if (await band.isHidden()) {
    return "hidden";
  }
  const outside = await band.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight;
  });
  return outside ? "off screen" : "on screen";
}

/** A library row in the LIST pane, named by its character. */
function libraryRow(page: Page, name: string): Locator {
  return listPanel(page).getByRole("button", { name, exact: true });
}

/** Is focus on the content anchor a selection reveals: the main region itself, or the form's own frame? */
function focusOnContentAnchor(main: Locator): Promise<boolean> {
  return main.evaluate((node) => document.activeElement === node || document.activeElement === node.querySelector("form")?.parentElement);
}

test.describe("committed corpus shell", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("a cold load moves focus nowhere and the first Tab reaches the skip link", { tag: "@smoke" }, async ({ page }) => {
    // Every focus the boot makes, recorded from before the document's first script.
    await page.addInitScript(() => {
      const trail: string[] = [];
      Reflect.set(globalThis, "__shellFocusTrail", trail);
      document.addEventListener("focusin", (event) => {
        trail.push(event.target instanceof Element ? event.target.outerHTML.slice(0, 120) : "?");
      });
    });
    await openHome(page);
    await expect(page.getByRole("main", { name: "Home content" })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(globalThis, "__shellFocusTrail"))).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: SKIP_LINK, exact: true })).toBeFocused();
  });

  test("the app is not ready until Home's first chat read lands", { tag: "@smoke" }, async ({ page }) => {
    const chats = await holdTrpcProcedure(page, "chat.listChats");
    await page.goto("/");
    await chats.requested;
    // The shell is mounted and asking; the gate must still be shut while Home's own read is out.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeAttached();
    await expect(page.locator("html")).not.toHaveAttribute("data-app-ready");
    // The client batches Home's first reads into one request, and one HTTP response cannot answer part of a batch, so
    // the hold delays the chat read's whole batch. The gate's rule is "no read in flight", which every read in that
    // batch exercises the same way, so holding the batch tests the same rule as holding the chat read alone.
    await chats.release();
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
    await expect(page.locator('[data-home-tile="chat.masthead"] [aria-busy]')).toHaveCount(0);
  });

  test("Home keeps its section chips on a desktop and drops them on a phone", { tag: "@smoke" }, async ({ page, isMobile }) => {
    await openHome(page);
    await expect(page.locator('[data-home-tile="chat.quickPicks"]')).toBeVisible();
    await expect(page.locator('[data-home-tile="home.jump"]')).toHaveCount(isMobile ? 0 : 1);
  });

  test("a phone's list screen carries its census in the screen name and sheds the band's copy", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "The screen name is the phone's one identity");
    const host = ownerActor(baseURL ?? "");
    await openHome(page);
    for (const kase of CENSUS_CASES) {
      const census = await kase.census(host);
      await reachCensusScreen(page, host, kase, isMobile);
      const screenName = page.locator(SCREEN_NAME);
      await expect(screenName).toBeVisible();
      await expect(screenName).toHaveText(census === null ? kase.label : `${kase.label} · ${census}`);
      // One census per regime: the band, where the other copy lives, is shed, or rides its pane off screen.
      await expect.poll(() => bandPlacement(page.locator(LIST_BAND_TITLE))).toBe(kase.bandOffScreen === true ? "off screen" : "hidden");
    }
  });

  test("a desktop list screen keeps its census in the LIST band and paints no narrow name", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "The LIST band is the desktop's census");
    const host = ownerActor(baseURL ?? "");
    await openHome(page);
    for (const kase of CENSUS_CASES) {
      const census = await kase.census(host);
      await reachCensusScreen(page, host, kase, isMobile);
      // A content-first section boots with its LIST collapsed; the toggle is the desktop's door to the band.
      if (kase.listStartsCollapsed === true && (await listPanel(page).getAttribute("data-panel-mode")) === "collapsed") {
        await page.getByRole("button", { name: "Show list panel" }).click();
      }
      // The heading's text is its title then its census, with no separator text between the two.
      await expect(page.locator(LIST_BAND_TITLE)).toHaveText(`${kase.bandTitle ?? kase.label}${census ?? ""}`);
      // Both identity arms are in the DOM in both regimes, so this asserts paint, not presence.
      await expect(page.locator(SCREEN_NAME)).toBeHidden();
    }
  });

  test("a failed authed-app chunk shows Retry, not the pending splash, and Retry reloads", { tag: "@smoke" }, async ({ page }) => {
    let chunkRequests = 0;
    let documents = 0;
    page.on("request", (request) => {
      documents += request.isNavigationRequest() && request.frame() === page.mainFrame() ? 1 : 0;
    });
    // A chunk that evaluates to a throw rejects the dynamic import with a plain Error, the failure a broken deploy serves.
    await page.route(AUTHED_APP_CHUNK, async (route) => {
      chunkRequests += 1;
      await route.fulfill({ status: 200, contentType: "text/javascript", body: 'throw new Error("chunk exploded");' });
    });
    await page.goto("/");
    // The built app's stale-chunk recovery reloads the tab once (`vite:preloadError` in `main.tsx`); only the second
    // document's surface is the settled one, so wait for it before reading Retry.
    await expect.poll(() => documents).toBe(2);
    await page.waitForLoadState("load");
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
    // Each document asked for the chunk once, so nothing loops.
    expect(chunkRequests).toBe(documents);
    await Promise.all([page.waitForEvent("framenavigated"), retry.click()]);
    // Retry is the third document, and it asks for the chunk again.
    await expect.poll(() => documents).toBe(3);
    await expect.poll(() => chunkRequests).toBe(3);
  });

  test("a route render crash reports once and lands on the retry surface", { tag: "@smoke" }, async ({ page }) => {
    const reports: string[] = [];
    page.on("request", (request) => {
      if (isTrpcRequestFor(request.url(), "clientError")) {
        reports.push(request.postData() ?? "");
      }
    });
    await page.route(AUTHED_APP_CHUNK, async (route) => {
      const real = await route.fetch();
      // The served bytes may be precompressed; the rewritten body is plain text, so its encoding headers go.
      const headers = Object.fromEntries(Object.entries(real.headers()).filter(([name]) => !REWRITTEN_BODY_HEADERS.has(name)));
      await route.fulfill({ status: real.status(), headers, body: crashingAuthedAppChunk(await real.text()) });
    });
    const reported = page.waitForResponse((response) => isTrpcRequestFor(response.url(), "clientError"));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    expect((await reported).ok()).toBe(true);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain(ROUTE_CRASH);
  });

  test("a slow Refinery list read keeps the shell mounted and only the list region waits", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "The docked LIST beside the shell is the desktop regime");
    const sessions = await ownerActor(baseURL ?? "").trpc.refinery.listSessions.query();
    await openHome(page);
    // Dock the Refinery's LIST once, so the next cold entry mounts its body in the section-switch commit itself.
    await rail(page).getByRole("button", { name: "Refinery", exact: true }).click();
    if ((await listPanel(page).getAttribute("data-panel-mode")) === "collapsed") {
      await page.getByRole("button", { name: "Show list panel" }).click();
    }
    await expect(listPanel(page)).toHaveAttribute("data-panel-mode", "docked");
    await rail(page).getByRole("button", { name: "Home", exact: true }).click();
    await openHome(page);

    const held = await holdTrpcProcedure(page, "refinery.listSessions");
    await rail(page).getByRole("button", { name: "Refinery", exact: true }).click();
    await held.requested;
    await expect(rail(page)).toBeVisible();
    await expect(page.locator(".shell-topbar")).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading", exact: true })).toHaveCount(0);
    await held.release();
    const first = sessions[0];
    if (first === undefined) {
      throw new Error("Corpus has no refinery session");
    }
    await expect(listPanel(page).getByText(first.characterName, { exact: true }).first()).toBeVisible();
  });

  test("a desktop Settings roster stays docked beside CONTENT with no Back row", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(isMobile, "The control arm of the phone's push: the desktop regime");
    await openHome(page);
    await rail(page).getByRole("button", { name: "Settings", exact: true }).click();
    const list = listPanel(page);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    const box = await list.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.width ?? 0).toBeLessThan(viewport?.width ?? 0);
    await expect(page.locator(MAIN)).not.toHaveAttribute("inert", "");
    await list.getByRole("button", { name: /World Info/u }).click();
    await expect(page.locator('[data-slot="collection-control-row"]')).toBeVisible();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.getByRole("button", { name: "Back to Settings" })).toHaveCount(0);
    await expect(page.locator(".shell-topbar").getByRole("button", { name: LIST_TOGGLE })).toBeVisible();
  });
});

test.describe("committed corpus shell on a phone", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("the bottom bar is the curated four and a tab switches the section", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    await openHome(page);
    const bar = rail(page);
    for (const name of PHONE_BAR) {
      await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(bar.getByRole("button", { name: "Corpus", exact: true })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Refinery", exact: true })).toHaveCount(0);
    await expect(bar.getByRole("button")).toHaveCount(PHONE_BAR.length);

    await bar.getByRole("button", { name: "Characters", exact: true }).click();
    await expect(bar.getByRole("button", { name: "Characters", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("textbox", { name: "Search characters", exact: true })).toBeVisible();
    await expect(page.getByRole("main", { name: "Home content" })).toBeHidden();
  });

  test("the You sheet routes an overflow section and closes; its Settings row lands on the Settings section", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    await openHome(page);
    await rail(page).getByRole("button", { name: "You", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Refinery", exact: true })).toBeVisible();

    await sheet.getByRole("button", { name: "Presets", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(GRID)).toHaveAttribute("data-section", "presets");

    await rail(page).getByRole("button", { name: "You", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // On a phone the roster is the screen, so the Settings roster carries the one main landmark.
    await expect(page.getByRole("main", { name: "Settings", exact: true }).getByRole("region", { name: "Settings groups" })).toBeVisible();
    await expect(rail(page).getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("a roster is the screen, a real row pushes its member with one Back, and Back pops it", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    const host = ownerActor(baseURL ?? "");
    const character = (await host.trpc.character.list.query({})).items[0];
    const document = (await host.trpc.databank.list.query({})).items[0];
    if (character === undefined || document === undefined) {
      throw new Error("Corpus has no character or document");
    }
    const walks: readonly { readonly section: string; readonly open: (page: Page) => Promise<void> }[] = [
      { section: "Chats", open: async (p) => p.getByRole("list", { name: "Chats list", exact: true }).getByRole("button").first().click() },
      { section: "Characters", open: async (p) => libraryRow(p, character.name).click() },
      { section: "Databank", open: async (p) => listPanel(p).getByRole("button", { name: document.name }).first().click() },
    ];
    await openHome(page);
    for (const { section, open } of walks) {
      await reachOnPhone(page, section);
      const back = page.getByRole("button", { name: `Back to ${section}`, exact: true });
      await expect(listPanel(page)).toHaveAttribute("data-panel-mode", "docked");
      await expect(page.locator(MAIN)).toHaveAttribute("inert", "");
      await expect(back).toHaveCount(0);

      await open(page);
      await expect(listPanel(page)).toHaveAttribute("data-panel-mode", "collapsed");
      await expect(page.locator(MAIN)).not.toHaveAttribute("inert", "");
      await expect(back).toBeVisible();

      await back.click();
      await expect(listPanel(page)).toHaveAttribute("data-panel-mode", "docked");
      await expect(back).toHaveCount(0);
    }
  });

  test("an open room gives the tab bar's row to the room, and Back closes the details sheet before the room", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    await openHome(page);
    await reachOnPhone(page, "Chats");
    const grid = page.locator(GRID);
    const context = page.locator(CONTEXT_PANEL);
    await page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button").first().click();
    await expect(grid).toHaveAttribute("data-room-screen", "true");
    await expect(page.locator(".shell-rail")).toHaveCount(0);

    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    // With the sheet open the chevron only closes it, and says so.
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(grid).toHaveAttribute("data-room-screen", "true");

    await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
    await expect(grid).not.toHaveAttribute("data-room-screen", /.*/u);
    await expect(rail(page)).toBeVisible();
    await expect(listPanel(page)).toHaveAttribute("data-panel-mode", "docked");
  });

  test("a room resumed from Home returns to Home; one opened inside Chats afterwards returns to the Chats list", { tag: "@smoke" }, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, PHONE_ONLY);
    await openHome(page);
    const grid = page.locator(GRID);
    await expect(grid).toHaveAttribute("data-section", "home");
    await page.locator("[data-home-hearth]").click();
    await expect(grid).toHaveAttribute("data-section", "chats");
    await expect(grid).toHaveAttribute("data-room-screen", "true");

    await page.getByRole("button", { name: "Back to Home", exact: true }).click();
    await expect(grid).toHaveAttribute("data-section", "home");
    await expect(grid).not.toHaveAttribute("data-room-screen", /.*/u);

    await reachOnPhone(page, "Chats");
    await page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button").first().click();
    await expect(grid).toHaveAttribute("data-room-screen", "true");
    await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
    await expect(grid).toHaveAttribute("data-section", "chats");
    await expect(grid).not.toHaveAttribute("data-room-screen", /.*/u);
  });

  test("another section's pushed member keeps the tab bar", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    const character = (await ownerActor(baseURL ?? "").trpc.character.list.query({})).items[0];
    if (character === undefined) {
      throw new Error("Corpus has no character");
    }
    await openHome(page);
    await reachOnPhone(page, "Characters");
    await libraryRow(page, character.name).click();
    await expect(page.getByRole("button", { name: "Back to Characters", exact: true })).toBeVisible();
    await expect(rail(page)).toBeVisible();
  });

  test("the topbar toggle drops the Corpus roster screen to its overview and restores it", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    await openHome(page);
    await reachOnPhone(page, "Corpus");
    const list = listPanel(page);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await page.getByRole("button", { name: `Show ${CORPUS_MODE_LABELS.explore} overview`, exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.locator(MAIN)).not.toHaveAttribute("inert", "");
    await page.getByRole("button", { name: `Show ${CORPUS_MODE_LABELS.explore} list`, exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
  });

  test("keyboard selection from the library lands on the revealed editor, and Tab enters its form", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    const character = (await ownerActor(baseURL ?? "").trpc.character.list.query({})).items[0];
    if (character === undefined) {
      throw new Error("Corpus has no character");
    }
    await openHome(page);
    await reachOnPhone(page, "Characters");
    const row = libraryRow(page, character.name);
    await row.focus();
    await row.press("Enter");
    const main = page.getByRole("main", { name: "Characters content", exact: true });
    await expect(main.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(character.name);
    await expect.poll(() => focusOnContentAnchor(main)).toBe(true);
    await page.keyboard.press("Tab");
    await expect.poll(() => main.evaluate((node) => node.querySelector("form")?.contains(document.activeElement) ?? false)).toBe(true);
  });

  test("a warm tab return keeps the editor's draft and scroll; a new member opens cold", { tag: "@smoke" }, async ({ page, isMobile }, info) => {
    test.skip(!isMobile, PHONE_ONLY);
    const suffix = info.project.name.replace("corpus-", "");
    const ids = await Promise.all(
      PROBE_NAMES.map(async (name, index) => mintFreshCharacter(castId<CharacterHandle>(`e2e-shell-${suffix}-${String(index)}`), name, PROBE_GREETING)),
    );
    try {
      await openHome(page);
      await reachOnPhone(page, "Characters");
      await page.getByRole("textbox", { name: "Search characters", exact: true }).fill("Shell Probe");
      await libraryRow(page, PROBE_NAMES[0]).click();
      const main = page.getByRole("main", { name: "Characters content", exact: true });
      const name = main.getByRole("textbox", { name: "Name", exact: true });
      await expect(name).toHaveValue(PROBE_NAMES[0]);
      // Hold the autosave, so what the field shows after the round trip can only be the retained draft.
      const update = await holdTrpcProcedure(page, "character.update");
      await name.fill(PROBE_DRAFT);
      await update.requested;
      const scroller = main.locator(".overflow-y-auto").first();
      const offset = await scroller.evaluate((node) => {
        node.scrollTop = Math.floor((node.scrollHeight - node.clientHeight) / 2);
        return node.scrollTop;
      });
      expect(offset).toBeGreaterThan(0);

      await rail(page).getByRole("button", { name: "Home", exact: true }).click();
      await expect(name).toBeHidden();
      await rail(page).getByRole("button", { name: "Characters", exact: true }).click();
      await expect(name).toHaveValue(PROBE_DRAFT);
      await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(offset);
      await update.release();

      await page.getByRole("button", { name: "Back to Characters", exact: true }).click();
      await libraryRow(page, PROBE_NAMES[1]).click();
      await expect(name).toHaveValue(PROBE_NAMES[1]);
      await expect.poll(() => focusOnContentAnchor(main)).toBe(true);
      await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(0);
    } finally {
      await Promise.all(ids.map(async (id) => removeCharacter(id)));
    }
  });

  test("Home's quick-pick shelf owns no inset of its own and reaches both shell edges", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, PHONE_ONLY);
    const owned = (await ownerActor(baseURL ?? "").trpc.character.list.query({ limit: HOME_QUICK_PICKS_LIMIT })).items.length;
    await openHome(page);
    const faces = page.getByRole("list", { name: "Character quick-picks" }).getByRole("listitem");
    await expect(faces).toHaveCount(Math.min(owned, HOME_QUICK_PICKS_LIMIT));
    const geometry = (): Promise<{ readonly edges: readonly number[]; readonly overflows: boolean }> =>
      faces.first().evaluate((face) => {
        const shelf = face.closest('[role="list"]')?.parentElement;
        const main = face.closest("main");
        if (shelf === null || shelf === undefined || main === null) {
          throw new Error("Missing the shell's main or the swipe shelf");
        }
        const bounds = shelf.getBoundingClientRect();
        const host = main.getBoundingClientRect();
        return {
          edges: [Math.round(bounds.left - host.left), Math.round(host.right - bounds.right)],
          overflows: shelf.scrollWidth > shelf.clientWidth,
        };
      });
    await expect.poll(geometry).toEqual({ edges: [0, 0], overflows: true });
    // Tabbing along the row reveals each face whole inside the shelf rather than leaving it cut at the edge.
    // Each face carries its portrait button and its new-chat button, so two Tabs from the first portrait reach the second.
    const buttons = page.getByRole("list", { name: "Character quick-picks" }).getByRole("button");
    const secondPortrait = buttons.nth(2);
    await buttons.first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(secondPortrait).toBeFocused();
    await expect
      .poll(() =>
        secondPortrait.evaluate((face) => {
          const shelf = face.closest('[role="list"]')?.parentElement?.getBoundingClientRect();
          const box = face.getBoundingClientRect();
          return shelf !== undefined && box.left >= shelf.left && box.right <= shelf.right;
        }),
      )
      .toBe(true);
  });
});
