// CT: B6/MR2 — the reaction pill row and the picker's two doors, in a real browser.
//
// WHAT ONLY A CT CAN SAY HERE, and why each arm exists:
//   · The pills mount through the REAL `message-footer` contribution, so this proves the wiring `main.tsx`
//     actually takes — a component-direct mount would keep passing with the contribution unregistered.
//   · `aria-pressed` is the viewer's OWN seat, resolved by matching `ChatDetail.viewerUserId` against the
//     roster. Nothing but a rendered mount exercises that join, and getting it wrong is invisible to tsc:
//     every chip would simply read unpressed, which looks like "nobody reacted yet".
//   · The row is ONE LINE WITH A "+N" TAIL. That is a claim about GEOMETRY at the narrowest real host
//     (320px), not about an array length — a `slice()` unit test cannot see a wrapped row.
//   · The two picker DOORS are a POINTER claim: `ROW_ACTION_INLINE` is `pointer-coarse:hidden`, so the
//     inline glyph is present at fine and gone at coarse while the ⋯ item stands at both. `hasTouch: true`
//     is what flips `matchMedia("(pointer: coarse)")` in chromium (`emulateMedia` has no `pointer`
//     feature), and every coarse arm PROVES the emulation landed before trusting anything it measures —
//     a narrow viewport alone renders a fine-pointer layout no phone produces.

import { expect, test } from "@playwright/experimental-ct-react";
import { touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { MessageActionsDoorsStory, MessageReactionsStory } from "../_reaction-stories.tsx";

// The fixture's ids must MATCH `fixtures.ts::makeMessageView` — the pill row selects the room's window by
// the row's own `selectedVariantId`, so a mismatched fixture renders an empty (and silently passing) row.
const VARIANT_ID = "mv_ct_1";
const CHAT_ID = "chat_ct_keystone";
const VIEWER_ID = "user_ct_viewer";
const VIEWER_SEAT = "chat_participant_ct_viewer";
const OTHER_SEAT = "chat_participant_ct_other";

/** A `ChatDetail`-shaped stub carrying only what the seat resolution reads (`viewerUserId` + the roster). */
const CHAT_DETAIL = {
  id: CHAT_ID,
  viewerUserId: VIEWER_ID,
  participants: [
    { id: VIEWER_SEAT, userId: VIEWER_ID, leftSeq: null },
    { id: OTHER_SEAT, userId: "user_ct_other", leftSeq: null },
  ],
};

function group(emoji: string, reactors: readonly string[]): Record<string, unknown> {
  // Whole-message groups (all-null trio — B7): a chip missing the trio would gloss as a bogus segment.
  return {
    variantId: VARIANT_ID,
    emoji,
    emojiImageAssetId: null,
    segmentIndex: null,
    segmentSpeaker: null,
    segmentSnippet: null,
    reactorParticipantIds: reactors,
  };
}

/** The B7 wire view — `listReactions` carries the room's resolved posture beside the groups. */
function view(groups: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { reactionsEnabled: true, groups };
}

/** Two chips: one the viewer is IN (👍) and one they are not (😂) — the pressed-state claim needs both. */
const TWO_CHIPS = [group("👍", [VIEWER_SEAT, OTHER_SEAT]), group("😂", [OTHER_SEAT])];

/** Nine chips — three past the six-chip display cap, so the tail must read "+3". */
const NINE_CHIPS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🔥", "🎉", "👀"].map((e) => group(e, [OTHER_SEAT]));

test.describe("the pill row", () => {
  test("renders one chip per emoji with its reactor COUNT, and presses only the viewer's own", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": view(TWO_CHIPS), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageReactionsStory />);

    const mine = component.getByRole("button", { name: /React with 👍/ });
    const theirs = component.getByRole("button", { name: /React with 😂/ });
    await expect(mine).toBeVisible();
    // The COUNT is printed, not only announced — it is the datum the row exists to show.
    await expect(mine).toHaveText(/2/);
    await expect(theirs).toHaveText(/1/);
    // THE JOIN THIS TEST EXISTS FOR: pressed is the VIEWER'S seat, never "somebody reacted".
    await expect(mine).toHaveAttribute("aria-pressed", "true");
    await expect(theirs).toHaveAttribute("aria-pressed", "false");
  });

  test("renders NOTHING for a variant with no reactions — an applicability gate, not an empty shell", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": view([]), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageReactionsStory />);

    // The host IS the mounted component root, so it is asserted on directly (a `getByTestId` INSIDE it
    // cannot match itself). EMPTY is the property: no chips, no row element, and therefore no layout —
    // `toBeVisible` would fail here for exactly the right reason (a zero-height box).
    await expect(component).toHaveAttribute("data-testid", "reactions-host");
    await expect(component.getByRole("button", { name: /React with/ })).toHaveCount(0);
    await expect(page.locator('[data-slot="message-reactions"]')).toHaveCount(0);
    await expect.poll(() => component.evaluate((el: HTMLElement) => el.childElementCount)).toBe(0);
  });

  test("stays ONE LINE at 320px and discloses the rest as +N", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": view(NINE_CHIPS), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageReactionsStory />);

    const chips = component.getByRole("button", { name: /React with/ });
    await expect(chips).toHaveCount(6);
    await expect(component.getByText("+3")).toBeVisible();
    // ONE LINE is a geometry claim: every chip shares a top edge. A `slice()` unit assertion cannot see the
    // wrap this pins against, which is the whole reason the cap exists.
    await expect
      .poll(() =>
        component.evaluate((el: HTMLElement) => {
          const tops = [...el.querySelectorAll<HTMLElement>('[data-slot="message-reaction-pill"]')].map((n) => Math.round(n.getBoundingClientRect().top));
          return new Set(tops).size;
        }),
      )
      .toBe(1);
  });
});

// B7/MR3 — a SEGMENT-anchored chip: the qualifier gloss, the snippet on `title`, and the press re-keying
// the SAME anchor (whole-message and per-line are independent toggles, so a segment chip that sent a bare
// toggle would silently retarget the member's click at the whole message).
test.describe("the segment-anchored chip", () => {
  const SegmentChip = [
    group("👍", [VIEWER_SEAT, OTHER_SEAT]),
    {
      variantId: VARIANT_ID,
      emoji: "😂",
      emojiImageAssetId: null,
      segmentIndex: 1,
      segmentSpeaker: "Bob",
      segmentSnippet: "Bob: Fine day.",
      reactorParticipantIds: [OTHER_SEAT],
    },
  ];

  test("glosses its target, carries the snippet on title, and a press re-keys the SAME anchor on the wire", async ({ mount, page }) => {
    const trpc = await routeTrpc(page, { "chat.listReactions": view(SegmentChip), "chat.getChat": CHAT_DETAIL, "chat.toggleReaction": true });
    const component = await mount(<MessageReactionsStory />);

    // The accessible name says the whole sentence — target included — and the printed gloss names the line.
    const chip = component.getByRole("button", { name: "React with 😂 to Bob's line — 1 so far" });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/→ Bob/);
    // The captured snippet rides `title` — the stored qualifier is DATA display, tellable on hover.
    await expect(chip).toHaveAttribute("title", "Bob: Fine day.");
    // …and the WHOLE-message sibling glosses nothing (the trio-null arm stays exactly as B6 shipped it).
    await expect(component.getByRole("button", { name: "React with 👍 — 2 so far" })).not.toHaveText(/→/);

    await chip.click();
    await expect
      .poll(() => trpc.inputs("chat.toggleReaction"))
      .toEqual([{ chatId: CHAT_ID, variantId: VARIANT_ID, emoji: "😂", segmentIndex: 1, segmentSpeaker: "Bob" }]);
  });
});

// B7 — the room's reactions posture resolved OFF: BOTH picker doors vanish (applicability, not a phase
// gate — the server refuses the verb too; these doors are the courtesy over that enforcement).
test.describe("the plane resolved OFF", () => {
  test("both doors are GONE while the rest of the menu stands", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": { reactionsEnabled: false, groups: [] }, "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageActionsDoorsStory />);

    // Barrier on the row's other affordances so the absence reads are about the posture, not a blank mount.
    await expect(component.getByRole("button", { name: "More message actions" })).toBeVisible();
    await expect(component.getByRole("button", { name: "Add a reaction" })).toHaveCount(0);
    await component.getByRole("button", { name: "More message actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Copy" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Add a reaction" })).toHaveCount(0);
  });
});

test.describe("the pill row at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the chip box IS the touch floor — no overflowing pseudo to clip in a run", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, { "chat.listReactions": view(TWO_CHIPS), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageReactionsStory />);
    const floor = await touchFloorPx(page);

    // `Toggle size="chip"` floors the BOX (`h-touch-target`), which is what makes this run safe where the
    // rpg condition-chip ✕ was not: there is no `::after` for a wrap gap to clip.
    await expect
      .poll(() =>
        component.evaluate((el: HTMLElement) => {
          const nodes = [...el.querySelectorAll<HTMLElement>('[data-slot="message-reaction-pill"]')];
          return nodes.map((n) => Math.round(n.getBoundingClientRect().height));
        }),
      )
      .toEqual([floor, floor]);
  });
});

test.describe("the picker's two doors", () => {
  test("at a FINE pointer both the inline glyph and the ⋯ item are present", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": view([]), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageActionsDoorsStory />);

    await expect(component.getByRole("button", { name: "Add a reaction" })).toBeVisible();
    await component.getByRole("button", { name: "More message actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Add a reaction" })).toBeVisible();
  });

  test("the ⋯ item opens the picker, and the grid is the CONTRACT vocabulary", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": view(TWO_CHIPS), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageActionsDoorsStory />);

    await component.getByRole("button", { name: "Add a reaction" }).click();
    const picker = page.locator('[data-slot="reaction-picker"]');
    await expect(picker).toBeVisible();
    // Ten cells — the closed `REACTION_EMOJIS` tuple, iterated. A hand-kept picker list would drift from the
    // wire enum that refuses everything outside it.
    await expect(picker.getByRole("button", { name: /React with/ })).toHaveCount(10);
    // The picker doubles as the UN-react path: the viewer's existing 👍 reads pressed here too.
    await expect(picker.getByRole("button", { name: "React with 👍" })).toHaveAttribute("aria-pressed", "true");
    await expect(picker.getByRole("button", { name: "React with 😂" })).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("the picker doors at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the inline glyph is DISPLAY:NONE and the ⋯ item survives — one door per pointer class", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, { "chat.listReactions": view([]), "chat.getChat": CHAT_DETAIL });
    const component = await mount(<MessageActionsDoorsStory />);

    // `ROW_ACTION_INLINE` is `pointer-coarse:hidden` — `display:none`, so the glyph leaves the a11y tree
    // too. That is legal for THIS control precisely because its verb rides the menu at every pointer.
    await expect(component.getByRole("button", { name: "Add a reaction" })).toHaveCount(0);
    await component.getByRole("button", { name: "More message actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Add a reaction" })).toBeVisible();
  });
});
