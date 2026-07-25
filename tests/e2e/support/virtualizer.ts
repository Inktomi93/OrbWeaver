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
 * WAIT for the virtualizer's mounted window to SETTLE after a scroll before reading it. TanStack Virtual
 * re-windows ASYNCHRONOUSLY (a measurement + rAF pass after `scrollTo`), so reading the DOM in the same tick
 * as the scroll races the re-window — a row at a window seam can be momentarily absent, which non-
 * deterministically drops it from the sweep (the exact flake that made two back-to-back `collectVirtualRows`
 * calls disagree). The settle signal: the mounted-row id signature is IDENTICAL across two consecutive reads
 * (the window stopped changing). Web-first poll — no fixed sleep.
 */
async function settleWindow(page: Page): Promise<void> {
  let previous = "";
  await expect
    .poll(
      async () => {
        const signature = (await readMountedRows(page)).map((r) => r.id).join("|");
        const stable = signature !== "" && signature === previous;
        previous = signature;
        return stable;
      },
      { timeout: 5000, intervals: [50, 100, 150] },
    )
    .toBe(true);
}

/** One top-to-bottom pass over the virtualized list, collecting every currently-reachable row once. */
async function sweepOnce(page: Page): Promise<readonly SweptRow[]> {
  await scrollTo(page, 0);
  // Let the virtualizer settle its window after the jump before the first read (web-first poll, not a fixed
  // sleep): the mounted-row id signature stabilizing across two reads is the settle signal.
  await settleWindow(page);

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
    // Wait for the re-window to settle before reading — reading in the same tick as the scroll races the
    // virtualizer's async re-window and can drop a seam row (making back-to-back sweeps disagree).
    await settleWindow(page);
    await recordCurrentWindow();
    scrollState = await readScrollState(page);
    if (scrollState.scrollTop === previousTop) {
      // The container refused to advance further (already at its scrollable max) — done.
      break;
    }
  }

  return ordered;
}

// A single pass can UNDER-collect for two independent reasons: (1) a seam row momentarily absent during an
// async re-window, and (2) the list's backing data still POPULATING (the message query hasn't landed every
// canon row into `items` yet, so the virtualizer's total size — and thus the scroll extent — is still growing;
// this is the ordering-dependent flake where the sweep runs before the list finished loading). Both resolve by
// RE-SWEEPING: repeat the top-to-bottom pass until two CONSECUTIVE passes return the identical id sequence (the
// transcript stopped growing AND the window is stable). Bounded — never loops forever on a genuinely settled list.
const MAX_CONVERGENCE_PASSES = 6;

/**
 * Walk the virtualized message list top-to-bottom, collecting every row's `{id, role, text}` exactly once
 * (dedup by `data-message-id`), RE-SWEEPING until the result CONVERGES (two consecutive passes agree). Each
 * pass scrolls to the top, then advances ~one viewport per step (overscan guarantees no row is skipped between
 * steps), settling the async re-window before each read, until it reaches the bottom. Order is preserved by
 * FIRST OBSERVATION — safe because rows never reorder mid-sweep (no live turn in flight). Convergence absorbs
 * a seam-drop AND a still-populating backing list (the earlier "13 of 25 rows" ordering flake).
 */
export async function collectVirtualRows(page: Page): Promise<readonly SweptRow[]> {
  const container = page.locator(SCROLL_CONTAINER);
  await expect(container).toBeVisible({ timeout: 15_000 });

  let previous: readonly SweptRow[] = [];
  let previousSignature = "";
  for (let pass = 0; pass < MAX_CONVERGENCE_PASSES; pass += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: convergence passes are inherently sequential — each re-sweep observes whether the list grew/stabilized since the previous pass.
    const current = await sweepOnce(page);
    const signature = current.map((r) => r.id).join("|");
    if (signature === previousSignature) {
      return current;
    }
    previous = current;
    previousSignature = signature;
  }
  // Converged as far as the bound allows — return the last (most complete) pass; the caller's canon-equality
  // assertion is the final arbiter if the list genuinely never settled.
  return previous;
}

// The distinctive-fragment content check tolerates the RAW-vs-RENDERED gap (the same trap
// `live-turn-canon-parity.spec.ts` solves — see its "PARITY of content" note): canon `content` is stored RAW
// (macro placeholders + markdown), but the DOM row renders it — `{{user}}`→the persona name ("You"), `**bold**`
// stripped to plain text, plus a speaker-name + timestamp prefix on the row. A raw-equals-rendered `toContain`
// is dishonest (it fails on any macro/markdown row, e.g. the greeting). So we assert containment of the canon's
// MACRO-FREE, MARKDOWN-STRIPPED literal fragments only: split on `{{…}}` (the kit can't predict a macro's
// rendered value), strip markdown syntax from each fragment, and require every DISTINCTIVE (long-enough)
// fragment to appear verbatim in the swept row text. Verbatim seeded rows (e.g. `Reply with exactly: …`) are
// macro/markdown-free so their whole content is one fragment — the strongest possible containment; a
// pure-macro/short-glue row contributes no distinctive fragment (id + role + order already pin its identity).
const MACRO = /\{\{[^}]*\}\}/gu;
// Markdown syntax the renderer strips from the visible text (emphasis/inline-code/heading/link-bracket markers).
// Whitespace is collapsed separately by the caller's normalize.
const MARKDOWN_SYNTAX = /[*_`#>[\]()~]/gu;
// A fragment shorter than this is glue (", ", ". ") — not distinctive enough to assert against a rendered row.
const DISTINCTIVE_MIN = 6;

/** Canon content → the macro-free, markdown-stripped, whitespace-normalized fragments distinctive enough to
 *  assert are contained in the rendered DOM text (see the note above). */
function distinctiveFragments(content: string): readonly string[] {
  return content
    .split(MACRO)
    .map((frag) => frag.replace(MARKDOWN_SYNTAX, "").replace(/\s+/gu, " ").trim())
    .filter((frag) => frag.length >= DISTINCTIVE_MIN);
}

/**
 * Assert the swept virtualized transcript matches canon: same length, same order, pairwise `id` and `role`
 * equal (the load-bearing proof the sweep collected the RIGHT rows in the RIGHT order across the virtualized
 * window), and each row's swept text CONTAINS every distinctive macro-free/markdown-stripped fragment of its
 * canon message. Containment — not byte equality — because canon is stored RAW and rendered in the DOM (see
 * {@link distinctiveFragments} and the `live-turn-canon-parity.spec.ts` "PARITY of content" note).
 */
export async function assertVirtualListMatchesCanon(page: Page, canon: readonly CanonMessage[]): Promise<void> {
  const swept = await collectVirtualRows(page);
  expect(swept.map((r) => r.id)).toEqual(canon.map((c) => c.id));
  expect(swept.map((r) => r.role)).toEqual(canon.map((c) => c.role));
  for (const [index, canonRow] of canon.entries()) {
    const sweptText = swept.at(index)?.text ?? "";
    // Every distinctive fragment of the rendered canon content must appear in the row. A row with no
    // distinctive fragment (empty/pure-macro/short-glue content) is fully pinned by the id/role/order checks.
    for (const fragment of distinctiveFragments(canonRow.content)) {
      expect(sweptText).toContain(fragment);
    }
  }
}
