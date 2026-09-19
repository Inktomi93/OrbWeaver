// CT: the composer's four guided CONTROL LEAVES (composer-guided-buttons.tsx) — the presentation half the
// cluster orchestrates. Driven through the REAL `<Composer>` (the ComposerStory precedent) so the leaves are
// exercised with the props production actually hands them; routeTrpc stubs the network.
//
// Deliberately DISJOINT from composer-guided-cluster.ct.tsx, which owns the ORCHESTRATION (which mutation each
// icon fires, steer consume/keep, the impersonate stream). This file owns the three things that live INSIDE the
// leaves and nothing else asserts:
//   1. RESPONSE'S CHARACTER-COUNT FORK — `ResponseGuidedButton` renders a DIRECT button at ≤ 1 seated
//      character and a SPEAKER MENU above that (Auto + one row per character). The cluster CT never stubs a
//      roster, so it only ever meets the solo arm; the multi-character room — the fork's whole reason to
//      exist — was unexercised.
//   2. THE CHARGE ASYMMETRY — `hasText && !disabled` for Swipe/Continue/Impersonate vs bare `hasText` for
//      Response. So on a room with no assistant tail, typing charges Response and does NOT charge the two
//      tail-gated icons. `data-cta` (@orb/ui Button's primary marker) is the rendered tell; @orb/ui primitives
//      drop `data-testid`, so the controls are reached by role+name.
//   3. NO NATIVE `title` ON A TOOLTIP-WRAPPED TRIGGER (side-eye 2026-08-21, the file header's law). Every
//      control here is a Base UI TooltipTrigger that ALSO carried the same string as a `title`, so Chrome
//      stacked its OS tooltip on the rendered popup. The fix is only durable if the ABSENCE is pinned together
//      with the reason still reaching a DISABLED control by hover (`focusableWhenDisabled` +
//      `data-disabled:pointer-events-auto` are what keep it reachable).
//   4. THE REASON/CUE ALSO REACHES A POINTER THAT CANNOT HOVER (#2443, side-eye 2026-09-19). Base UI 1.7.0's
//      tooltip is `mouseOnly: true` with a `:focus-visible`-gated focus fallback, so §3's single carrier was
//      mute on touch and to a virtual screen-reader cursor. The same string is now the control's accessible
//      DESCRIPTION — and NOT its name, which stays the bare verb a voice-control user can say.
//
// Menu POPUPs render through a Base UI Portal — menu-item assertions use the PAGE locator, never `component`.

import { RESPONSE_SPEAKER_CUE, STEER_CUE_RESPONSE, SWIPE_NEEDS_REPLY } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES } from "../fixtures.ts";

const RESPONSE = "Generate reply";
const RESPONSE_GUIDED = "Guided generate reply";
const SWIPE = "Try another reply";
const CONTINUE = "Continue the reply";
const IMPERSONATE = "Draft your line";
const AUTO = "Auto (arbitrate)";

/** A present character seat on the `chat.getChat` roster — what `filterCharacters` feeds the speaker menu. */
function character(name: string): Record<string, unknown> {
  return {
    id: `participant_${name.toLowerCase()}`,
    kind: "character",
    role: "member",
    userId: null,
    characterId: `character_${name.toLowerCase()}`,
    displayName: name,
    avatarHash: null,
    leftSeq: null,
  };
}

/** A human seat — present but never a speaker option (the menu is the seated CHARACTERS). */
const HOST = {
  id: "participant_host",
  kind: "human",
  role: "host",
  userId: "user_host",
  characterId: null,
  displayName: "Nate",
  avatarHash: null,
  leftSeq: null,
};

const GROUP_ROSTER = { participants: [HOST, character("Aria"), character("Bolt")] };

// ── 1. Response's character-count fork ───────────────────────────────────────────────────────────────────────────────

test("a MULTI-character room turns Response into a speaker menu: picking a name rides speakerCharacterId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": () => GROUP_ROSTER, "chat.generate": () => ({}) });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: RESPONSE }).click();
  // The human seat is NOT a speaker option — only the seated characters are.
  await expect(page.getByRole("menuitem", { name: "Nate" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: AUTO })).toBeVisible();
  await page.getByRole("menuitem", { name: "Bolt" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll settled the recorder at exactly 1 call.
  expect(trpc.lastInput("chat.generate")).toMatchObject({ speakerCharacterId: "character_bolt" });
});

test("Auto (arbitrate) is a real row: it fires the generate with NO speaker (the server arbitrates)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": () => GROUP_ROSTER, "chat.generate": () => ({}) });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: RESPONSE }).click();
  await page.getByRole("menuitem", { name: AUTO }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  // Settled snapshot: the poll settled the recorder at exactly 1 call. `null`/omitted ⇒ arbitration picks the speaker,
  // so the field must be ABSENT from the wire, not a null placeholder.
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.generate") as { speakerCharacterId?: unknown };
  const input = trpc.lastInput("chat.generate") as { speakerCharacterId?: unknown };
  await expect.poll(async () => (await readInputAtAssertion()).speakerCharacterId).toBeUndefined();
});

// #539 — RESPONSE IS THE ONE SPEAK-AS DOOR, so its group-room tooltip has to SAY there is a speaker choice.
// A standalone `Speak as a character` dropdown used to sit ~150px away in the same `Their reply` home, firing
// the same `chat.generate` with the same `speakerCharacterId` while discarding the typed steer and the
// `afterAssistant` nudge; it was retired as a duplicate door (#520/#532 class). The cue is what keeps the
// affordance discoverable now that the visibly-named control is gone — a solo room has no choice to announce,
// so it keeps the bare label (the arm the test below owns).
test("a MULTI-character room's idle Response tooltip announces the speaker choice", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": () => GROUP_ROSTER });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: RESPONSE, exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]')).toHaveText(`${RESPONSE} — ${RESPONSE_SPEAKER_CUE}`);
});

test("a SOLO-character room keeps the DIRECT Response button — one click fires, no speaker menu exists", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => ({ participants: [HOST, character("Aria")] }),
    "chat.generate": () => ({}),
  });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: RESPONSE }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  // The fork's other arm: no popup opened, so nothing to pick — the click IS the fire.
  await expect(page.getByRole("menuitem", { name: AUTO })).toHaveCount(0);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.generate") as { speakerCharacterId?: unknown };
  const input = trpc.lastInput("chat.generate") as { speakerCharacterId?: unknown };
  await expect.poll(async () => (await readInputAtAssertion()).speakerCharacterId).toBeUndefined();
});

// ── 2. The charge asymmetry ───────────────────────────────────────────────────────────────────────────────

// @orb/ui Button marks its `primary` intent with `data-cta` — the guided icons' CHARGE tell.
const CHARGE = "data-cta";

test("typing charges only what it can actually steer: Response + Draft charge, the tail-gated icons do not", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES }); // no assistant tail ⇒ Swipe/Continue are phase-disabled
  const component = await mount(<ComposerStory />);

  // Empty composer: nothing is charged.
  await Promise.all(
    [RESPONSE, IMPERSONATE, SWIPE, CONTINUE].map((name) => expect(component.getByRole("button", { name, exact: true })).not.toHaveAttribute(CHARGE)),
  );

  await component.getByRole("textbox", { name: "Message" }).fill("make her angrier");

  // `hasText` alone charges Response; `hasText && !disabled` leaves the two tail-gated icons cold — a charged
  // icon that cannot fire is the lie this asymmetry exists to prevent.
  await expect(component.getByRole("button", { name: RESPONSE_GUIDED, exact: true })).toHaveAttribute(CHARGE);
  await expect(component.getByRole("button", { name: "Guided draft your line", exact: true })).toHaveAttribute(CHARGE);
  await expect(component.getByRole("button", { name: "Try another reply with this direction", exact: true })).not.toHaveAttribute(CHARGE);
  await expect(component.getByRole("button", { name: "Continue the reply with this direction", exact: true })).not.toHaveAttribute(CHARGE);
});

// ── 3. No native `title` — the tooltip and the accessible description are the carriers ────────────────────

test("no guided control carries a native `title` — the tooltip popup is the sole explanation carrier", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  // Both states matter: an ENABLED trigger (Response/Draft) and a DISABLED one (Swipe/Continue, no tail) — the
  // disabled pair is exactly where a native title used to be justified as "the only reachable explanation".
  await Promise.all(
    [RESPONSE, IMPERSONATE, SWIPE, CONTINUE].map((name) =>
      expect(component.getByRole("button", { name, exact: true }), `${name} must not stack an OS tooltip`).not.toHaveAttribute("title"),
    ),
  );
});

test("a DISABLED guided icon still explains itself on hover (the reason the native title stood in for)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  const swipe = component.getByRole("button", { name: SWIPE, exact: true });
  await expect(swipe).toBeDisabled();
  await swipe.hover();
  // `data-disabled:pointer-events-auto` is what lets the hover land at all; without it the popup never opens.
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]')).toHaveText(`${SWIPE} — ${SWIPE_NEEDS_REPLY}`);
  await page.mouse.move(0, 0);
});

test("an ENABLED guided icon's tooltip teaches the dual mode: the plain label, then the steer cue", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: RESPONSE, exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]')).toHaveText(RESPONSE);
  await page.mouse.move(0, 0);

  // With text the SAME control promises what the text will do — the typed-text-becomes-steer contract.
  await component.getByRole("textbox", { name: "Message" }).fill("make her angrier");
  await component.getByRole("button", { name: RESPONSE_GUIDED, exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]')).toHaveText(`${RESPONSE} — ${STEER_CUE_RESPONSE}`);
});

// ── 4. The reason and the cues are the control's DESCRIPTION, not just a hover popup (#2443) ───────────────

test("a DISABLED guided icon's reason is its accessible DESCRIPTION — readable with no hover and no tap", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  // No hover, no tap, no focus: the description resolves at rest, which is the whole point — a tap cannot
  // open a `mouseOnly` tooltip and an aria-disabled Base UI Button swallows its own click, so a press door
  // is not available here either.
  const swipe = component.getByRole("button", { name: SWIPE, exact: true });
  await expect(swipe).toHaveAccessibleName(SWIPE);
  await expect(swipe).toHaveAccessibleDescription(SWIPE_NEEDS_REPLY);
});

test("a typed steer's promise is the charged control's description, and the name stays sayable", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  const response = component.getByRole("button", { name: RESPONSE, exact: true });
  // Idle and solo: no detail at all, so nothing announces the label twice.
  await expect(response).toHaveAccessibleDescription("");

  await component.getByRole("textbox", { name: "Message" }).fill("make her angrier");
  const charged = component.getByRole("button", { name: RESPONSE_GUIDED, exact: true });
  await expect(charged).toHaveAccessibleDescription(STEER_CUE_RESPONSE);
});

test("the group-room speaker cue — the one door to who replies next — is the Response control's description", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => ({ title: "Council", participants: [HOST, character("Mira"), character("Doran")], viewerIsHost: true }),
  });
  const component = await mount(<ComposerStory />);
  await expect(component.getByRole("button", { name: RESPONSE, exact: true })).toHaveAccessibleDescription(RESPONSE_SPEAKER_CUE);
});
