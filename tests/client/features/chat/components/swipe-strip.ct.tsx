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
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SwipeStripStory } from "../_ct-stories";
import { makeMessageView } from "../fixtures";

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

test("renders the n/m counter and fires swipe (generate) on the next chevron at the tip", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  const component = await mount(<SwipeStripStory message={atTipOf2} />);

  await expect(component.getByText("2 / 2")).toBeVisible();

  await component.getByRole("button", { name: "Next variant" }).click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.count("chat.selectVariant")).toBe(0);
});

test("the left chevron is disabled when idx 0 has no earlier sibling (gate stays off, variantCount === 1)", async ({
  mount,
}) => {
  // No routeTrpc call at all — `variantCount === 1` means `useVariantHistory`'s gate never fires the
  // query (§13.1 useGatedQuery/skipToken), so an unhandled network request would prove a leak if this
  // gate ever loosened.
  const component = await mount(<SwipeStripStory message={atIdx0Of1} />);
  await expect(component.getByRole("button", { name: "Previous variant" })).toBeDisabled();
});

test("COLD LOAD step-BACK: the left chevron reaches an earlier variant this mount has never rendered", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  // A FRESH mount straight at idx1 — no prior render at idx0 in this session (the exact cold-page-load
  // gap the old per-mount-observed history could never close). The real `chat.listMessageVariants` read
  // is what makes idx0 resolvable here, not local accumulation.
  const component = await mount(<SwipeStripStory message={atTipOf2} />);
  await expect(component.getByText("2 / 2")).toBeVisible();

  const prev = component.getByRole("button", { name: "Previous variant" });
  await expect(prev).toBeEnabled();
  await prev.click();

  await expect.poll(() => trpc.count("chat.selectVariant"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.selectVariant")).toMatchObject({
    messageId: MESSAGE_ID,
    variantId: VARIANT_0,
  });
  expect(trpc.count("chat.swipe")).toBe(0);
});

test("COLD LOAD step-FORWARD: the right chevron selects an already-generated sibling this mount has never rendered", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  // A FRESH mount straight at idx0 — this session has never been at idx1, yet the real list already
  // knows it exists, so stepping forward selects it instead of regenerating.
  const component = await mount(<SwipeStripStory message={backAtIdx0Of2} />);
  await expect(component.getByText("1 / 2")).toBeVisible();

  await component.getByRole("button", { name: "Next variant" }).click();

  await expect.poll(() => trpc.count("chat.selectVariant"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.selectVariant")).toMatchObject({
    messageId: MESSAGE_ID,
    variantId: VARIANT_1,
  });
  expect(trpc.count("chat.swipe")).toBe(0);
});

test("ArrowRight/ArrowLeft drive the same navigation as the chevrons", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
    "chat.listMessageVariants": () => TWO_VARIANT_LIST,
  });

  await mount(<SwipeStripStory message={atTipOf2} />);
  // Nothing is focused (no editable control on the page) — the global listener fires.
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
});

test("ArrowLeft/ArrowRight are ignored while an editable control has focus (don't fight typing)", async ({
  mount,
  page,
}) => {
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
  await component.getByRole("button", { name: "Next variant" }).click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
});
