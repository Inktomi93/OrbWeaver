// A scroll the list did not write and the reader's input did not start ends the tail follow and any hold, and a position
// change the list's own layout caused ends neither.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MessageListScrollportStory } from "./_scrollport-stories.tsx";

const STORY = "tests/ui/primitives/message-list/_scrollport-stories/MessageListScrollportStory";
const ROW = '[data-slot="message-list-row"]';
const LOG_NAME = "Scrollport lifecycle";
const COUNT = 40;
const LATE_ROW = 3;
const PARKED_TOP = 1200;
const AWAY_TOP = 300;
// Past a hold's settling frames and any re-pin a late measure schedules.
const QUIET_FRAMES = 40;
const END_PX = 1;
const STREAM_FRAMES = 8;

function frames(page: Page, count: number): Promise<void> {
  return page.evaluate(async (left) => {
    for (let frame = 0; frame < left; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, count);
}

function fromEnd(log: Locator): Promise<number> {
  return log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
}

/** The row at the port's top edge and how far its head sits from that edge. */
function readingRow(log: Locator, row: string): Promise<{ readonly index: string | undefined; readonly offset: number }> {
  return log.evaluate((node, selector) => {
    const edge = node.getBoundingClientRect().top;
    const found = [...node.querySelectorAll<HTMLElement>(selector)]
      .map((candidate) => ({ index: candidate.dataset["index"], box: candidate.getBoundingClientRect() }))
      .filter(({ box }) => box.bottom > edge)
      .toSorted((a, b) => a.box.top - b.box.top)[0];
    return { index: found?.index, offset: Math.round((found?.box.top ?? Number.NaN) - edge) };
  }, row);
}

async function mountAtTail(page: Page, mount: Mount, props: StoryProps = {}): Promise<Locator> {
  await mount<typeof MessageListScrollportStory>(STORY, { initialCount: COUNT, ...props });
  const log = page.getByRole("log", { name: LOG_NAME, exact: true });
  await expect(log.getByText(`Row ${String(COUNT - 1)}`, { exact: true })).toBeVisible();
  await expect.poll(() => fromEnd(log)).toBeLessThanOrEqual(END_PX);
  return log;
}

/** Parks the reader in the rows, away from the tail, and waits for the list to read them there. */
async function park(page: Page, log: Locator): Promise<{ readonly index: string | undefined; readonly offset: number }> {
  await log.evaluate((node, top) => {
    node.scrollTop = top;
  }, PARKED_TOP);
  await frames(page, 4);
  return readingRow(log, ROW);
}

type StoryProps = Parameters<typeof MessageListScrollportStory>[0];
type Mount = Parameters<Parameters<typeof test>[2]>[0]["mount"];

for (const trigger of ["Append rows", "Grow tail"] as const) {
  test(`a foreign scroll during tail follow outlives ${trigger} landing before its scroll event`, async ({ mount, page }) => {
    const log = await mountAtTail(page, mount);
    const button = await page.getByRole("button", { name: trigger, exact: true }).elementHandle();
    // One task, as find-in-page or an anchor jump can do: the commit lands between the write and its scroll event.
    await log.evaluate(
      (node, { top, press }) => {
        node.scrollTop = top;
        if (press instanceof HTMLElement) {
          press.click();
        }
      },
      { top: AWAY_TOP, press: button },
    );
    await frames(page, QUIET_FRAMES);
    expect(await log.evaluate((node) => node.scrollTop)).toBe(AWAY_TOP);
    // The follow has ended, so later growth leaves the reader alone as well.
    await page.getByRole("button", { name: "Grow tail", exact: true }).click();
    await frames(page, QUIET_FRAMES);
    expect(await log.evaluate((node) => node.scrollTop)).toBe(AWAY_TOP);
  });
}

/** Presses `first`, then `second` in a separate task of the same frame, as a socket frame lands behind a keyboard's resize. */
async function pressInOneFrame(page: Page, first: string, second: string): Promise<void> {
  const [one, two] = await Promise.all([first, second].map((name) => page.getByRole("button", { name, exact: true }).elementHandle()));
  await page.evaluate(
    ([a, b]) =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (): void => {
          if (b instanceof HTMLElement) {
            b.click();
          }
          resolve();
        };
        if (a instanceof HTMLElement) {
          a.click();
        }
        channel.port2.postMessage(null);
      }),
    [one, two] as const,
  );
}

/** How far from the end the reader sits once settled, and again after growth the old position cannot reach: a follower stays on both. */
async function gapsWhileFollowing(page: Page, log: Locator): Promise<number> {
  await frames(page, QUIET_FRAMES);
  const settled = await fromEnd(log);
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await frames(page, QUIET_FRAMES);
  return Math.max(settled, await fromEnd(log));
}

test("a port that grows and clamps the tail, with rows landing in the same frame, does not end tail follow", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount);
  await pressInOneFrame(page, "Grow scrollport", "Append rows");
  expect(await gapsWhileFollowing(page, log)).toBeLessThanOrEqual(END_PX);
});

test("a port that grows and clamps a streaming tail, with rows landing in the same frame, does not end tail follow", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount);
  const [stream, grow, append] = await Promise.all(
    ["Stream tail", "Grow scrollport", "Append rows"].map((name) => page.getByRole("button", { name, exact: true }).elementHandle()),
  );
  // In the page, so a chunk lands on every frame and the port grows between two of them, as a keyboard dismissal in a stream does.
  await page.evaluate(
    async ([chunk, port, rows, streamed]) => {
      const press = (node: unknown): void => {
        if (node instanceof HTMLElement) {
          node.click();
        }
      };
      for (let frame = 0; frame < streamed * 2; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        press(chunk);
        if (frame === streamed) {
          press(port);
          await new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (): void => {
              press(rows);
              resolve();
            };
            channel.port2.postMessage(null);
          });
        }
      }
    },
    [stream, grow, append, STREAM_FRAMES] as const,
  );
  expect(await gapsWhileFollowing(page, log)).toBeLessThanOrEqual(END_PX);
});

test("a tail that collapses and clamps, with rows landing in the same frame, does not end tail follow", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount);
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await expect.poll(() => fromEnd(log)).toBeLessThanOrEqual(END_PX);
  await frames(page, 4);
  const collapse = await page.getByRole("button", { name: "Collapse tail", exact: true }).elementHandle();
  const append = await page.getByRole("button", { name: "Append rows", exact: true }).elementHandle();
  // The list writes its new height from a resize observer, so the rows land in the task after that delivery.
  await log.evaluate(
    (node, [shrink, more]) =>
      new Promise<void>((resolve) => {
        const rows = node.querySelector("ol");
        const channel = new MessageChannel();
        channel.port1.onmessage = (): void => {
          if (more instanceof HTMLElement) {
            more.click();
          }
          resolve();
        };
        let delivered = 0;
        const seen = new ResizeObserver(() => {
          delivered += 1;
          if (delivered === 1 && shrink instanceof HTMLElement) {
            shrink.click();
          } else if (delivered === 2) {
            seen.disconnect();
            channel.port2.postMessage(null);
          }
        });
        if (rows !== null) {
          seen.observe(rows);
        }
      }),
    [collapse, append] as const,
  );
  expect(await gapsWhileFollowing(page, log)).toBeLessThanOrEqual(END_PX);
});

test("a port that grows and clamps a reader with no rows landing keeps tail follow", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount);
  await page.getByRole("button", { name: "Grow scrollport", exact: true }).click();
  expect(await gapsWhileFollowing(page, log)).toBeLessThanOrEqual(END_PX);
});

test("a foreign scroll during a hold ends the hold", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount, { chrome: true });
  await park(page, log);
  const grow = await page.getByRole("button", { name: "Grow chrome", exact: true }).elementHandle();
  await log.evaluate(
    async (node, { top, press }) => {
      if (press instanceof HTMLElement) {
        press.click();
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      node.scrollTop = top;
    },
    { top: AWAY_TOP, press: grow },
  );
  await frames(page, QUIET_FRAMES);
  expect(await log.evaluate((node) => node.scrollTop)).toBe(AWAY_TOP);
});

test("a hold with no foreign scroll keeps the reader's row through a chrome change", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount, { chrome: true });
  const before = await park(page, log);
  await page.getByRole("button", { name: "Grow chrome", exact: true }).click();
  await frames(page, QUIET_FRAMES);
  expect(await readingRow(log, ROW)).toEqual(before);
});

test("a row above the viewport that resizes late does not end tail follow", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount, { lateRow: LATE_ROW });
  await page.getByRole("button", { name: "Grow late row", exact: true }).click();
  await frames(page, QUIET_FRAMES);
  expect(await fromEnd(log)).toBeLessThanOrEqual(END_PX);
  // Still following: a growth the old position cannot reach is pinned too.
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await expect.poll(() => fromEnd(log)).toBeLessThanOrEqual(END_PX);
});

test("a row above the viewport that resizes late does not end a hold", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount, { chrome: true, lateRow: LATE_ROW });
  const before = await park(page, log);
  const grow = page.getByRole("button", { name: "Grow chrome", exact: true });
  const late = await page.getByRole("button", { name: "Grow late row", exact: true }).elementHandle();
  await grow.evaluate(async (node, press) => {
    if (node instanceof HTMLElement && press instanceof HTMLElement) {
      node.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      press.click();
    }
  }, late);
  await frames(page, QUIET_FRAMES);
  expect(await readingRow(log, ROW)).toEqual(before);
});

test("rows that shrink and clamp a held reader to the end do not end the hold", async ({ mount, page }) => {
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const log = await mountAtTail(page, mount, { chrome: true, remRows: true });
  await log.evaluate((node) => {
    node.scrollTop = node.scrollHeight - node.clientHeight - 300;
  });
  await frames(page, 4);
  const before = await readingRow(log, ROW);
  const grow = await page.getByRole("button", { name: "Grow chrome", exact: true }).elementHandle();
  await page.evaluate((press) => {
    document.documentElement.style.fontSize = "16px";
    if (press instanceof HTMLElement) {
      press.click();
    }
  }, grow);
  await frames(page, QUIET_FRAMES);
  expect((await readingRow(log, ROW)).index).toBe(before.index);
});

test("a text-size change that re-measures every row does not end tail follow", async ({ mount, page }) => {
  const log = await mountAtTail(page, mount, { remRows: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await frames(page, QUIET_FRAMES);
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await expect.poll(() => fromEnd(log)).toBeLessThanOrEqual(END_PX);
});
