// CT: the swipe strip — the n/m counter + prev/next variant navigation (task #19 completes #17's
// generate-only minimal). Covers: the counter, the tip-only generate path (unchanged from #17), a
// step-BACK to an earlier variant this mount has actually seen (`chat.selectVariant`, never `chat.swipe`
// — no manual cache patch, the mutation's `invalidates` backstop is the only cache touch), a
// step-FORWARD to an already-generated sibling (also `selectVariant`, not a fresh regeneration), and the
// ArrowLeft/ArrowRight keyboard equivalents (ignored while an editable control has focus).

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

const atIdx0Of1: MessageView = makeMessageView({
  id: MESSAGE_ID,
  variantCount: 1,
  selectedVariantIdx: 0,
  selectedVariantId: VARIANT_0,
});
const atIdx1Of2: MessageView = makeMessageView({
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
  });

  const component = await mount(<SwipeStripStory />);

  // selectedVariantIdx 1 (0-based) + variantCount 3 → "2 / 3".
  await expect(component.getByText("2 / 3")).toBeVisible();

  await component.getByRole("button", { name: "Next variant" }).click();
  await expect.poll(() => trpc.count("chat.swipe")).toBe(1);
  expect(trpc.count("chat.selectVariant")).toBe(0);
});

test("the step-back chevron is disabled until an earlier variant has been observed this mount", async ({
  mount,
}) => {
  const component = await mount(<SwipeStripStory message={atIdx0Of1} />);
  // idx 0 of 1 — there IS no earlier variant, so "Previous" stays disabled regardless of history.
  await expect(component.getByRole("button", { name: "Previous variant" })).toBeDisabled();
});

test("step-BACK: once an earlier variant has been seen, the left chevron selects it (not swipe)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
  });

  // Mount at idx0 (records VARIANT_0 for idx 0), then the surface "re-renders" after a swipe committed
  // idx1 — the exact prop-transition `reasoning-block.ct.tsx` uses to simulate a live session.
  const component = await mount(<SwipeStripStory message={atIdx0Of1} />);
  await component.update(<SwipeStripStory message={atIdx1Of2} />);
  await expect(component.getByText("2 / 2")).toBeVisible();

  const prev = component.getByRole("button", { name: "Previous variant" });
  await expect(prev).toBeEnabled();
  await prev.click();

  await expect.poll(() => trpc.count("chat.selectVariant")).toBe(1);
  expect(trpc.lastInput("chat.selectVariant")).toMatchObject({
    messageId: MESSAGE_ID,
    variantId: VARIANT_0,
  });
  expect(trpc.count("chat.swipe")).toBe(0);
});

test("step-FORWARD to an already-generated sibling selects it instead of regenerating", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.selectVariant": () => ({ ok: true }),
    "chat.swipe": () => ({ ok: true }),
  });

  // Mount at the tip (idx1, records VARIANT_1), then simulate the user having stepped back to idx0 —
  // idx1 is still remembered from the initial mount, so stepping forward again must reuse it.
  const component = await mount(<SwipeStripStory message={atIdx1Of2} />);
  await component.update(<SwipeStripStory message={backAtIdx0Of2} />);
  await expect(component.getByText("1 / 2")).toBeVisible();

  await component.getByRole("button", { name: "Next variant" }).click();

  await expect.poll(() => trpc.count("chat.selectVariant")).toBe(1);
  expect(trpc.lastInput("chat.selectVariant")).toMatchObject({
    messageId: MESSAGE_ID,
    variantId: VARIANT_1,
  });
  expect(trpc.count("chat.swipe")).toBe(0);
});

test("ArrowRight/ArrowLeft drive the same navigation as the chevrons", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
  });

  await mount(<SwipeStripStory />);
  // Nothing is focused (no editable control on the page) — the global listener fires.
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => trpc.count("chat.swipe")).toBe(1);
});

test("ArrowLeft/ArrowRight are ignored while an editable control has focus (don't fight typing)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
  });

  const component = await mount(
    <div>
      <input aria-label="unrelated-input" />
      <SwipeStripStory />
    </div>,
  );
  await page.getByLabel("unrelated-input").focus();
  await page.keyboard.press("ArrowRight");

  // A real click proves the strip is still live — if the keypress above HAD sneaked through despite
  // the focused input, this would be call #2 by the time the poll settles, not #1.
  await component.getByRole("button", { name: "Next variant" }).click();
  await expect.poll(() => trpc.count("chat.swipe")).toBe(1);
});
