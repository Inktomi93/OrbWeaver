// Virtualizer sweep kit (workboard #10): the windowed message list (`@orb/ui/message-list`, TanStack
// Virtual) never mounts every row at once — only `[data-message-id]` rows currently in the virtual
// window (plus overscan) exist in the DOM. A spec asserting full-transcript DOM↔canon parity on a
// transcript longer than the viewport must SWEEP the scroll container top-to-bottom, collecting each
// row exactly once (dedup by id — overscan means adjacent sweep steps overlap), instead of reading the
// DOM once at rest. Package-import-free like the rest of this support tree (chat-room.ts, trpc.ts):
// the scroll container is found by the primitive's own `data-slot="message-list-scroll"` contract,
// and rows by `[data-message-id]` (message-row.tsx) — the wire/DOM contract, not the source types.

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { CanonMessage } from "./trpc";

const SCROLL_CONTAINER = '[data-slot="message-list-scroll"]';
const MESSAGE_ROW = "[data-message-id]";

/** One row as swept from the DOM: identity + the fields comparable against canon. */
export interface SweptRow {
  readonly id: string;
  readonly role: string;
  readonly text: string;
}

/** Read the currently-mounted `[data-message-id]` rows inside the scroll container (one virtual window). */
function readMountedRows(page: Page): Promise<readonly SweptRow[]> {
  return page.locator(`${SCROLL_CONTAINER} ${MESSAGE_ROW}`).evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute("data-message-id") ?? "",
      role: el.getAttribute("data-role") ?? "",
      text: (el.textContent ?? "").replace(/\s+/gu, " ").trim(),
    })),
  );
}

/** The scroll container's current `{scrollTop, scrollHeight, clientHeight}` — used to detect the bottom. */
function readScrollState(page: Page): Promise<{ scrollTop: number; scrollHeight: number; clientHeight: number }> {
  return page.locator(SCROLL_CONTAINER).evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
}

/** Scroll the container to an absolute `top` offset (native `scrollTo`, no smoothing — deterministic reads). */
function scrollTo(page: Page, top: number): Promise<void> {
  return page.locator(SCROLL_CONTAINER).evaluate((el, y) => {
    el.scrollTo({ top: y, behavior: "auto" });
  }, top);
}

/**
 * Walk the virtualized message list top-to-bottom, collecting every row's `{id, role, text}` exactly
 * once (dedup by `data-message-id`). Scrolls to the top first, then advances by one viewport height per
 * step (overscan on both edges guarantees no row is skipped between steps), re-reading the mounted
 * window at each stop, until the container reports it has reached the bottom (`scrollTop` stops
 * advancing). Order is preserved by FIRST OBSERVATION (a row seen while scrolling down is only recorded
 * once, at its earliest sweep step) — safe because rows never reorder mid-sweep (no live turn in flight).
 */
export async function collectVirtualRows(page: Page): Promise<readonly SweptRow[]> {
  const container = page.locator(SCROLL_CONTAINER);
  await expect(container).toBeVisible({ timeout: 15_000 });

  await scrollTo(page, 0);
  // Let the virtualizer settle its window after the jump before the first read (web-first poll, not a
  // fixed sleep): the mounted-row count stabilizing is the settle signal.
  await expect.poll(async () => (await readMountedRows(page)).length, { timeout: 5000 }).toBeGreaterThan(0);

  const seen = new Set<string>();
  const ordered: SweptRow[] = [];
  const recordCurrentWindow = async (): Promise<void> => {
    for (const row of await readMountedRows(page)) {
      if (row.id !== "" && !seen.has(row.id)) {
        seen.add(row.id);
        ordered.push(row);
      }
    }
  };

  await recordCurrentWindow();

  // Bounded scroll-sweep: each iteration is sequentially dependent on the previous scroll settling
  // (virtual-core must finish re-windowing before the next read is meaningful), so serial awaits are
  // the correct shape here, not a parallelizable batch.
  let scrollState = await readScrollState(page);
  let steps = 0;
  const maxSteps = 500;
  while (scrollState.scrollTop + scrollState.clientHeight < scrollState.scrollHeight - 1 && steps < maxSteps) {
    steps += 1;
    const previousTop = scrollState.scrollTop;
    // Advance by ~80% of one viewport so overlapping overscan windows never skip a row.
    const nextTop = previousTop + scrollState.clientHeight * 0.8;
    // biome-ignore lint/performance/noAwaitInLoops: sequential scroll-sweep — each step depends on the previous scroll settling before the next read is meaningful.
    await scrollTo(page, nextTop);
    await recordCurrentWindow();
    scrollState = await readScrollState(page);
    if (scrollState.scrollTop === previousTop) {
      // The container refused to advance further (already at its scrollable max) — done.
      break;
    }
  }

  return ordered;
}

/**
 * Assert the swept virtualized transcript matches canon exactly: same length, same order, pairwise
 * `role` equal, and each row's swept text CONTAINS the corresponding canon message's distinctive
 * content (canon is markdown-rendered into the DOM, so containment — not byte equality — is the honest
 * compare; whitespace-normalized like `live-turn-canon-parity.spec.ts`'s `domTranscript`).
 */
export async function assertVirtualListMatchesCanon(page: Page, canon: readonly CanonMessage[]): Promise<void> {
  const swept = await collectVirtualRows(page);
  expect(swept.map((r) => r.id)).toEqual(canon.map((c) => c.id));
  expect(swept.map((r) => r.role)).toEqual(canon.map((c) => c.role));
  for (const [index, canonRow] of canon.entries()) {
    const sweptRow = swept.at(index);
    const normalizedCanonText = canonRow.content.replace(/\s+/gu, " ").trim();
    // Empty canon content (e.g. a tool-only row) has nothing distinctive to assert containment of —
    // the id/role checks above already pin its identity and position.
    expect(sweptRow?.text ?? "").toContain(normalizedCanonText === "" ? "" : normalizedCanonText);
  }
}
