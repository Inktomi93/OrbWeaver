// CT: the chat composer (task #18). Drives the PRODUCTION path — routeTrpc stubs the network, the
// component fires the real `createEntityMutation`-backed hooks. Turn-lifecycle transitions (pending/
// streaming/stopping/aborted) and the clear-on-commit signal are driven via the story's driver buttons
// (mirrors ghost-message-row.ct.tsx's approach) rather than a scripted SSE body — `markStopping`'s
// immediate-feedback half + the `notifyUserMessageCommitted` signal are client-only (no network round-
// trip), and the store's own `chat-stream.test.ts` already proves the underlying transitions; this suite
// proves the COMPONENT wires them correctly.
//
// CLEAR-ON-COMMIT (UI-Gates §11.1): the composer does NOT clear its draft optimistically on submit — it
// clears only when the bus confirms the caller's own user row committed (the `drive-message-committed`
// button stands in for that bus event). A send that fails before that commit keeps the draft for retry;
// there is no restore logic and no race window (the removed phase-gate). To exercise the clear/keep
// windows deterministically, `chat.send` is HELD (its listener stays alive) while the signal is driven.

// The helper copy is asserted from its ONE home, never re-typed here — a re-spelled literal is how a copy
// change goes green against a string nobody ships.
import { IMPERSONATE_STOP_LABEL, IMAGE_GEN_SPENDS_NOW as SPENDS_RIGHT_AWAY } from "@orb/client/lib";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeImpersonateStream } from "../../../../support/node/route-impersonate-stream.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { ChatRoomPhoneStory, ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, COMPOSER_CHAT_ID } from "../fixtures.ts";

// A getUserSettings view with a chat-pref override — drives the composer's enterSends/continueOnSend read.
function settingsWith(chat: Partial<(typeof DEFAULT_USER_SETTINGS)["chat"]>): unknown {
  return {
    userId: "user_ct_composer",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, ...chat } },
    updatedAt: 0,
  };
}

const TAIL_ASSISTANT_ID = castId<MessageId>("message_ct_tail_assistant");
// The single clean accessible name for the Attach media row (P1-C — size-hinted, no doubled name; #317
// widened the copy to images + video).
const ATTACH_NAME = /^Attach images & video, up to [\d.]+ MB per file$/u;

// ── D111 ☰ RELOCATION: the ⋯ chat-options menu lives in the composer's LEFT gutter, and ONLY there ──
// Owner ruling 2026-08-09 closed D111's parked "topbar vs composer" fork on the composer and removed the
// topbar trail widget in the same change. These assert the PLACEMENT (the sibling composer-chat-options.ct
// owns the menu's contents): present in both phases, and geometrically LEFT of the guided cluster — a
// mount that landed it on the right would satisfy a presence-only assertion.
test("D111: the ⋯ chat-options menu renders in the composer, LEFT of the guided cluster (committed)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": () => ({ title: "Council", participants: [], viewerIsHost: true }) });
  const component = await mount(<ComposerStory />);
  const options = component.getByRole("button", { name: "Chat options" });
  await expect(options).toBeVisible();

  await expect.poll(async () => options.boundingBox()).not.toBeNull();
  await expect.poll(async () => component.getByRole("group", { name: "Your message", exact: true }).boundingBox()).not.toBeNull();
  const optionsBox = await options.boundingBox();
  const guidedBox = await component.getByRole("group", { name: "Your message", exact: true }).boundingBox();
  expect(optionsBox?.x ?? 0).toBeLessThan(guidedBox?.x ?? 0);
});

// ── #54 honest-refusal pre-send gate: SEND + the guided fire actions refuse when the connection can't serve ─
// The composer reads `chat.checkSendAvailability` (a deterministic verdict, no turn fired). When it returns
// `available:false`, Send disables WITH the cause-specific reason. The reason string is asserted per cause;
// an available verdict leaves Send in its normal (draft-empty-disabled) state.
//
// THE REASON'S CARRIER MOVED (#2443, side-eye 2026-09-19). It used to be a native `title` beside a tooltip
// copy of the same string — two homes for one concept, and neither reaches a phone (a `title` is invisible
// on touch; Base UI 1.7.0's tooltip is `mouseOnly: true` with a `:focus-visible`-gated focus fallback). The
// `title` is gone, so these assert the two homes that DO reach a touch user: the control's accessible
// DESCRIPTION (an `sr-only` line the trigger's `aria-describedby` points at — read at rest, on any pointer),
// and the band's visible refusal line at a coarse pointer, asserted in its own arm below. An assertion on
// `title` would pass again the day someone re-adds it, which is the defect.
const ENGINE_OFF_REASON = "Local engine is off — enable it to send.";
const ENGINE_DOWN_REASON = "Local engine is down — start it to send.";
const NO_CONNECTION_REASON = "This chat has no working connection — configure one to send.";

test("#54: engine-off — Send is aria-disabled and DESCRIBED by the engine-off reason, with no native title", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }) });
  const component = await mount(<ComposerStory />); // committed; text present so it's not draft-empty-disabled
  await component.getByLabel("Message", { exact: true }).fill("hello");
  const send = component.getByRole("button", { name: "Send message" });
  // The base-ui-disabled idiom: aria-disabled, NOT native disabled (so the control stays focusable/hoverable).
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).not.toHaveAttribute("disabled", "");
  // The name still NAMES the control (what a voice-control user says); the reason is its DESCRIPTION.
  await expect(send).toHaveAccessibleName("Send message");
  await expect(send).toHaveAccessibleDescription(ENGINE_OFF_REASON);
  expect(await send.getAttribute("title")).toBeNull();
});

test("#54: engine-down — Send carries the engine-down reason (a DEAD registered engine under adopt-only)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.checkSendAvailability": () => ({ available: false, cause: "engine-down" }) });
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("hello");
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAccessibleDescription(ENGINE_DOWN_REASON);
});

test("#54: no-connection — Send carries the no-connection reason (the cause drives the copy)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.checkSendAvailability": () => ({ available: false, cause: "no-connection" }) });
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("hello");
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAccessibleDescription(NO_CONNECTION_REASON);
});

// #2443 — the SIGHTED touch user's half. A disabled Base UI Button swallows its own click, so the refusal
// cannot hide behind a press door either; it is visible copy under the band, once for the whole cluster
// (every icon here and the Send share the one cause). `hasTouch` flips `matchMedia("(pointer: coarse)")` in
// chromium, which is the media the `SHOW_ONLY_AT_COARSE` fragment keys on.
test.describe("#2443: the band's refusal at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("an unserveable connection states its reason as VISIBLE copy under the guided cluster", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }) });
    const component = await mount(<ComposerStory />);
    await expect(component.locator('[data-slot="composer-guided-refusal"]')).toHaveText(ENGINE_OFF_REASON);
  });

  test("a serveable connection shows no refusal line (the band is not permanently annotated)", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
    const component = await mount(<ComposerStory />);
    await expect(component.getByLabel("Message", { exact: true })).toBeVisible();
    await expect(component.locator('[data-slot="composer-guided-refusal"]')).toHaveCount(0);
  });
});

// The OTHER direction of the same pointer fragment. `SHOW_ONLY_AT_COARSE` is `pointer-fine:hidden`, i.e.
// `display: none` — so on a fine pointer the line is out of layout AND out of the a11y tree, which is only
// correct because the tooltip and the per-control descriptions carry the same string there. Without this arm
// the coarse assertion above would also pass on a line that rendered unconditionally.
test("#2443: at a FINE pointer the refusal line does not render — the tooltip is the carrier there", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }) });
  const component = await mount(<ComposerStory />);
  const line = component.locator('[data-slot="composer-guided-refusal"]');
  // The node is in the DOM (the cause IS in force) but the fragment stands it down at this pointer.
  await expect(line).toHaveCount(1);
  await expect(line).toBeHidden();
  await expect(line).toHaveCSS("display", "none");
});

test("#54: an unserveable connection refuses the SEND click — no chat.send fires", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("doomed turn");
  // The verdict is async — wait until it has landed as unavailable before probing the refusal.
  await expect.poll(() => trpc.count("chat.checkSendAvailability"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  await expect(component.getByRole("button", { name: "Send message" })).toHaveAttribute("aria-disabled", "true");
  // A forced click on the aria-disabled Send must not fire the turn (the Enter path is guarded in `submit`).
  await component.getByRole("button", { name: "Send message" }).click({ force: true });
  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(0);
});

test("#54: engine-off idles the guided fire actions with the engine-off reason (Response, Draft your line)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }) });
  const component = await mount(<ComposerStory />);
  // Response is otherwise NEVER disabled — an off engine is its only disabled state; the reason surfaces.
  const response = component.getByRole("button", { name: "Generate reply" });
  await expect(response).toHaveAttribute("aria-disabled", "true");
  // THE REASON'S CARRIER IS THE TOOLTIP, not a native `title` (side-eye 2026-08-21 — the guided icons are
  // TooltipTriggers, and carrying both stacked Chrome's OS tooltip on the rendered popup). The claim is
  // unchanged: the idled control names the engine-off cause, and it does so on FOCUS, which is what
  // `focusableWhenDisabled` keeps it in the tab order for. #206 below pins the same pairing for every control.
  await response.focus();
  await expect(page.getByRole("tooltip", { name: `Generate reply — ${ENGINE_OFF_REASON}`, exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Draft your line" })).toHaveAttribute("aria-disabled", "true");
});

test("#54: an AVAILABLE verdict leaves Send serveable (a typed committed composer sends)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.checkSendAvailability": () => ({ available: true }),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("serve me");
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
});

// ── imagery I5 base slice: the in-chat AI generate-image affordance ─────────────────────────────────────
// Wand v2: the image controls (attach + generate-from-text) moved OFF the composer bar and INTO the ✨ utility
// menu (owner). Generate-image is now a menu ITEM — open the ✨ menu (the composerUtility trigger), then act on
// the portalled row via the PAGE locator (the menu.ct portal split).
const UTILITY_TRIGGER = { name: "Message tools" } as const;

function composerCharacter(key: string, name: string): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
  };
}

function groupedComposerChat(): unknown {
  return {
    title: "Council",
    participants: [composerCharacter("aria", "Aria"), composerCharacter("bryn", "Bryn")],
    viewerIsHost: true,
  };
}

const COMPOSER_ACTIONS = [
  { name: "Chat options", group: "Chat actions" },
  { name: "Draft your line", group: "Your message" },
  { name: "Try another reply", group: "Their reply" },
  { name: "Generate reply", group: "Their reply" },
  { name: "Continue the reply", group: "Their reply" },
  { name: "Message tools", group: "Attach and send" },
  { name: "Send message", group: "Attach and send" },
] as const;
const LIVE_COMPOSER_ACTIONS = [
  COMPOSER_ACTIONS[0],
  { name: "Guided draft your line", group: "Your message" },
  { name: IMPERSONATE_STOP_LABEL, group: "Your message" },
  { name: "Try another reply with this direction", group: "Their reply" },
  { name: "Guided generate reply", group: "Their reply" },
  { name: "Continue the reply with this direction", group: "Their reply" },
  COMPOSER_ACTIONS[5],
  COMPOSER_ACTIONS[6],
] as const;
const REPLY_ACTION_NEEDS_REPLY = /Try another reply — needs an existing reply/iu;
const PARTIAL_DRAFT = "I step into the tavern, ";
const STREAM_RETRY_MS = 5000;

interface ControlBox {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ActionSpec {
  readonly name: string;
  readonly group: string;
}

async function controlBoxes(component: Locator, actions: readonly ActionSpec[]): Promise<readonly ControlBox[]> {
  const controls = [
    ...actions.map(({ name }) => ({ name, locator: component.getByRole("button", { name, exact: true }) })),
    { name: "Message", locator: component.getByRole("textbox", { name: "Message", exact: true }) },
  ];
  return await Promise.all(
    controls.map(async ({ name, locator }) => {
      const box = await locator.boundingBox();
      expect(box, `${name} must have rendered geometry`).not.toBeNull();
      if (box === null) {
        throw new Error(`${name} had no rendered geometry`);
      }
      return { name, ...box };
    }),
  );
}

function overlaps(a: ControlBox, b: ControlBox): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > 0.5 && overlapY > 0.5;
}

function expectRowMajorOrder(boxes: readonly ControlBox[]): void {
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    if (previous === undefined || current === undefined) {
      throw new Error(`Missing control geometry at index ${String(index)}`);
    }
    expect(current.y, `${current.name} must not paint above ${previous.name}`).toBeGreaterThanOrEqual(previous.y - 0.5);
    const followsPrevious = Math.abs(current.y - previous.y) > 0.5 || current.x > previous.x;
    expect(followsPrevious, `${current.name} must follow ${previous.name} on their shared row`).toBe(true);
  }
}

// THE #206 COARSE ROW LAW, RE-INPUT BY #531 (2026-08-23). #206 pinned the coarse arm's rows LITERALLY —
// "Their reply follows the first explicit row", "Their reply and Attach and send share the second", and at
// 320 "Their reply is centered on its owned row". Those clauses described the hand-placed 2×2 (+ `@max-xs`
// third row) grid, and #531 measured that grid as the larger half of the phone composer's chrome tax: it
// spent a whole 48px row + a 24px gap at EVERY width below the `@md` container step, including 430, where
// the four homes provably fit one line (372px of homes in a 392px card).
//
// #206's MECHANISM survives verbatim and is still asserted by its caller: the 44px target floor, painted-
// centre ownership, containment inside the composer and the viewport, zero overlap, row-major reading order,
// one truthful nearest owner per control, and no horizontal scroll. What is retired is only the ROW COUNT
// and the hand-placed 320px centring — the two clauses #531 exists to change. In their place: the homes read
// in order across however many rows FIT requires, and the last row still ends at the composer's right edge,
// so the terminal Send home is never orphaned into the left gutter.
async function expectExplicitCoarseRows(component: Locator): Promise<void> {
  const barBox = await component.locator('[data-slot="composer-guided-cluster"]').boundingBox();
  expect(barBox, "the action bar must have rendered geometry").not.toBeNull();
  const bar = barBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const groupBoxes = await Promise.all(
    ["Chat actions", "Your message", "Their reply", "Attach and send"].map(async (name) => {
      const box = await component.getByRole("group", { name, exact: true }).boundingBox();
      expect(box, `${name} must have rendered geometry`).not.toBeNull();
      return { name, ...(box ?? { x: 0, y: 0, width: 0, height: 0 }) };
    }),
  );
  const [chat, yours] = groupBoxes;
  if (chat === undefined || yours === undefined) {
    throw new Error("Missing composer group geometry");
  }
  // The two leading homes still open the bar together — that is the ORDER half of #206, and it holds whether
  // the bar takes one row or two.
  expect(Math.abs(chat.y - yours.y), "Chat actions and Your message share the first row").toBeLessThanOrEqual(0.5);
  expectRowMajorOrder(groupBoxes);
  // Whatever the fit produces, the FINAL row reaches the composer's right edge: the terminal Send home is
  // right-anchored on a wrapped line exactly as it is on a full one (the auto margins, not a grid column).
  const lastRowY = Math.max(...groupBoxes.map((group) => group.y));
  const lastRowRight = Math.max(...groupBoxes.filter((group) => group.y > lastRowY - 0.5).map((group) => group.x + group.width));
  expect(lastRowRight, "the bar's last row must reach the action bar's right edge").toBeGreaterThan(bar.x + bar.width - 1);
}

async function expectNearestActionGroups(component: Locator, actions: readonly ActionSpec[]): Promise<void> {
  const nearestGroups = await Promise.all(
    actions.map(
      async ({ name }) =>
        await component.getByRole("button", { name, exact: true }).evaluate((button) => button.closest('[role="group"]')?.getAttribute("aria-label") ?? null),
    ),
  );
  expect(nearestGroups).toEqual(actions.map(({ group }) => group));
}

async function expectCoarseComposerLayout(page: Page, component: Locator, actions: readonly ActionSpec[]): Promise<void> {
  const pointer = await page.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
    fine: matchMedia("(pointer: fine)").matches,
    touchPoints: navigator.maxTouchPoints,
  }));
  expect(pointer.coarse, "hasTouch must land the coarse-pointer token arm").toBe(true);
  expect(pointer.fine, "the fine-pointer override must not apply in the coarse control").toBe(false);
  expect(pointer.touchPoints, "the browser context must expose touch input").toBeGreaterThan(0);

  const composer = component.locator('[data-slot="composer"]');
  await expect.poll(async () => composer.boundingBox()).not.toBeNull();
  const composerBox = await composer.boundingBox();
  const bounds = composerBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const boxes = await controlBoxes(component, actions);
  const viewportWidth = await page.evaluate(() => innerWidth);

  const actionBoxes = boxes.slice(0, actions.length);
  for (const action of actionBoxes) {
    expect(Math.min(action.width, action.height), `${action.name} must meet the coarse 44px target floor`).toBeGreaterThanOrEqual(44);
  }
  const centreOwnership = await Promise.all(
    actionBoxes.map(async (action) => ({
      name: action.name,
      ownsCenter: await component.getByRole("button", { name: action.name, exact: true }).evaluate((button) => {
        const box = button.getBoundingClientRect();
        return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest("button") === button;
      }),
    })),
  );
  for (const { name, ownsCenter } of centreOwnership) {
    expect(ownsCenter, `${name} must own its painted centre`).toBe(true);
  }
  for (const box of boxes) {
    expect(box.x, `${box.name} must stay inside the composer left edge`).toBeGreaterThanOrEqual(bounds.x - 0.5);
    expect(box.x + box.width, `${box.name} must stay inside the composer right edge`).toBeLessThanOrEqual(bounds.x + bounds.width + 0.5);
    expect(box.y, `${box.name} must stay inside the composer top edge`).toBeGreaterThanOrEqual(bounds.y - 0.5);
    expect(box.y + box.height, `${box.name} must stay inside the composer bottom edge`).toBeLessThanOrEqual(bounds.y + bounds.height + 0.5);
    expect(box.x, `${box.name} must stay inside the viewport left edge`).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width, `${box.name} must stay inside the viewport right edge`).toBeLessThanOrEqual(viewportWidth + 0.5);
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (a === undefined || b === undefined) {
        throw new Error(`Missing overlap geometry at indexes ${String(left)} and ${String(right)}`);
      }
      expect(overlaps(a, b), `${a.name} must not overlap ${b.name}`).toBe(false);
    }
  }
  expectRowMajorOrder(boxes);

  const overflow = await composer.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth, "the composer must not scroll horizontally").toBeLessThanOrEqual(overflow.clientWidth);
  const documentOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentOverflow.scrollWidth, "composer actions must not widen the document").toBeLessThanOrEqual(documentOverflow.clientWidth);

  await expectExplicitCoarseRows(component);
}

test("#206: every icon control exposes plain-language names and tooltips on hover and focus", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": groupedComposerChat,
    "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }),
  });
  const component = await mount(<ComposerStory />);
  const expectedTooltips = [
    { name: "Chat options", tooltip: "Chat options" },
    { name: "Draft your line", tooltip: `Draft your line — ${ENGINE_OFF_REASON}` },
    { name: "Try another reply", tooltip: `Try another reply — ${ENGINE_OFF_REASON}` },
    { name: "Generate reply", tooltip: `Generate reply — ${ENGINE_OFF_REASON}` },
    { name: "Continue the reply", tooltip: `Continue the reply — ${ENGINE_OFF_REASON}` },
    { name: "Message tools", tooltip: "Message tools" },
    { name: "Send message", tooltip: ENGINE_OFF_REASON },
  ] as const;
  const composer = component.locator('[data-slot="composer"]');
  await expect(composer.getByRole("button")).toHaveCount(COMPOSER_ACTIONS.length);
  await expect(component.getByRole("button", { name: "Send message", exact: true })).toHaveAttribute("aria-disabled", "true");

  for (const { name, tooltip } of expectedTooltips) {
    // #869 — WCAG 2.5.3 Label in Name (§13.10 N2), MECHANICALLY, on every icon control in the composer.
    // These controls have no visible text but a tooltip, and a tooltip IS visible label text: a voice-control
    // user says what they can see. So a composer tooltip may only ever be (a) the accessible name verbatim, or
    // (b) the transient unavailability REASON, which N2 excludes explicitly (it rides `aria-describedby` and
    // is a description, not a label). Two controls used to spell a third thing — a friendlier twin of the
    // name ("Manage this chat" over "Chat options", "More message actions" over "Message tools") — and the
    // words on screen were then in no name at all.
    expect(tooltip === name || tooltip.includes(ENGINE_OFF_REASON), `${name}: its tooltip must BE its name, or the transient reason`).toBe(true);
    const control = component.getByRole("button", { name, exact: true });
    const popup = page.getByRole("tooltip", { name: tooltip, exact: true });
    await control.hover();
    await expect(popup, `${name} must explain itself on hover`).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(popup).toBeHidden();
    await control.focus();
    await expect(control, `${name} must accept focus in this reason-bearing state`).toBeFocused();
    await expect(popup, `${name} must explain itself on focus`).toBeVisible();
    await control.evaluate((element) => (element as HTMLElement).blur());
    await expect(popup).toBeHidden();
  }

  const names = await composer.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(names).not.toContain("Impersonate");
  expect(names).not.toContain("Swipe");
});

test("#206: each control has one truthful nearest owner, one Send, and desktop order/spacing", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": groupedComposerChat });
  const component = await mount(<ComposerStory />);

  await Promise.all(
    ["Your message", "Their reply", "Attach and send"].map(async (group) => {
      await expect(component.getByRole("group", { name: group, exact: true })).toHaveCount(1);
    }),
  );
  await expectNearestActionGroups(component, COMPOSER_ACTIONS);
  await expect(component.getByRole("group", { name: "Reply actions" })).toHaveCount(0);
  await expect(component.getByRole("group", { name: "Choose the next speaker" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Message tools", exact: true })).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Send message", exact: true })).toHaveCount(1);
  await expect(component.getByRole("button", { name: IMPERSONATE_STOP_LABEL, exact: true })).toHaveCount(0);

  const boxes = await controlBoxes(component, COMPOSER_ACTIONS);
  expectRowMajorOrder(boxes);
  const yoursLocator = component.getByRole("group", { name: "Your message", exact: true });
  const theirsLocator = component.getByRole("group", { name: "Their reply", exact: true });
  const attachLocator = component.getByRole("group", { name: "Attach and send", exact: true });
  const tryAnotherLocator = component.getByRole("button", { name: "Try another reply", exact: true });
  const generateLocator = component.getByRole("button", { name: "Generate reply", exact: true });
  await expect.poll(async () => yoursLocator.boundingBox()).not.toBeNull();
  await expect.poll(async () => theirsLocator.boundingBox()).not.toBeNull();
  await expect.poll(async () => attachLocator.boundingBox()).not.toBeNull();
  await expect.poll(async () => tryAnotherLocator.boundingBox()).not.toBeNull();
  await expect.poll(async () => generateLocator.boundingBox()).not.toBeNull();
  const yours = await yoursLocator.boundingBox();
  const theirs = await theirsLocator.boundingBox();
  const attach = await attachLocator.boundingBox();
  const tryAnother = await tryAnotherLocator.boundingBox();
  const generate = await generateLocator.boundingBox();
  const intraGroupGap = (generate?.x ?? 0) - ((tryAnother?.x ?? 0) + (tryAnother?.width ?? 0));
  const youToThemGap = (theirs?.x ?? 0) - ((yours?.x ?? 0) + (yours?.width ?? 0));
  const themToAttachGap = (attach?.x ?? 0) - ((theirs?.x ?? 0) + (theirs?.width ?? 0));
  expect(youToThemGap, "Your message and Their reply must be farther apart than controls within Their reply").toBeGreaterThan(intraGroupGap);
  expect(themToAttachGap, "Their reply and Attach and send must be farther apart than controls within Their reply").toBeGreaterThan(intraGroupGap);
});

test("#206: a disabled reply action remains focusable and exposes its reason", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": groupedComposerChat });
  const component = await mount(<ComposerStory />);
  const action = component.getByRole("button", { name: "Try another reply", exact: true });
  await expect(action).toHaveAttribute("aria-disabled", "true");
  await expect(action).not.toHaveAttribute("disabled", "");
  await action.focus();
  await expect(action).toBeFocused();
  await expect(page.getByRole("tooltip", { name: REPLY_ACTION_NEEDS_REPLY })).toBeVisible();
});

test.describe("#206 coarse touch layout", () => {
  test.use({ hasTouch: true });

  for (const viewport of [
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ] as const) {
    test(`${String(viewport.width)}px contains static actions and the live drafting Stop`, async ({ mount, page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": groupedComposerChat });
      const component = await mount(<ComposerStory />);
      const stop = component.getByRole("button", { name: IMPERSONATE_STOP_LABEL, exact: true });
      const textbox = component.getByRole("textbox", { name: "Message", exact: true });
      await expect(component.locator('[data-slot="composer"]')).toBeVisible();
      await expect(stop).toHaveCount(0);
      await expectCoarseComposerLayout(page, component, COMPOSER_ACTIONS);

      await routeImpersonateStream(page, [PARTIAL_DRAFT, "cloak dripping."], STREAM_RETRY_MS);
      await component.getByRole("button", { name: "Draft your line", exact: true }).click();
      await page.getByRole("menuitem", { name: "1st person", exact: true }).click();
      await expect(textbox).toHaveValue(PARTIAL_DRAFT);
      await expect(stop).toHaveCount(1);
      // The menu click leaves a synthetic pointer parked under the reflowing toolbar; reset it BEFORE the
      // layout read as well as before the click. Since #531 the bar re-packs by FIT rather than into fixed
      // rows, so the reflow can slide a different control under that stationary pointer — and the tooltip it
      // opens then owns that control's painted centre, which reads exactly like an overlap defect (measured
      // at 320px, where the live Stop widens `Your message` enough to change which home lands where).
      await page.mouse.move(0, 0);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await expectNearestActionGroups(component, LIVE_COMPOSER_ACTIONS);
      await expectCoarseComposerLayout(page, component, LIVE_COMPOSER_ACTIONS);

      await stop.click();
      await expect(stop).toHaveCount(0);
      await expect(textbox).toHaveValue(PARTIAL_DRAFT);
      await textbox.fill("");
      await expectCoarseComposerLayout(page, component, COMPOSER_ACTIONS);
    });
  }
});

const PAINT_TRANSITIONS = new Set(["all", "color", "background-color", "border-color", "outline-color"]);

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`#366 keyboard focus is immediate and paint-transition-free with ${reducedMotion} motion`, async ({ mount, page }) => {
    await page.emulateMedia({ reducedMotion });
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": groupedComposerChat });
    const component = await mount(<ComposerStory />);
    const textarea = component.getByRole("textbox", { name: "Message", exact: true });
    // The textarea is first in DOM order (#1382 tab-order fix), so Tab from Send no longer reaches it.
    // Focus the textarea directly — the test's purpose is verifying immediate focus-paint, not tab order.
    await textarea.focus();
    const readFocusedAtAssertion = async (): Promise<typeof focused> =>
      await textarea.evaluate((element) => {
        const carrier = element.closest('[data-slot="composer"]');
        if (carrier === null) {
          throw new Error("Composer carrier missing");
        }
        const transitions = (node: Element): readonly { readonly property: string; readonly durationMs: number }[] => {
          const style = getComputedStyle(node);
          const properties = style.transitionProperty.split(",").map((value) => value.trim());
          const durations = style.transitionDuration.split(",").map((value) => {
            const trimmed = value.trim();
            return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1000;
          });
          return properties.map((property, index) => ({ property, durationMs: durations[index % durations.length] ?? 0 }));
        };
        return {
          active: element.ownerDocument.activeElement === element,
          carrierShadow: getComputedStyle(carrier).boxShadow,
          carrierTransitions: transitions(carrier),
          textareaTransitions: transitions(element),
        };
      });
    const focused = await textarea.evaluate((element) => {
      const carrier = element.closest('[data-slot="composer"]');
      if (carrier === null) {
        throw new Error("Composer carrier missing");
      }
      const transitions = (node: Element): readonly { readonly property: string; readonly durationMs: number }[] => {
        const style = getComputedStyle(node);
        const properties = style.transitionProperty.split(",").map((value) => value.trim());
        const durations = style.transitionDuration.split(",").map((value) => {
          const trimmed = value.trim();
          return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1000;
        });
        return properties.map((property, index) => ({ property, durationMs: durations[index % durations.length] ?? 0 }));
      };
      return {
        active: element.ownerDocument.activeElement === element,
        carrierShadow: getComputedStyle(carrier).boxShadow,
        carrierTransitions: transitions(carrier),
        textareaTransitions: transitions(element),
      };
    });
    await expect.poll(async () => (await readFocusedAtAssertion()).active).toBe(true);
    expect(focused.carrierShadow, "the focus-within ring/glow must paint on the keyboard focus frame").not.toBe("none");
    for (const transition of [...focused.carrierTransitions, ...focused.textareaTransitions]) {
      const animatesPaint = transition.durationMs > 0 && PAINT_TRANSITIONS.has(transition.property);
      expect(animatesPaint, `${transition.property} must not animate keyboard-focus paint for ${String(transition.durationMs)}ms`).toBe(false);
    }
    const reducedTruth =
      reducedMotion !== "reduce" ||
      (JSON.stringify(focused.carrierTransitions) === JSON.stringify([{ property: "none", durationMs: 0 }]) &&
        JSON.stringify(focused.textareaTransitions) === JSON.stringify([{ property: "none", durationMs: 0 }]));
    expect(reducedTruth, "the reduced-motion floor removes every transition property").toBe(true);
  });
}

test("generate-image is gated on typed text, then fires chat.generateImage (mode free, the text as prompt)", async ({ mount, page }) => {
  let genBody: string | null = null;
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const isGen = req.method() === "POST" && new URL(req.url()).pathname.includes("chat.generateImage");
    if (!isGen) {
      await route.fallback();
      return;
    }
    genBody = req.postData();
    // Hold it in flight — the item drives the loading state; the posted message rides the bus.
    await new Promise<void>(() => undefined);
  });

  const component = await mount(<ComposerStory />);
  // Empty composer → the generate item is disabled (free mode needs a prompt).
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await expect(page.getByRole("menuitem", { name: "Generate image from text" })).toBeDisabled();
  // Close the menu (Escape) before typing — a MenuItem's disabled row can't be clicked; type, reopen.
  await page.keyboard.press("Escape");

  const textarea = component.getByLabel("Message", { exact: true });
  await textarea.fill("a neon city at dusk");
  await component.getByRole("button", UTILITY_TRIGGER).click();
  const generate = page.getByRole("menuitem", { name: "Generate image from text" });
  await expect(generate).toBeEnabled();
  await generate.click();

  await expect.poll(() => genBody, { intervals: [20, 50, 100] }).not.toBeNull();
  expect(genBody).toContain("a neon city at dusk");
  expect(genBody).toContain("free");
  expect(genBody).toContain(COMPOSER_CHAT_ID);
});

// ── item-1 (F-P1) data-loss: the prompt clears ONLY on a green settle, never fire-and-forget ────────────
test("a generate-image that FAILS keeps the typed prompt for retry (never cleared on failure)", async ({ mount, page }) => {
  // The regression this pins: the old fire-and-forget path called onChange("") unconditionally right after
  // firing, so a failed generate destroyed the user's typed prompt. Now the clear rides the mutation's
  // green settle (onSuccess) only.
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.generateImage": () => trpcError({ message: "gen boom" }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("a neon city at dusk");
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.getByRole("menuitem", { name: "Generate image from text" }).click();

  // The generate settles as a failure and the prompt is INTACT — the data-loss bug would have wiped it to "".
  await expect(textarea).toHaveValue("a neon city at dusk");
});

test("a generate-image that SUCCEEDS clears the typed prompt (clear-on-success)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.generateImage": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("a neon city at dusk");
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.getByRole("menuitem", { name: "Generate image from text" }).click();

  // On a green settle the composer clears (the prompt became the posted image message).
  await expect(textarea).toHaveValue("");
});

// ── #8 grey-out (side-eye P2): the disabled generate-image ITEM explains itself with a reason ────────────
// Now a ✨-menu item: a disabled Base UI MenuItem renders aria-disabled with its `title` reason (the
// base-ui-disabled-menuitem-title idiom — never a tooltip wrap). Pins the reason surfaces per phase.
const TYPE_TO_UNLOCK = /type a message/iu;

test("#8: the generate-image item (committed, empty) is disabled with a 'type a message' reason", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />); // committed by default, empty composer
  await component.getByRole("button", UTILITY_TRIGGER).click();
  const generate = page.getByRole("menuitem", { name: "Generate image from text" });
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAttribute("title", TYPE_TO_UNLOCK);
});

// ── #623 P1-IA: TWO image doors, and the safer one used to be invisible ────────────────────────────────
// `features/imagery/index.ts` SANCTIONS the split (the composer keeps its fast generate-from-text; /imagine
// is "the richer surface (mode + preview) BESIDE it, not a replacement"). The ruling stands; what was broken
// is that only the blind-spend door was findable — /imagine required knowing to type `/`, so a first-timer's
// default path spends with no mode, no preview and no stated price. The beside-door now sits beside it.
const IMAGINE_DOOR = { name: "Imagine — modes & preview…" };

test("#623: the ✨ menu's Imagine door is actionable when generate-from-text is NOT (it needs no prompt)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />); // committed, empty composer
  await component.getByRole("button", UTILITY_TRIGGER).click();

  // The contrast IS the finding: on an empty composer the fast door is a dead end and the safe door is not,
  // because an extraction mode reads the conversation instead of the draft.
  await expect(page.getByRole("menuitem", { name: "Generate image from text" })).toBeDisabled();
  await expect(page.getByRole("menuitem", IMAGINE_DOOR)).toBeEnabled();
});

test("#623: the fast door names its spend on hover instead of firing one silently", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("a neon city at dusk");
  await component.getByRole("button", UTILITY_TRIGGER).click();

  // An ENABLED row's `title` is the REGENERATE_PLAIN_HELPER idiom (a helper, not a disabled reason).
  await expect(page.getByRole("menuitem", { name: "Generate image from text" })).toHaveAttribute("title", SPENDS_RIGHT_AWAY);
});

test("#623: the Imagine door opens the /imagine surface seeded with whatever is typed", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("a neon city at dusk");
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.getByRole("menuitem", IMAGINE_DOOR).click();

  // The story has no ModalHost, so the imagery INTENT store is the observable — the same `openImagine` seed
  // the `/imagine` slash runner writes and the shell's imagine modal reads. Free mode: nothing is spent yet.
  await expect(component.getByTestId("composer-imagine-seed")).toHaveText("free|a neon city at dusk");
});

test("wand v2: Attach images & video lives in the ✨ menu (media controls re-homed off the bar)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", UTILITY_TRIGGER).click();
  // The attach row is present in the menu (the sanctioned FileDropzone picker), off the composer bar.
  await expect(page.getByRole("menuitem", { name: "Attach images & video" })).toBeVisible();
});

// P1-C: the file input is NOT a focus target inside the menuitem's accessible name. Exactly one control
// carries the "Attach images & video…" name (the menuitem), and its name is the single clean size-hinted
// string — the doubled name + second focus target are gone.
test("P1-C: Attach media is a SINGLE accessible control (input is aria-hidden, off the accessible name)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", UTILITY_TRIGGER).click();

  // One clean accessible name (a size-hinted "Attach images & video, up to N MB per file"); no doubled name.
  const attach = page.getByRole("menuitem", { name: ATTACH_NAME });
  await expect(attach).toHaveCount(1);
  // The real <input type=file> exists for the upload path but is OFF the accessible tree (aria-hidden,
  // tabIndex -1) — it is not a second focusable control announced under the menuitem.
  const input = page.locator('[data-slot="file-dropzone-input"]');
  await expect(input).toHaveAttribute("aria-hidden", "true");
  await expect(input).toHaveAttribute("tabindex", "-1");
  // #317: the picker admits the two magic-verified video containers alongside every image family.
  await expect(input).toHaveAttribute("accept", "image/*,video/mp4,video/webm");
});

test("the guided cluster shows all four icons on an empty committed composer; Response is always live (wand v2)", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // empty composer, committed handle
  // The four dual-mode icons ALWAYS render on the top row. Response is never disabled — an empty committed
  // composer fires a plain generate reply. The ⟳ icon offers another reply (Regenerate moved to the ✨ menu).
  await expect(component.getByRole("button", { name: "Generate reply" })).toBeEnabled();
  await expect(component.getByRole("button", { name: "Draft your line" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Try another reply" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("committed handle: Send fires chat.send; the draft is NOT cleared until the commit signal, then clears", async ({ mount, page }) => {
  // Hold chat.send so its clear-on-commit listener stays alive (the send promise stays open for the
  // whole turn in production; the commit signal arrives MID-flight). Registered BEFORE routeTrpc so it
  // runs FIRST (Playwright routes are LIFO); it captures the send body then holds (never falls through
  // to routeTrpc, so we read the captured body directly rather than routeTrpc's counter).
  let sendBody: string | null = null;
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const isSend = req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send");
    if (!isSend) {
      await route.fallback();
      return;
    }
    sendBody = req.postData();
    // Never fulfilled — the send stays in flight; the draft-clear must ride the commit signal, not the
    // mutation settling.
    await new Promise<void>(() => undefined);
  });

  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("Hello there");
  await component.getByRole("button", { name: "Send message" }).click();

  // The send fired with the typed content (read off the intercepted request body)...
  await expect.poll(() => sendBody, { intervals: [20, 50, 100] }).not.toBeNull();
  expect(sendBody).toContain("Hello there");
  expect(sendBody).toContain(COMPOSER_CHAT_ID);
  // ...but the draft is STILL there — no optimistic clear (this is the whole point of clear-on-commit).
  await expect(textarea).toHaveValue("Hello there");

  // The bus confirms the user's own row committed → the composer clears.
  await component.getByTestId("drive-message-committed").click();
  await expect(textarea).toHaveValue("");
});

test("Stop shows 'stopping' immediately on click and fires chat.abort; the button stays in the Stop family (never reverts to Send) until turnAborted lands", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.abort": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByTestId("drive-begin").click();
  await component.getByTestId("drive-delta").click();
  await expect(component.getByRole("button", { name: "Stop generating" })).toBeVisible();

  await component.getByRole("button", { name: "Stop generating" }).click();

  // Immediate feedback — no network wait needed for the label to flip (markStopping is client-only).
  await expect(component.getByRole("button", { name: "Stopping…" })).toBeVisible();
  await expect.poll(() => trpc.count("chat.abort"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.abort")).toMatchObject({ chatId: COMPOSER_CHAT_ID });

  // The slot has NOT closed optimistically — Send never reappears on its own.
  await expect(component.getByRole("button", { name: "Send message" })).toHaveCount(0);

  // Only the bus's turnAborted (simulated here via the driver) closes the slot.
  await component.getByTestId("drive-abort").click();
  await expect(component.getByRole("button", { name: "Send message" })).toBeVisible();
});

test("a second Stop click while already stopping does not fire a second chat.abort", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.abort": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByTestId("drive-begin").click();
  await component.getByTestId("drive-delta").click();
  await component.getByRole("button", { name: "Stop generating" }).click();
  await expect(component.getByRole("button", { name: "Stopping…" })).toBeVisible();

  // The button is disabled while stopping (canStop is false once the phase leaves pending/streaming) —
  // a forced click still must not re-fire the mutation.
  await component.getByRole("button", { name: "Stopping…" }).click({ force: true });

  await expect.poll(() => trpc.count("chat.abort"), { intervals: [20, 50, 100] }).toBe(1);
});

test("a rejected chat.abort recovers the still-live turn from stopping so Stop can be retried", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.abort": () => trpcError({ message: "abort failed" }) });
  const component = await mount(<ComposerStory />);

  await component.getByTestId("drive-begin").click();
  await component.getByTestId("drive-delta").click();
  await component.getByRole("button", { name: "Stop generating" }).click();

  // Settled rendered arm: after the mutation rejects, the live stream is actionable again rather than
  // marooned forever in the disabled `stopping` phase.
  await expect(component.getByRole("button", { name: "Stop generating" })).toBeEnabled();
});

test("a send that FAILS keeps the draft for retry (never cleared — no commit signal ever fires)", async ({ mount, page }) => {
  // `chat.send` rejects and NO commit signal is ever driven → clear-on-commit never fires → the draft
  // survives. This is the race-free replacement for the old phase-gated restore: nothing was cleared, so
  // nothing needs restoring.
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.send": () => trpcError({ message: "boom" }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("Don't lose me");
  await component.getByRole("button", { name: "Send message" }).click();

  // The send settles as a failure (Send is clickable again, not stuck pending) and the text is intact.
  await expect(component.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(textarea).toHaveValue("Don't lose me");
});

test("the draft stays cleared after a POST-commit send failure (commit signal fired ⇒ no restore)", async ({ mount, page }) => {
  // Hold chat.send so the commit signal can be driven (draft clears) BEFORE the send rejects. The
  // failure must NOT resurrect the already-committed-and-cleared text (the old restore bug this design
  // removes). Registered BEFORE routeTrpc (LIFO); intercepts only chat.send.
  let releaseSend: (() => void) | undefined;
  const sendHeld = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const isSend = req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send");
    if (!isSend) {
      await route.fallback();
      return;
    }
    await sendHeld;
    await route.fulfill({
      json: [{ error: { code: -32_603, message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } } }],
    });
  });

  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("Already committed");
  await component.getByRole("button", { name: "Send message" }).click();
  // The user's row commits (signal) → the composer clears — while the send is still in flight.
  await component.getByTestId("drive-message-committed").click();
  await expect(textarea).toHaveValue("");

  // Now the send rejects (a post-commit generation failure). The cleared draft must STAY cleared — no
  // restore. Wait for the mutation to settle (its busy state clears) before the final draft assertion;
  // Send itself stays DISABLED because the draft is now empty (`!canSubmitText`), which is correct.
  releaseSend?.();
  await expect(component.getByRole("button", { name: "Send message" })).not.toHaveAttribute("aria-busy", "true");
  await expect(textarea).toHaveValue("");
});

// ── #67 composer attach ──────────────────────────────────────────────────────────────────────────────
const DROPZONE_INPUT = '[data-slot="file-dropzone-input"]';
const ATTACHMENT_PREVIEW = '[data-slot="composer-attachment"]';
const REMOVE_BTN = /Remove/u;
const PNG_1PX_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_1PX = Buffer.from(PNG_1PX_BASE64, "base64");
// A valid `asset_…` TypeID the upload stub returns (the client re-parses `storedAssetSchema`, which
// validates the prefix + base32 suffix — a bogus string would throw at the boundary).

const STUB_ASSET_ID = "asset_01h455vb4pex5vsknk084sn02q";
// …and a 64-char hex CAS hash, because `storedAssetSchema.hash` is `z.string().length(CAS_HASH_HEX_LENGTH)`
// (`contracts/assets/index.ts:78,89`, landed in b588b9d0a with the #1359-#1380 validation floors) and
// `data/upload-asset.ts:31` PARSES the upload response against it. The stubs here used to answer a 6-char
// `"cthash"`, so the parse threw at the boundary, the attachment never resolved and `chat.send` never fired
// — three composer tests red on main with an error that named none of that (#1589). The contract moved
// under the fixture; the composer itself never regressed.
const STUB_ASSET_HASH = "9f2c4b1e".repeat(8);

test("sending with an attachment uploads it to CAS and includes the asset id on chat.send", async ({ mount, page }) => {
  // Stub the raw multipart upload route (not tRPC) → returns a StoredAsset.
  let uploadCalled = 0;
  await page.route("**/api/assets/upload", async (route) => {
    uploadCalled += 1;
    await route.fulfill({
      json: { assetId: STUB_ASSET_ID, hash: STUB_ASSET_HASH, size: PNG_1PX.length, created: true },
    });
  });
  // Hold chat.send so we can read its captured body (registered BEFORE routeTrpc — LIFO).
  let sendBody: string | null = null;
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const isSend = req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send");
    if (!isSend) {
      await route.fallback();
      return;
    }
    sendBody = req.postData();
    await new Promise<void>(() => undefined); // held in flight
  });

  const component = await mount(<ComposerStory />);
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG_1PX });
  // Close the ✨ menu before clicking Send (its inert backdrop would otherwise intercept the click).
  await page.keyboard.press("Escape");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => uploadCalled, { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => sendBody, { intervals: [20, 50, 100] }).not.toBeNull();
  expect(sendBody).toContain(STUB_ASSET_ID);
  expect(sendBody).toContain(COMPOSER_CHAT_ID);
});

// #317: a picked VIDEO renders the muted first-frame/loop preview arm (BackgroundVideo — never a broken
// <img> over a video object-URL) and rides the send exactly like an image: upload → attachmentAssetIds.
test("attaching a video shows the video preview arm and rides the send as an attachment asset", async ({ mount, page }) => {
  let uploadCalled = 0;
  await page.route("**/api/assets/upload", async (route) => {
    uploadCalled += 1;
    await route.fulfill({
      json: { assetId: STUB_ASSET_ID, hash: STUB_ASSET_HASH, size: 4, created: true },
    });
  });
  let sendBody: string | null = null;
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const isSend = req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send");
    if (!isSend) {
      await route.fallback();
      return;
    }
    sendBody = req.postData();
    await new Promise<void>(() => undefined); // held in flight
  });

  const component = await mount(<ComposerStory />);
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from([0, 0, 0, 1]) });
  // The pending strip shows the VIDEO arm (BackgroundVideo's slot), not the image crossfader.
  const preview = page.locator(ATTACHMENT_PREVIEW);
  await expect(preview).toHaveCount(1);
  await expect(preview.locator('[data-slot="background-video"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => uploadCalled, { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => sendBody, { intervals: [20, 50, 100] }).not.toBeNull();
  expect(sendBody).toContain(STUB_ASSET_ID);
});

test("the wand is disabled while a Send is in flight (clear-on-commit reopened the pre-commit window)", async ({ mount, page }) => {
  // Removing the optimistic clear left the draft populated during a send's pre-commit window; without a
  // gate the wand could fire a guided action against it (its own user-role messageCommitted could even
  // satisfy the send's clear correlation → a double-action). `busy={sendMessage.isPending}` closes it.
  // Hold chat.send so isPending stays true for the assertion.
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const isSend = req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send");
    if (!isSend) {
      await route.fallback();
      return;
    }
    await new Promise<void>(() => undefined); // held — the send never settles
  });

  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });
  // P3-dualmode: with text present the Response icon's accessible name is its guided-mode name.
  const response = component.getByRole("button", { name: "Guided generate reply" });

  // With a draft typed and no send in flight, the guided cluster is available.
  await textarea.fill("steer it");
  await expect(response).toBeEnabled();

  // Fire Send — it stays in flight (held) → the cluster idles (busy={sendMessage.isPending}) even though
  // the draft is still populated, so a guided icon can't fire against the pre-commit draft.
  await component.getByRole("button", { name: "Send message" }).click();
  await expect(response).toBeDisabled();
});

// ── PD-146: enterSends ─────────────────────────────────────────────────────────────────────────────────
test("enterSends OFF: Enter inserts a newline (no send); ⌘/Ctrl+Enter sends", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "settings.getUserSettings": () => settingsWith({ enterSends: false }),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });
  await textarea.fill("no send on enter");
  // The pref read is async (a plain query) — wait until it has actually landed as `false` before asserting
  // the negative, so this can't pass merely because the read hadn't resolved yet.
  await expect.poll(() => trpc.count("settings.getUserSettings"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);

  await textarea.press("Enter");
  // No send fired — plain Enter is a newline with the pref off.
  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(0);

  // ⌘/Ctrl+Enter still sends.
  await textarea.press("ControlOrMeta+Enter");
  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
});

// ── #1871 item 6: composer soft-keyboard hygiene (owner ruling 2026-09-19) ─────────────────────────────
// The three attributes are asserted on the RENDERED textarea rather than on a prop, because nothing
// upstream sets them: `@orb/ui`'s Textarea renders a plain <textarea> through Base UI `Field.Control`, and
// in @base-ui/react 1.7.0 only OTPFieldInput / AriaCombobox / NumberFieldInput carry input-hygiene
// attributes — the field/ tree carries none. `enterKeyHint` is the LIVE `enterSends` value, so both arms
// are pinned: one arm alone passes just as well against a hardcoded string, which is the defect shape.
for (const [enterSends, hint] of [
  [true, "send"],
  [false, "enter"],
] as const) {
  test(`enterSends ${String(enterSends)}: the composer's enterKeyHint is "${hint}", with autocorrect/autocapitalise off`, async ({ mount, page }) => {
    const trpc = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "settings.getUserSettings": () => settingsWith({ enterSends }),
    });
    const component = await mount(<ComposerStory />);
    const textarea = component.getByLabel("Message", { exact: true });
    // Settle on the pref READ before reading the hint — the pre-read render carries the default arm, and
    // asserting through it would make one of these two tests pass for the wrong reason.
    await expect.poll(() => trpc.count("settings.getUserSettings"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);

    await expect(textarea).toHaveAttribute("enterkeyhint", hint);
    await expect(textarea).toHaveAttribute("autocorrect", "off");
    await expect(textarea).toHaveAttribute("autocapitalize", "off");
  });
}

// ── PD-146: continue-on-empty (continueOnSend) ───────────────────────────────────────────────────────────
test("continueOnSend: an empty Send on an assistant tail fires chat.continueTurn on that message", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "settings.getUserSettings": () => settingsWith({ continueOnSend: true }),
    "chat.continueTurn": () => ({ ok: true }),
  });
  // Committed chat, assistant tail → Send becomes the continue affordance (empty composer).
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect.poll(() => trpc.count("chat.continueTurn"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.continueTurn")).toMatchObject({ chatId: COMPOSER_CHAT_ID, messageId: TAIL_ASSISTANT_ID });
});

// ── W-E: generate-on-empty-send (generateOnEmptySend) ──────────────────────────────────────────────────
test("generateOnEmptySend: an empty Send on a USER tail fires chat.generate (the fork-at-user-tail arm)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "settings.getUserSettings": () => settingsWith({ generateOnEmptySend: true }),
    "chat.generate": () => ({ ok: true }),
  });
  // Committed chat, USER tail, empty composer → Send prompts a reply (no assistant tail to continue).
  const component = await mount(<ComposerStory tailRole="user" />);
  await expect.poll(() => trpc.count("settings.getUserSettings"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.generate")).toMatchObject({ chatId: COMPOSER_CHAT_ID });
});

test("generateOnEmptySend OFF: an empty Send on a USER tail is a no-op (Send disabled, no generate)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "settings.getUserSettings": () => settingsWith({ generateOnEmptySend: false, continueOnSend: false }),
    "chat.generate": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory tailRole="user" />);
  await expect.poll(() => trpc.count("settings.getUserSettings"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  // Nothing to send/continue/generate → Send stays disabled; the ▷ Response icon remains the explicit path.
  await expect(component.getByRole("button", { name: "Send message" })).toBeDisabled();
  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(0);
});

// The attach control lives inside the ✨ menu (wand v2) — open it, then set files on the portalled dropzone
// input (the FileDropzone's `closeOnClick={false}` keeps the menu open through the OS picker).
test("picking an image shows a removable preview and makes an attachment-only message sendable", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG_1PX });

  // The pending preview appears and a text-less message is now sendable on its attachment alone.
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Send message" })).toBeEnabled();

  // Close the ✨ menu (it stayed open through the picker) before touching the preview strip below it.
  await page.keyboard.press("Escape");
  // Remove-before-send drops the preview.
  await component.getByRole("button", { name: REMOVE_BTN }).click();
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(0);
});

// ── #376 drag-drop + clipboard paste attach ──────────────────────────────────────────────────────────
// Two NEW entry points into the one attach seam (the picker above is the third). The gestures are driven
// with real constructed DataTransfer/ClipboardEvent objects rather than a CDP drag, because a CT has no
// OS-level drag source — what matters is that the composer's handlers read `dataTransfer.files` /
// `clipboardData.files` and that the refusals are honest. The picker's `accept` attribute filters only the
// OS dialog, so these two paths are the ones that need the type gate made explicit.
const COMPOSER_SURFACE = '[data-slot="composer"]';
const DROP_AFFORDANCE = '[data-slot="composer-drop-affordance"]';
const NOTIFIED = '[data-testid="composer-notified"]';

interface DropSpec {
  readonly name: string;
  readonly type: string;
  readonly bytes: number;
}

/** Dispatches a file drag sequence at the composer surface; `stages` picks how far the gesture gets. */
async function dragFiles(component: Locator, specs: readonly DropSpec[], stages: readonly string[]): Promise<void> {
  await component.locator(COMPOSER_SURFACE).evaluate(
    (el, args) => {
      const transfer = new DataTransfer();
      for (const spec of args.specs) {
        transfer.items.add(new File([new Uint8Array(spec.bytes)], spec.name, { type: spec.type }));
      }
      for (const stage of args.stages) {
        el.dispatchEvent(new DragEvent(stage, { dataTransfer: transfer, bubbles: true, cancelable: true }));
      }
    },
    { specs, stages },
  );
}

test("#376 drag: a FILE drag over the composer arms the surface and names what it will take", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await expect(component.locator(DROP_AFFORDANCE)).toHaveCount(0);
  await dragFiles(component, [{ name: "cat.png", type: "image/png", bytes: 4 }], ["dragenter", "dragover"]);

  // The affordance is an EMPTY STATE: it must name both accepted classes, not merely glow.
  await expect(component.locator(DROP_AFFORDANCE)).toBeVisible();
  await expect(component.locator(DROP_AFFORDANCE)).toContainText("Drop images or video to attach");
  await expect(component.locator(COMPOSER_SURFACE)).toHaveAttribute("data-drag-over", "");
  // done ≠ rendered: a visible-and-non-empty assertion still passes on a 0-height box. The affordance is a
  // padded band spanning the composer's own width — assert against the SURFACE, never a hardcoded px.
  const affordanceBox = await component.locator(DROP_AFFORDANCE).boundingBox();
  const surfaceBox = await component.locator(COMPOSER_SURFACE).boundingBox();
  expect(affordanceBox?.height ?? 0).toBeGreaterThan(0);
  expect(affordanceBox?.width ?? 0).toBeGreaterThan((surfaceBox?.width ?? 0) / 2);

  // Leaving the surface disarms it (the depth counter reaching zero, not the first descendant leave).
  await dragFiles(component, [{ name: "cat.png", type: "image/png", bytes: 4 }], ["dragleave"]);
  await expect(component.locator(DROP_AFFORDANCE)).toHaveCount(0);
});

test("#376 drag: a TEXT drag never claims the composer (native text-drop into the textarea survives)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await component.locator(COMPOSER_SURFACE).evaluate((el) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "dragged prose");
    el.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });

  await expect(component.locator(DROP_AFFORDANCE)).toHaveCount(0);
  await expect(component.locator(COMPOSER_SURFACE)).not.toHaveAttribute("data-drag-over", "");
});

test("#376 drop: dropping an image attaches it and it rides the send as an attachment asset", async ({ mount, page }) => {
  let uploadCalled = 0;
  await page.route("**/api/assets/upload", async (route) => {
    uploadCalled += 1;
    await route.fulfill({ json: { assetId: STUB_ASSET_ID, hash: STUB_ASSET_HASH, size: PNG_1PX.length, created: true } });
  });
  let sendBody: string | null = null;
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    if (!(req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send"))) {
      await route.fallback();
      return;
    }
    sendBody = req.postData();
    await new Promise<void>(() => undefined); // held in flight
  });

  const component = await mount(<ComposerStory />);
  await dragFiles(component, [{ name: "cat.png", type: "image/png", bytes: PNG_1PX.length }], ["dragenter", "dragover", "drop"]);

  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(1);
  // The affordance retires the moment the drop lands — it describes an in-progress gesture, not a state.
  await expect(component.locator(DROP_AFFORDANCE)).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Send message" })).toBeEnabled();

  await component.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => uploadCalled, { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => sendBody, { intervals: [20, 50, 100] }).not.toBeNull();
  expect(sendBody).toContain(STUB_ASSET_ID);
});

test("#376 drop: dropping an mp4 attaches it with the VIDEO preview arm (never a broken <img>)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await dragFiles(component, [{ name: "clip.mp4", type: "video/mp4", bytes: 8 }], ["dragenter", "dragover", "drop"]);

  const preview = component.locator(ATTACHMENT_PREVIEW);
  await expect(preview).toHaveCount(1);
  await expect(preview.locator('[data-slot="background-video"]')).toBeVisible();
});

test("#376 drop: an unsupported type is refused BY NAME and nothing of it attaches (no silent drop)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await dragFiles(
    component,
    [
      { name: "resume.pdf", type: "application/pdf", bytes: 16 },
      { name: "cat.png", type: "image/png", bytes: 4 },
    ],
    ["dragenter", "dragover", "drop"],
  );

  // The GOOD file in the same batch still lands — a mixed drop is not all-or-nothing.
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(1);
  // …and the refused one earns a named, actionable warn (the story's notify sink renders the last title).
  await expect(component.locator(NOTIFIED)).toContainText("resume.pdf");
  await expect(component.locator(NOTIFIED)).toContainText("isn't an image or video");
});

// #423: the dropzone now refuses an off-vocabulary file itself, so the picker's refusal arrives as a
// `reason: "type"` rejection instead of reaching `triageAttachFiles`. The composer's adapter has to speak the
// SAME line the drop/paste gestures do — its inline error renders `hidden` inside the ✨ menu, so a rejection
// the adapter doesn't toast is a silent vanish.
test("#423 picker: an off-vocabulary pick is refused in the same voice as a drop (never silently)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });

  await expect(component.locator(NOTIFIED)).toContainText("resume.pdf");
  await expect(component.locator(NOTIFIED)).toContainText("isn't an image or video");
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(0);
});

test("#376 paste: pasting a screenshot attaches it", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).evaluate((el) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(4)], "screenshot.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });

  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(1);
});

test("#376 paste: a clipboard carrying BOTH text and an image attaches the image without eating the text paste", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<ComposerStory />);

  // The handler must not preventDefault, or the browser never inserts the text half. A synthetic paste has
  // no default ACTION to observe, so the proof is the flag the browser would have acted on.
  const defaultSurvived = await component.getByLabel("Message", { exact: true }).evaluate((el) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(4)], "screenshot.png", { type: "image/png" }));
    transfer.setData("text/plain", "and some prose");
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return !event.defaultPrevented;
  });

  // @orb-waive ct-no-oneshot-live-read-assert(expect): dispatching the paste twice would mutate the composer twice; this asserts the one event's synchronous cancellation result.
  expect(defaultSurvived).toBe(true);
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(1);
});

// ── #531 THE MOBILE COMPOSER'S CHROME TAX: the action bar spends rows it does not need ──────────────
// The composer is the larger half of the phone chrome tax (#511 fixed the cast half). The defect was NOT a
// wrap: below the `@md` container step the action bar's recipe was an unconditional 2×2 grid (plus a hand-
// placed `@max-xs` THIRD row), so it spent a whole 48px control row + a 24px section gap at EVERY phone
// width — including widths where all four action homes provably fit on one line. Measured on the phone stage
// before the fix: 196px at 430 · 199px at 390 · 271px at 320, with the homes on 2 · 2 · 3 rows.
//
// The law these pin is a RANGE property, not three point measurements: the bar takes ONE row wherever its
// four homes fit and a second only when they do not — so the expected row count is DERIVED from the measured
// homes, not restated as a pixel budget, and it stays honest when a home gains or loses a control.
//
// THE PACKING GAP IS THE HOMES' OWN `field` GAP, NEVER THE BAR'S RESOLVED `column-gap`. Reading the bar's own
// gap makes the pin self-fulfilling: the old bar spaced its homes at `section` (24px), which by its own
// arithmetic "could not" fit four homes in a 430px phone's 392px card — so a gap-derived pin rated the
// two-row render CORRECT and went green on the defect (measured: it did). The homes are already spaced at
// `field` INSIDE themselves, so `field` is the bar's own floor for what "fits" means, and packing against it
// is what makes this red on the old source at 430 (372px of homes in a 392px card, rendered as two rows).
const PHONE_ROOM_STUB = {
  ...CHAT_AMBIENT_ROUTES,
  ...CHAT_ROOM_ROUTES,
  "chat.getChat": (): unknown => ({ title: "Council", participants: [], viewerIsHost: true, anchorPersonaId: null, identities: [] }),
};

/** One settled read of the action bar: the four homes' geometry, the resolved gap, and the touch floor. */
function measureActionBar(page: Page): Promise<{
  readonly coarse: boolean;
  readonly barWidth: number;
  readonly homeInnerGap: number;
  readonly rows: number;
  readonly homeWidths: readonly number[];
  readonly controlHeights: readonly number[];
  readonly barRight: number;
  readonly lastRowRight: number;
}> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-testid="composer"] [data-slot="composer-guided-cluster"]');
    const homes = [...(bar?.querySelectorAll<HTMLElement>('[role="group"]') ?? [])];
    const firstHome = homes[0];
    if (bar === null || firstHome === undefined) {
      throw new Error("the composer action bar did not render");
    }
    const tops = homes.map((el) => Math.round(el.getBoundingClientRect().top));
    const lastTop = Math.max(...tops);
    const lastRow = homes.filter((_, index) => tops[index] === lastTop);
    return {
      coarse: matchMedia("(pointer: coarse)").matches,
      barWidth: Math.round(bar.getBoundingClientRect().width),
      // The `field` gap the homes already use BETWEEN their own controls — the bar's own floor for "fits".
      homeInnerGap: Math.round(Number.parseFloat(getComputedStyle(firstHome).columnGap)),
      rows: new Set(tops).size,
      homeWidths: homes.map((el) => Math.round(el.getBoundingClientRect().width)),
      // Every focusable control in the bar — the row saving must not have been bought by crushing targets.
      controlHeights: [...bar.querySelectorAll("button")].map((el) => Math.round(el.getBoundingClientRect().height)),
      barRight: Math.round(bar.getBoundingClientRect().right),
      lastRowRight: Math.round(Math.max(...lastRow.map((el) => el.getBoundingClientRect().right))),
    };
  });
}

/** The coarse-pointer touch floor the bar's icon controls are sized to (`h-control-*`, pointer-conditional). */
const COARSE_TOUCH_FLOOR = 44;
/** The four ordered action homes, by their announced group names — the bar's whole content. */
const ACTION_HOMES = ["Chat actions", "Your message", "Their reply", "Attach and send"] as const;

for (const width of [430, 390, 320]) {
  test.describe(`#531 phone composer at ${width}px`, () => {
    test.use({ viewport: { width, height: 932 }, hasTouch: true });

    test(`the action bar takes ONE row while its homes fit, never a breakpoint's extra row (${width}px)`, async ({ mount, page }) => {
      await routeTrpc(page, PHONE_ROOM_STUB);
      const room = await mount(<ChatRoomPhoneStory paneHeight={822} />);
      // Barrier on the SETTLED bar: all four homes plus the terminal Send painted. Reading geometry before
      // this is reading a bar that is still assembling.
      await Promise.all(
        ACTION_HOMES.map(async (home) => {
          await expect(room.getByRole("group", { name: home, exact: true })).toBeVisible();
        }),
      );
      await expect(room.getByRole("button", { name: "Send message" })).toBeVisible();
      // The pointer class is the arm's condition — a fine-pointer layout no phone produces would size the
      // controls differently and make every number below meaningless.
      // Settled snapshot: a media-query match on a CONTEXT flag fixed before the page opened (`hasTouch`), so
      // nothing async can change it (the #511 cast-strip suite reads it the same way).
      await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const bar = await measureActionBar(page);
      // No row was bought by shrinking a target below the coarse floor.
      for (const height of bar.controlHeights) {
        expect(height).toBeGreaterThanOrEqual(COARSE_TOUCH_FLOOR);
      }
      // THE RANGE PROPERTY: rows are driven by FIT, so the expected count is derived, not asserted.
      const needed = bar.homeWidths.reduce((sum, w) => sum + w, 0) + bar.homeInnerGap * (bar.homeWidths.length - 1);
      const expectedRows = needed <= bar.barWidth ? 1 : 2;
      expect(bar.rows, `homes need ${needed}px of a ${bar.barWidth}px bar at ${width}px, yet rendered ${bar.rows} rows`).toBe(expectedRows);
      // …and a wrapped line still ENDS at the bar's right edge, so the terminal Send home never falls back to
      // the left gutter on the second row (the old grid parked it in an explicit right-hand column, and a
      // plain `flex-wrap` without the auto margins would have left it hard left).
      expect(bar.lastRowRight).toBe(bar.barRight);
    });
  });
}

// THE WIDE ARM IS UNCHANGED: at a desktop container the bar is still the explicit four-track grid — one row,
// the two later homes pushed right by the `1fr` spacer. The narrow arm's flex-wrap must not reach it.
test.describe("#531 the desktop composer keeps its four-track row", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("at a wide container the four action homes hold one grid row", async ({ mount, page }) => {
    await routeTrpc(page, PHONE_ROOM_STUB);
    const room = await mount(<ChatRoomPhoneStory paneHeight={822} />);
    await expect(room.getByRole("group", { name: "Attach and send", exact: true })).toBeVisible();
    // Settled snapshot: the same context-fixed media match as the coarse arms — no `hasTouch`, decided before the
    // page opened, and it is the discriminator for this whole describe.
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);

    const bar = await measureActionBar(page);
    expect(bar.rows).toBe(1);
    const readTemplateAtAssertion = async (): Promise<typeof template> =>
      await page.locator('[data-slot="composer-guided-cluster"]').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    const template = await page.locator('[data-slot="composer-guided-cluster"]').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    await expect.poll(async () => (await readTemplateAtAssertion()).split(" ").filter(Boolean).length).toBe(4);
  });
});

// ── #539 ONE SPEAK-AS DOOR, AND THE GROUP PHONE BAR IT PAID FOR ────────────────────────────────────────
// The #531 arms above stub an EMPTY roster, so they never met the control this pins: a standalone
// `Speak as a character` dropdown that rendered only at cast > 1, in the same `Their reply` home as Response
// and ~150px from it, offering the identical "Auto + one row per character" and firing the identical
// `chat.generate` + `speakerCharacterId` — minus the typed steer and the `afterAssistant` nudge the Response
// submenu carries. Retired as a duplicate action door (#520/#532 class).
//
// The geometry is the receipt, measured on this exact story before the retirement: at 430px the group bar's
// homes were 48+48+210+102 = 408px + 3 field gaps against a 392px bar, so a GROUP room paid a whole second
// 48px control row that a solo room did not. Dropping the fifth control takes `Their reply` to 150px and the
// homes to 348px + gaps — under the bar, one row. So this asserts BOTH halves: exactly one door in the home,
// and the row count the removal bought.
const GROUP_PHONE_STUB = {
  ...CHAT_AMBIENT_ROUTES,
  ...CHAT_ROOM_ROUTES,
  "chat.getChat": (): unknown => ({
    title: "Council",
    viewerIsHost: true,
    anchorPersonaId: null,
    identities: [],
    participants: [composerCharacter("aria", "Aria"), composerCharacter("bryn", "Bryn")],
  }),
};

test.describe("#539 the group-room phone composer", () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true });

  test("Their reply hosts ONE speaker door, and the group bar holds a single row", async ({ mount, page }) => {
    await routeTrpc(page, GROUP_PHONE_STUB);
    const room = await mount(<ChatRoomPhoneStory paneHeight={822} />);
    const them = room.getByRole("group", { name: "Their reply", exact: true });
    // SETTLED barrier: the roster query has landed and the home has painted its final control set — reading
    // geometry or counting controls before this reads a bar that is still assembling.
    await expect(them).toBeVisible();
    await expect(room.getByRole("button", { name: "Send message" })).toBeVisible();
    await expect(them.getByRole("button")).toHaveCount(3);
    // The retired door by NAME, so a re-introduction anywhere in the composer reds here rather than only
    // shifting a pixel count.
    await expect(room.getByRole("button", { name: "Speak as a character" })).toHaveCount(0);
    // …and the one that survived still opens the speaker choice in this room.
    await room.getByRole("button", { name: "Generate reply", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Bryn" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    const bar = await measureActionBar(page);
    for (const height of bar.controlHeights) {
      expect(height).toBeGreaterThanOrEqual(COARSE_TOUCH_FLOOR);
    }
    const needed = bar.homeWidths.reduce((sum, w) => sum + w, 0) + bar.homeInnerGap * (bar.homeWidths.length - 1);
    expect(needed, `a group room's four homes must fit a ${String(bar.barWidth)}px phone bar`).toBeLessThanOrEqual(bar.barWidth);
    expect(bar.rows, "a group room must not buy a second action row for a duplicate door").toBe(1);
  });
});
