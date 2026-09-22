// CT: B6/MR2 — the reaction PICKER as its own subject (the `chat-component-presence` ratchet's direct-CT
// decision for `reaction-picker.tsx`).
//
// WHY A DIRECT CT RATHER THAN A `coveredBy` WAIVER, since `message-reactions.ct.tsx` already opens this
// dialog through the real row: that CT drives the picker as a DOOR — it proves the ⋯ item opens something
// carrying ten cells with the right pressed states. What it never touches is the half of a dialog that is
// not its content: the SELECTION ROUND-TRIP (a pick reaching the wire with the right vars) and the two ways
// it CLOSES (a pick closes it; a dismiss does not write). Those were genuinely unpinned, so the waiver would
// have recorded coverage that did not exist — the ratchet's own failure mode.
//
// THE ROUND-TRIP IS ASSERTED AT THE WIRE, not at a callback. The story lifts the row's real wiring (the real
// `useToggleReactionMutation` → the real `chat.toggleReaction` proc), so `routeTrpc`'s recorder is what says
// whether the pick actually travelled — and it says WHAT travelled, which is the part a spy `onPick` would
// have let drift (a wrong `variantId` renders identically and reacts to the wrong swipe).

import { expect, test } from "@playwright/experimental-ct-react";
import { touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import type { TrpcFixtureOutput, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { NarratorActionsDoorsStory, ReactionPickerStory, StandardLabeledDoorsStory } from "../_reaction-stories.tsx";

// Must MATCH `fixtures.ts::makeMessageView` — the picker's pressed state selects this room's window by the
// message's own `selectedVariantId`, so a mismatched fixture renders an all-unpressed grid that passes.
const VARIANT_ID = "mv_ct_1";
const CHAT_ID = "chat_ct_keystone";
const VIEWER_ID = "user_ct_viewer";
const VIEWER_SEAT = "chat_participant_ct_viewer";
const OTHER_SEAT = "chat_participant_ct_other";

const CHAT_DETAIL = {
  id: CHAT_ID,
  viewerUserId: VIEWER_ID,
  participants: [
    { id: VIEWER_SEAT, userId: VIEWER_ID, leftSeq: null },
    { id: OTHER_SEAT, userId: "user_ct_other", leftSeq: null },
  ],
} satisfies TrpcFixtureOutput<"chat.getChat">;

/** The viewer already holds 👍 on this variant; 😂 is somebody else's. Whole-message groups (all-null
 *  trio — B7): the picker's pressed state is per TARGET, and these must read pressed for the DEFAULT
 *  (whole-message) target exactly as they did before segments existed. */
const GROUPS = [
  {
    variantId: VARIANT_ID,
    emoji: "👍",
    emojiImageAssetId: null,
    segmentIndex: null,
    segmentSpeaker: null,
    segmentSnippet: null,
    reactorParticipantIds: [VIEWER_SEAT],
  },
  {
    variantId: VARIANT_ID,
    emoji: "😂",
    emojiImageAssetId: null,
    segmentIndex: null,
    segmentSpeaker: null,
    segmentSnippet: null,
    reactorParticipantIds: [OTHER_SEAT],
  },
] satisfies TrpcWireOutput<"chat.listReactions">["groups"];

/** The B7 wire view — `listReactions` carries the room's resolved posture beside the groups. */
const VIEW = { reactionsEnabled: true, groups: GROUPS } satisfies TrpcWireOutput<"chat.listReactions">;

const PICKER = '[data-slot="reaction-picker"]';

test.describe("the reaction picker", () => {
  test("opens with the CONTRACT vocabulary, and the viewer's own reactions read pressed", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": VIEW, "chat.getChat": CHAT_DETAIL });
    const component = await mount(<ReactionPickerStory />);

    await expect(page.locator(PICKER)).toHaveCount(0);
    await component.getByRole("button", { name: "Open the picker" }).click();

    const picker = page.locator(PICKER);
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("heading", { name: "Add a reaction" })).toBeVisible();
    // Ten cells — `REACTION_EMOJIS` iterated. A hand-kept list here would drift from the wire enum that
    // refuses everything outside it, and the drift would only surface as a server refusal.
    await expect(picker.getByRole("button", { name: /React with/ })).toHaveCount(10);
    // The picker doubles as the UN-react path, so its pressed state must be the viewer's SEAT, not "anyone".
    await expect(picker.getByRole("button", { name: "React with 👍" })).toHaveAttribute("aria-pressed", "true");
    await expect(picker.getByRole("button", { name: "React with 😂" })).toHaveAttribute("aria-pressed", "false");
    await expect(picker.getByRole("button", { name: "React with 🎉" })).toHaveAttribute("aria-pressed", "false");
    // The room-public consequence is stated, not assumed — reactions are canon every member sees.
    await expect(picker.getByText("Everyone in this room sees reactions.")).toBeVisible();
  });

  test("a pick reaches the WIRE with this variant's ids, and closes the dialog", async ({ mount, page }) => {
    const trpc = await routeTrpc(page, { "chat.listReactions": VIEW, "chat.getChat": CHAT_DETAIL, "chat.toggleReaction": true });
    const component = await mount(<ReactionPickerStory />);

    await component.getByRole("button", { name: "Open the picker" }).click();
    await page.locator(PICKER).getByRole("button", { name: "React with 🔥" }).click();

    // WHAT travelled, not merely that something did: a wrong `variantId` renders identically and would
    // react to the wrong swipe of the same message.
    // POLLED, never sampled: a recorder read is node-side state the click mutates asynchronously, so a
    // bare `expect()` reads whatever happens to have landed by that tick (`ct-no-oneshot-live-read-assert`).
    await expect.poll(() => trpc.inputs("chat.toggleReaction")).toEqual([{ chatId: CHAT_ID, variantId: VARIANT_ID, emoji: "🔥" }]);
    // One reaction per visit — leaving it open would leave the reader looking at a surface whose result is
    // behind it.
    await expect(page.locator(PICKER)).toHaveCount(0);
  });

  test("an UN-react goes through the same one write path — no second verb for the reverse direction", async ({ mount, page }) => {
    const trpc = await routeTrpc(page, { "chat.listReactions": VIEW, "chat.getChat": CHAT_DETAIL, "chat.toggleReaction": false });
    const component = await mount(<ReactionPickerStory />);

    await component.getByRole("button", { name: "Open the picker" }).click();
    // Pressing the cell the viewer ALREADY holds is a removal — and it is the SAME proc with the same shape,
    // because the server owns the direction (a client that sent "add"/"remove" could be a repaint behind).
    await page.locator(PICKER).getByRole("button", { name: "React with 👍" }).click();

    await expect.poll(() => trpc.inputs("chat.toggleReaction")).toEqual([{ chatId: CHAT_ID, variantId: VARIANT_ID, emoji: "👍" }]);
  });

  test("DISMISS closes it and writes NOTHING — and the trigger reopens a live picker", async ({ mount, page }) => {
    const trpc = await routeTrpc(page, { "chat.listReactions": VIEW, "chat.getChat": CHAT_DETAIL, "chat.toggleReaction": true });
    const component = await mount(<ReactionPickerStory />);

    const trigger = component.getByRole("button", { name: "Open the picker" });
    await trigger.click();
    await expect(page.locator(PICKER)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(PICKER)).toHaveCount(0);

    // THE NEGATIVE IS PROVED BY A POSITIVE CONTROL, never by sampling a zero. "Nothing was written" is
    // un-assertable on its own — a poll on 0 passes instantly and says nothing about a call still in
    // flight. So the arm REOPENS (which also proves the dismiss did not strand `open`: the picker mounts
    // only while open, so a stuck flag would render a dialog nothing can close), picks, and pins the
    // recorder to EXACTLY ONE call — had the dismiss written, this would be two.
    await trigger.click();
    await expect(page.locator(PICKER).getByRole("button", { name: /React with/ })).toHaveCount(10);
    await page.locator(PICKER).getByRole("button", { name: "React with 🎉" }).click();
    await expect.poll(() => trpc.inputs("chat.toggleReaction")).toEqual([{ chatId: CHAT_ID, variantId: VARIANT_ID, emoji: "🎉" }]);
  });
});

// B7/MR3 — the TARGET row: react to the whole message (the default) or to ONE speaker's line. Driven
// through the REAL row (`MessageActionsRow` → its picker mount), because the narrator gate lives THERE:
// the row narrator-gates the cast names against `message.kind` before the picker ever parses.
test.describe("the segment target row (B7)", () => {
  test("a NARRATOR body offers per-speaker targets, whole-message is the DEFAULT, and a segment pick carries the CLAIM", async ({ mount, page }) => {
    const trpc = await routeTrpc(page, {
      "chat.listReactions": { reactionsEnabled: true, groups: [] },
      "chat.getChat": CHAT_DETAIL,
      "chat.toggleReaction": true,
    });
    const component = await mount(<NarratorActionsDoorsStory />);

    await component.getByRole("button", { name: "Add a reaction" }).click();
    const picker = page.locator(PICKER);
    await expect(picker).toBeVisible();
    // Whole-message leads and is PRESSED — the spec's "whole-message default at coarse" is satisfied by
    // defaulting everywhere; a segment is an explicit narrowing per visit.
    await expect(picker.getByRole("button", { name: "React to the whole message" })).toHaveAttribute("aria-pressed", "true");
    await expect(picker.getByRole("button", { name: "React to Alice's line" })).toBeVisible();

    // Narrow to Bob's line (span index 1 — Alice's line occupies 0), then pick.
    await picker.getByRole("button", { name: "React to Bob's line" }).click();
    await picker.getByRole("button", { name: "React with 🔥" }).click();

    // The wire carries the parsed CLAIM (index + the span's speaker) — the identical inputs the server's
    // own validation parse re-derives, which is what makes the pick survive the round trip.
    await expect
      .poll(() => trpc.inputs("chat.toggleReaction"))
      .toEqual([{ chatId: CHAT_ID, variantId: VARIANT_ID, emoji: "🔥", segmentIndex: 1, segmentSpeaker: "Bob" }]);
    await expect(page.locator(PICKER)).toHaveCount(0);
  });

  test("the SAME labelled body on a STANDARD row offers NO targets — the narrator gate, client side", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listReactions": { reactionsEnabled: true, groups: [] }, "chat.getChat": CHAT_DETAIL });
    const component = await mount(<StandardLabeledDoorsStory />);

    await component.getByRole("button", { name: "Add a reaction" }).click();
    const picker = page.locator(PICKER);
    // The grid is alive (the barrier) — and the target row simply does not exist: in a standard row
    // `Alice:` is prose, so offering her line would mint an anchor the server's parse refuses.
    await expect(picker.getByRole("button", { name: /React with/ })).toHaveCount(10);
    await expect(picker.getByRole("button", { name: "React to the whole message" })).toHaveCount(0);
    await expect(picker.getByRole("button", { name: /'s line$/ })).toHaveCount(0);
  });
});

test.describe("the reaction picker at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("every cell clears the touch floor — a ten-cell grid is the wrap this must survive", async ({ mount, page }) => {
    // PROVE the emulation before trusting any geometry it produces: `--spacing-touch-target` is
    // pointer-CONDITIONAL, so read at a fine pointer it answers 28 and the assertion means nothing.
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, { "chat.listReactions": VIEW, "chat.getChat": CHAT_DETAIL });
    const component = await mount(<ReactionPickerStory />);
    await component.getByRole("button", { name: "Open the picker" }).click();

    const floor = await touchFloorPx(page);
    // `Toggle size="chip"` floors the BOX (`h-touch-target`), not an overflowing `::after` — which is
    // exactly what makes a WRAPPING run safe here where the rpg condition-chip ✕ was not (its pseudo was
    // clipped by the gap it shared with the row below).
    await expect
      .poll(() =>
        page.evaluate((sel: string) => {
          const cells = [...(document.querySelector(sel)?.querySelectorAll<HTMLElement>('button[aria-label^="React with"]') ?? [])];
          return cells.map((n) => Math.round(n.getBoundingClientRect().height));
        }, PICKER),
      )
      .toEqual(Array.from({ length: 10 }, () => floor));
  });
});
