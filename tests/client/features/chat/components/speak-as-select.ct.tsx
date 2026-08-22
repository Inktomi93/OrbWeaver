// CT: the composer speak-as dropdown (speak-as-select.tsx, task #29). Drives the production path over
// the stubbed network (routeTrpc) — `chat.getChat` supplies the roster; picking a member fires the real
// `chat.generate` with that `speakerCharacterId`. Proves the D16 size-gate (solo/draft → no control),
// the item list ("Auto" + one per character), and that a pick dispatches generate with the right speaker.
//
// The dropdown POPUP renders through a Base UI Portal, so menu-item assertions use the PAGE locator
// (`page.getByRole`), never `component` — the composer-guided-cluster.ct.tsx precedent.

import { SPEAK_AS_WAIT_FOR_TURN } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { SpeakAsSelectStory } from "../_ct-stories.tsx";

function character(key: string, name: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
    ...over,
  };
}

function roster(...members: unknown[]): unknown {
  return { participants: members };
}

test("a solo roster (1 character) renders NO speak-as control (the D16 size-gate)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => roster(character("aria", "Aria")) });
  const component = await mount(<SpeakAsSelectStory />);
  await expect(component.getByRole("button", { name: "Speak as a character" })).toHaveCount(0);
});

test("a 2+ roster opens to Auto + one item per character", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<SpeakAsSelectStory />);

  await component.getByRole("button", { name: "Speak as a character" }).click();

  await expect(page.getByRole("menuitem", { name: "Auto (arbitrate)" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Aria" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Bryn" })).toBeVisible();
});

test("picking a character fires chat.generate with that speakerCharacterId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.generate": () => ({ messages: [], aborted: false }),
  });
  const component = await mount(<SpeakAsSelectStory />);

  await component.getByRole("button", { name: "Speak as a character" }).click();
  await page.getByRole("menuitem", { name: "Bryn" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.generate")).toMatchObject({ speakerCharacterId: "character_bryn" });
});

// ── THE DISABLED TRIGGER EXPLAINS ITSELF (side-eye 2026-08-21, #384 item 5) ──────────────────────────
// The trigger ships `focusableWhenDisabled`, which is a PROMISE: a control kept in the tab order while it is
// aria-disabled is kept there so a keyboard reader can reach it and be TOLD why it is off. It carried no
// reason — its tooltip described only what the control would do — so tabbing to it during a turn landed on a
// dead affordance with a cheerful invitation. (The composer's other icons compose "<what it does> — <the
// unlock condition>" for exactly this; `reasonFor` in composer-guided-cluster.tsx is that seam.)
//
// The send-availability arm below joined it under owner ruling #397 (#406): speak-as fires a turn, so an
// unserveable connection idles it exactly like the four guided icons.
const SPEAK_AS_TOOLTIP = "Choose who speaks next";
// The `engine-off` copy, spelled literally so a drift in `sendUnavailableReason` reds here as it does in
// composer.ct.tsx rather than following the source into a new string.
const ENGINE_OFF_REASON = "Local engine is off — enable it to send.";

test("while its own generate is in flight the trigger is aria-disabled AND says why", async ({ mount, page }) => {
  const held = trpcHold();
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.generate": held,
  });
  const component = await mount(<SpeakAsSelectStory />);

  const trigger = component.getByRole("button", { name: "Speak as a character" });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Auto (arbitrate)" }).click();
  // SETTLED barrier: the generate is in flight and held there, so the disabled arm is a stable state
  // rather than a flash to catch.
  await held.requested;
  await expect(trigger).toHaveAttribute("aria-disabled", "true");

  // WAIT FOR THE MENU TO ACTUALLY LEAVE before hovering: the just-dismissed popup's positioner is still
  // mounted for its close animation and it intercepts pointer events, so a hover here times out (measured).
  await expect(page.getByRole("menu")).toHaveCount(0);
  // THE TRIGGER IS STILL HOVERABLE WHILE DISABLED, and that is not incidental: a disabled Button drops
  // pointer events, which made the reason's only carrier unreachable by mouse (measured — `elementFromPoint`
  // over the trigger returned its parent div). `data-disabled:pointer-events-auto` is what buys this hover,
  // exactly as the composer's four guided icons do it.
  await trigger.hover();
  await expect(page.getByRole("tooltip", { name: `${SPEAK_AS_TOOLTIP} — ${SPEAK_AS_WAIT_FOR_TURN}`, exact: true })).toBeVisible();

  // …and the reason retires with the cause: the settled control is an invitation again, not an excuse.
  held.release({ messages: [], aborted: false });
  await expect(trigger).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("tooltip", { name: SPEAK_AS_TOOLTIP, exact: true })).toBeVisible();
});

// ── THE SEND GATE REACHES SPEAK-AS (#406, owner ruling #397) ─────────────────────────────────────────
// Speak-as fires `chat.generate` — a TURN. An unserveable connection dooms it exactly as it dooms the four
// guided icons, so the control idles with the SAME cause-specific reason instead of inviting a doomed turn.
// The send cause is PERSISTENT, so it wins over the phase reason (`reasonFor`, composer-guided-cluster.tsx).
test("an unserveable connection idles the trigger and the tooltip names the send cause", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }),
  });
  const component = await mount(<SpeakAsSelectStory />);

  const trigger = component.getByRole("button", { name: "Speak as a character" });
  // SETTLED barrier: the verdict is a resolved query, so the disabled arm is the steady state — poll the
  // rendered attribute rather than asserting on the first commit (the verdict lands after mount).
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await trigger.hover();
  await expect(page.getByRole("tooltip", { name: `${SPEAK_AS_TOOLTIP} — ${ENGINE_OFF_REASON}`, exact: true })).toBeVisible();
  // The refusal is REAL, not decorative: the menu never opens, so no doomed generate can be dispatched. `force`
  // is required and is the point — playwright's own actionability check refuses a disabled control, so an
  // ordinary click would prove only that playwright agrees it is off. Forcing the event past that check is what
  // asks the component itself, and Base UI's aria-disabled MenuTrigger swallows it.
  await trigger.click({ force: true });
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("picking Auto fires chat.generate with a null speakerCharacterId (arbitration picks)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.generate": () => ({ messages: [], aborted: false }),
  });
  const component = await mount(<SpeakAsSelectStory />);

  await component.getByRole("button", { name: "Speak as a character" }).click();
  await page.getByRole("menuitem", { name: "Auto (arbitrate)" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.generate")).toMatchObject({ speakerCharacterId: null });
});
