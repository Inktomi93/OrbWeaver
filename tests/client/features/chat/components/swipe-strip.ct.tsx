// CT: the swipe strip — the n/m counter + prev/next variant navigation. Covers: the counter, the
// tip-only generate path, and the COLD-LOAD step-back/step-forward fix (chat-surface-lane follow-up to
// #19): `useVariantHistory` now resolves ANY sibling idx through the real `chat.listMessageVariants` read
// (gated on `variantCount > 1`) instead of only what THIS mount happened to render live — so a step to an
// idx never rendered in this session (the exact "opened the page mid-way through a 3-variant slot"
// scenario) works on the FIRST click, no prior local observation required. `selectVariant`/`swipe` stay
// bus-driven — no manual cache patch, the mutation's `invalidates` backstop is the only cache touch — and
// the ArrowLeft/ArrowRight keyboard equivalents (ignored while an editable control has focus).

import type { MessageView } from "@orb/contracts/chat";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { VARIANT_GENERATE_NAME, VARIANT_NEXT_NAME, VARIANT_PREV_NAME } from "../../../../../packages/client/src/features/chat/lib/message-action-names.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { SwipeStripStory } from "../_ct-stories.tsx";
import { makeMessageView } from "../fixtures.ts";

const MESSAGE_ID = castId<MessageId>("msg_ct_swipe");
const VARIANT_0 = castId<MessageVariantId>("mv_ct_0");
const VARIANT_1 = castId<MessageVariantId>("mv_ct_1");

// The full sibling set `chat.listMessageVariants` would return for the 2-variant slot below — both
// cold-load tests route this SAME list regardless of which idx is currently selected (the real read is
// unconditional on selection; only the MESSAGE VIEW'S `selectedVariantIdx` moves between mounts).
const TWO_VARIANT_LIST = [
  { variantId: VARIANT_0, idx: 0 },
  { variantId: VARIANT_1, idx: 1 },
];

const atIdx0Of1: MessageView = makeMessageView({
  id: MESSAGE_ID,
  variantCount: 1,
  selectedVariantIdx: 0,
  selectedVariantId: VARIANT_0,
});
const atTipOf2: MessageView = makeMessageView({
  id: MESSAGE_ID,
  variantCount: 2,
  selectedVariantIdx: 1,
  selectedVariantId: VARIANT_1,
});
const backAtIdx0Of2: MessageView = makeMessageView({
  id: MESSAGE_ID,
  variantCount: 2,
  selectedVariantIdx: 0,
  selectedVariantId: VARIANT_0,
});

test("renders the n/m counter and fires swipe (generate) on the next chevron at the tip", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  const component = await mount(<SwipeStripStory message={atTipOf2} />);

  await expect(component.getByText("2 / 2")).toBeVisible();

  await component.getByRole("button", { name: VARIANT_NEXT_NAME }).click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("chat.selectVariant")).toBe(0);
});

// DENSITY S6 (UI-Density-Law.md §2.3): the n/m counter is a VALUE you read, so it speaks the `datum`
// voice — mono + tabular figures, so the digits stop shifting the chevrons sideways as the count ticks.
// Asserted by computed style, never by the class string.
test("the n/m counter speaks the datum voice — mono, tabular figures (the digits don't jitter the chevrons)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listMessageVariants": () => TWO_VARIANT_LIST });
  const component = await mount(<SwipeStripStory message={atTipOf2} />);

  const counter = component.getByText("2 / 2");
  await expect(counter).toBeVisible();
  const readTypeAtAssertion = async (): Promise<typeof type> =>
    await counter.evaluate((el) => {
      const style = getComputedStyle(el);
      return { family: style.fontFamily, numeric: style.fontVariantNumeric };
    });
  const type = await counter.evaluate((el) => {
    const style = getComputedStyle(el);
    return { family: style.fontFamily, numeric: style.fontVariantNumeric };
  });
  await expect.poll(async () => (await readTypeAtAssertion()).family).toContain("Mono");
  await expect.poll(async () => (await readTypeAtAssertion()).numeric).toContain("tabular-nums");
});

test("a SINGLE variant renders no pager at all — no counter, no dead back-step (gate stays off, variantCount === 1)", async ({ mount }) => {
  // No routeTrpc call at all — `variantCount === 1` means `useVariantHistory`'s gate never fires the
  // query (§13.1 useGatedQuery/skipToken), so an unhandled network request would prove a leak if this
  // gate ever loosened. THAT mechanism is what this test has always guarded and still does.
  //
  // What changed (side-eye leg-4 P3): it used to assert the back-step rendered DISABLED. A pager that
  // counts "1 / 1" between two arrows the user cannot move is an affordance lying about itself, so at one
  // variant the strip is only the live verb — the right chevron, which at the tip generates.
  const component = await mount(<SwipeStripStory message={atIdx0Of1} />);
  await expect(component.getByRole("button", { name: VARIANT_PREV_NAME })).toHaveCount(0);
  await expect(component.getByText("1 / 1")).toHaveCount(0);
  // …and the one affordance that CAN act is still there — labelled for what it DOES at this count
  // (#570 RULED: it generates, not steps, so the name is "Generate a variant", not the pager's
  // "Next variant"). The stale "Next variant" name is asserted absent as the honesty regression pin.
  await expect(component.getByRole("button", { name: VARIANT_GENERATE_NAME })).toBeEnabled();
  await expect(component.getByRole("button", { name: VARIANT_NEXT_NAME })).toHaveCount(0);
});

// #849 — AND THAT ONE AFFORDANCE MUST SAY WHAT IT IS, ON SCREEN. Shipped, the single-variant arm was a
// 34×34 transparent chevron with an empty `textContent` AND an empty parent text, floating over the room's
// background art: the only affordance in the app whose visible label is the empty string, and a right
// chevron reads as "next page" while this one costs a model call (side-eye 2026-08-30 P2).
//
// The pin asserts what a COLD READER can see — a non-empty visible label, and that the label is contained
// in the accessible name (WCAG 2.5.3, which is why the visible word is the verb #570's accname already
// opens with rather than a synonym). It does NOT re-assert the counter: "a pager needs pages" still holds
// and no `1 / 1` comes back.
test("#849: the single-variant generate control carries a VISIBLE label, not a bare chevron", async ({ mount }) => {
  const component = await mount(<SwipeStripStory message={atIdx0Of1} />);

  const generate = component.getByRole("button", { name: VARIANT_GENERATE_NAME });
  // Polled, not sampled: both halves are live DOM reads, and the pair is the whole property — a non-empty
  // VISIBLE label, and that same rendered string contained in the accessible name (WCAG 2.5.3). Derived
  // from what is on screen rather than restated, so a copy edit that breaks the containment reds here.
  await expect
    .poll(async () => {
      const visible = ((await generate.textContent()) ?? "").trim();
      const name = await generate.getAttribute("aria-label");
      return { visible, containedInName: visible.length > 0 && name?.includes(visible) === true };
    })
    .toEqual({ visible: "Generate", containedInName: true });
  // The counter stays gone — this arm is the verb alone (the "A PAGER NEEDS PAGES" ruling, untouched).
  await expect(component.getByText("1 / 1")).toHaveCount(0);
});

test("COLD LOAD step-BACK: the left chevron reaches an earlier variant this mount has never rendered", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  // A FRESH mount straight at idx1 — no prior render at idx0 in this session (the exact cold-page-load
  // gap the old per-mount-observed history could never close). The real `chat.listMessageVariants` read
  // is what makes idx0 resolvable here, not local accumulation.
  const component = await mount(<SwipeStripStory message={atTipOf2} />);
  await expect(component.getByText("2 / 2")).toBeVisible();

  const prev = component.getByRole("button", { name: VARIANT_PREV_NAME });
  await expect(prev).toBeEnabled();
  await prev.click();

  await expect.poll(() => trpc.count("chat.selectVariant"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.selectVariant"))
    .toMatchObject({
      messageId: MESSAGE_ID,
      variantId: VARIANT_0,
    });
  await expect.poll(() => trpc.count("chat.swipe")).toBe(0);
});

test("COLD LOAD step-FORWARD: the right chevron selects an already-generated sibling this mount has never rendered", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  // A FRESH mount straight at idx0 — this session has never been at idx1, yet the real list already
  // knows it exists, so stepping forward selects it instead of regenerating.
  const component = await mount(<SwipeStripStory message={backAtIdx0Of2} />);
  await expect(component.getByText("1 / 2")).toBeVisible();

  await component.getByRole("button", { name: VARIANT_NEXT_NAME }).click();

  await expect.poll(() => trpc.count("chat.selectVariant"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.selectVariant"))
    .toMatchObject({
      messageId: MESSAGE_ID,
      variantId: VARIANT_1,
    });
  await expect.poll(() => trpc.count("chat.swipe")).toBe(0);
});

// #1874 Finding B — THE BACK EDGE WRAPS, THE FORWARD EDGE DOES NOT, and the asymmetry is the point.
// Owner-reported: "you can't hit left swipe arrow when at 1 out of X to loop back around to X." Both ends
// used to be hard-stopped (`current > 1` / `current < total`), so at `1 / X` the ‹ was disabled — a control
// the reader is reaching for that refuses to move.
//
// Wrapping FORWARD would be the wrong symmetry and must stay unbuilt: at `X / X` the › is the GENERATE
// verb, so a forward wrap would silently replace "make a new variant" with "jump back to variant 1". These
// two tests are a PAIR — the second is what stops a later "fix the other end for consistency".
test("#1874: at 1 / X the back chevron WRAPS to the last variant instead of sitting dead", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  const component = await mount(<SwipeStripStory message={backAtIdx0Of2} />);
  await expect(component.getByText("1 / 2")).toBeVisible();

  const prev = component.getByRole("button", { name: VARIANT_PREV_NAME });
  await expect(prev).toBeEnabled();
  await prev.click();

  await expect.poll(() => trpc.count("chat.selectVariant"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.selectVariant")).toMatchObject({ messageId: MESSAGE_ID, variantId: VARIANT_1 });
  // A WRAP, NEVER A GENERATE: stepping back off the first variant must not cost a model call.
  await expect.poll(() => trpc.count("chat.swipe")).toBe(0);
});

test("#1874: the FORWARD edge still generates at the tip — the wrap is back-only", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  const component = await mount(<SwipeStripStory message={atTipOf2} />);
  await expect(component.getByText("2 / 2")).toBeVisible();

  await component.getByRole("button", { name: VARIANT_NEXT_NAME }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("chat.selectVariant")).toBe(0);
});

test("ArrowRight/ArrowLeft drive the same navigation as the chevrons", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  await mount(<SwipeStripStory message={atTipOf2} />);
  // Nothing is focused (no editable control on the page) — the global listener fires. That listener
  // attaches in a `useEffect` (post-paint, async) while Playwright's `mount()` resolves at DOM-attach —
  // BEFORE React flushes the effect. Under parallel scheduler load the gap widens and the FIRST
  // ArrowRight can dispatch into a window with no listener yet (swipe count stays 0 forever, never 1 —
  // the same freshly-mounted-control activation drop as file-dropzone.ct.tsx's post-Tab Enter). Re-press
  // ArrowRight until the swipe lands rather than betting on one keypress winning the effect race. Read
  // the count BEFORE each press and skip the press once it has fired: a press-then-read poll would land
  // a SECOND swipe (count 2) — the fake network clears `isPending` between fast resolves, so the
  // component's `busy` guard no longer blocks the next tick's press. Guarding on the recorded count
  // (`trpc.count` records at the network-route boundary) keeps exactly one request in flight. Still
  // proves ArrowRight (never a click) drives navigation.
  await expect
    .poll(
      async () => {
        const already = trpc.count("chat.swipe");
        if (already > 0) {
          return already;
        }
        await page.keyboard.press("ArrowRight");
        return trpc.count("chat.swipe");
      },
      { intervals: [50, 100, 150, 200] },
    )
    .toBe(1);
});

test("ArrowLeft/ArrowRight are ignored while an editable control has focus (don't fight typing)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  const component = await mount(
    <div>
      <input aria-label="unrelated-input" />
      <SwipeStripStory message={atTipOf2} />
    </div>,
  );
  await page.getByLabel("unrelated-input").focus();
  await page.keyboard.press("ArrowRight");

  // A real click proves the strip is still live — if the keypress above HAD sneaked through despite
  // the focused input, this would be call #2 by the time the poll settles, not #1.
  await component.getByRole("button", { name: VARIANT_NEXT_NAME }).click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
});
