// CT: the composer's GUIDED CLUSTER (W-D — replaces composer-wand.ct). Drives the PRODUCTION path through
// the real `<Composer>` (the ComposerStory precedent): routeTrpc stubs the network, the cluster fires the
// real `useGuidedActions` / `useComposerUtilities` mutations. Proves: the four dual-mode icons ALWAYS render
// (never hidden/swapped); Response fires generate (committed) / startChat (draft), empty AND with the
// afterAssistant nudge flag on an assistant tail; Try another reply KEEPS the steer (no composer clear — the
// reroll ergonomic) while Generate/Continue CONSUME it; Simple send fires chat.commitMessage; Draft your line is
// NON-PERSISTING + STREAMING — it rides the `chat.impersonateStream` SUBSCRIPTION (routeImpersonateStream
// stubs the SSE deltas) and FILLS the composer PROGRESSIVELY as the deltas arrive (draft chat: commit with the
// DEFAULT opening so the greeting is PRESERVED, then stream into the PROMOTED composer via the new chatId's
// draft store); the phase matrix disables reroll/continue on a draft with a legible reason (Draft your line +
// Generate reply stay live).
//
// The trigger buttons are inline (component-scoped); menu POPUPs render through a Base UI Portal, so
// menu-item assertions use the PAGE locator (`page.getByRole`), never `component` (the menu.ct.tsx split).

import { GENERATION_FAILED_DETAIL, IMPERSONATE_FAILED_LEAD, IMPERSONATE_IN_FLIGHT, IMPERSONATE_STOP_LABEL } from "@orb/client/lib";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import {
  isImpersonateStreamRequest,
  routeImpersonateStream,
  routeImpersonateStreamOnce,
  ZOMBIE_WATCH_MS,
} from "../../../../support/node/route-impersonate-stream.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, COMPOSER_CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures.ts";

const EMPTY_TURN = { messages: [], aborted: false } satisfies TrpcWireOutput<"chat.generate">;

const RESPONSE = "Generate reply";
// P3-dualmode: the guided icons' accessible name reflects the active mode — "Guided …" when the composer has text.
const RESPONSE_GUIDED = "Guided generate reply";
const TAIL_ASSISTANT_ID = castId<MessageId>("message_ct_tail_assistant");
const NEEDS_REPLY = /needs an existing reply/iu;
const PLAIN_REROLL = /another version of the last reply/iu;
const GROUP_LABELS = ["Input", "Reply", "Continuation", "Media"] as const;
/** A curated DOMAIN message on the typed terminal frame (what the participant gate / an honest refusal reads
 *  like) — it must reach the user verbatim, unlike a raw transport fault. */
const DOMAIN_REFUSAL = "This chat has no working connection.";
/** Playwright's `waitForRequest` timeout rejection — the tell that NO zombie connect arrived. */
const WAIT_TIMEOUT = /Timeout/u;

test("all four guided icons ALWAYS render on a committed chat (never hidden/swapped)", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // committed, empty composer
  await expect(component.getByRole("button", { name: "Draft your line" })).toBeVisible();
  // Wand v2: the ⟳ action is distinct from Regenerate, which moved into the ✨ menu as a plain reroll.
  await expect(component.getByRole("button", { name: "Try another reply" })).toBeVisible();
  await expect(component.getByRole("button", { name: RESPONSE })).toBeVisible();
  await expect(component.getByRole("button", { name: "Continue the reply" })).toBeVisible();
});

test("Response on an EMPTY committed composer fires a PLAIN generate (no steer object)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.generate": () => EMPTY_TURN });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: RESPONSE }).click();
  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.generate") as { guided?: unknown; afterAssistant?: boolean };
  const input = trpc.lastInput("chat.generate") as { guided?: unknown; afterAssistant?: boolean };
  await expect.poll(async () => (await readInputAtAssertion()).guided).toBeUndefined(); // empty composer ⇒ no steer object
  await expect.poll(async () => (await readInputAtAssertion()).afterAssistant).toBe(true); // still nudged on an assistant tail
});

test("Response fires chat.generate with the typed steer + afterAssistant on an assistant tail", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.generate": () => EMPTY_TURN });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("textbox", { name: "Message" }).fill("make her angrier");
  // P3-dualmode: with text present the icon is in guided mode and its accessible name says so.
  await component.getByRole("button", { name: RESPONSE_GUIDED }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.generate") as { guided?: { input?: string }; afterAssistant?: boolean };
  const input = trpc.lastInput("chat.generate") as { guided?: { input?: string }; afterAssistant?: boolean };
  await expect.poll(async () => (await readInputAtAssertion()).guided?.input).toBe("make her angrier");
  await expect.poll(async () => (await readInputAtAssertion()).afterAssistant).toBe(true);
  // Response CONSUMES the steer — the composer clears.
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

test("Try another reply KEEPS the steer (reroll again with the same guidance — no composer clear)", async ({ mount, page }) => {
  // The tail is resolved by useGuidedActions' own chat.listMessages read — stub it with an assistant tail so
  // fireSwipe has a target (the prop only feeds the composer's own tailRole).
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => EMPTY_TURN,
  });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  const box = component.getByRole("textbox", { name: "Message" });
  await box.fill("darker tone");
  const btn = component.getByRole("button", { name: "Try another reply with this direction" });
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // The steer STAYS — the reroll ergonomic (reroll again without re-typing).
  await expect(box).toHaveValue("darker tone");
});

test("Draft your line on a COMMITTED chat STREAMS into the composer PROGRESSIVELY and persists nothing", async ({ mount, page }) => {
  // The streaming subscription yields deltas; the composer fills delta-by-delta. Two scripted deltas so the
  // CT can assert the value GROWS (partial after delta 1, full after delta 2) — not a one-shot dump.
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES }); // no startChat/mutation traffic on the committed path
  await routeImpersonateStream(page, ["I step into the tavern, ", "cloak dripping."]);
  const component = await mount(<ComposerStory />); // committed, empty composer
  const box = component.getByRole("textbox", { name: "Message" });

  await component.getByRole("button", { name: "Draft your line" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();

  // PROGRESSIVE: the composer shows the accumulation after the FIRST delta, then grows to the full line — the
  // fill happens DURING generation, not a plop at the end (EventSource dispatches each frame as its own task,
  // so React commits the partial before the second frame lands).
  await expect(box).toHaveValue("I step into the tavern, ");
  await expect(box).toHaveValue("I step into the tavern, cloak dripping.");
  // NO user turn was persisted — nothing committed on the committed path (no startChat, and the stream writes
  // no canon). The composer-fill assertions above prove the whole stream completed.
  // Settled snapshot: the full-fill assertion above proves the stream COMPLETED; on a committed chat `fireImpersonate`
  // never calls `commitDraft`, so `chat.startChat` is provably never invoked (stable at 0).
  await expect.poll(async () => trpc.count("chat.startChat")).toBe(0);
});

// ── The impersonate stream is a ONE-SHOT drive, not a live feed ──────────────────────────────────────────
// The owner's dead-engine incident: ONE Impersonate click produced `chat.impersonateStream` GETs every ~3s for
// minutes (each re-running the server generator) with NOTHING on screen. Two defects in one: the subscription
// was never unsubscribed, and a server fault whose tRPC code is RETRYABLE (INTERNAL_SERVER_ERROR — what a raw
// ProviderError becomes) is not an error to `httpSubscriptionLink` at all: it reconnects and fires no callback,
// so the flow's promise never settled and no toast ever fired. The connect COUNT is the zombie assertion (the
// stub pins a short EventSource retry, so a zombie's next connect lands well inside the watch window).

/** ABSENCE, proven two ways ([[absence needs two methods]]): a POSITIVE wait for the zombie's next connect that
 *  must TIME OUT (the stub pins the EventSource retry to 200ms, so a live subscription would have re-opened
 *  several times inside the window), plus the stub's own connect counter still reading 1. */
async function expectNoReconnect(page: Page, sse: { count: () => number }, watchMs = ZOMBIE_WATCH_MS): Promise<void> {
  await expect(page.waitForRequest(isImpersonateStreamRequest, { timeout: watchMs })).rejects.toThrow(WAIT_TIMEOUT);
  // Settled snapshot: the wait above TIMED OUT, so no stream request reached the page inside the window — the
  // recorder (fed by the route handler, which only runs on such a request) is provably settled at read.
  await expect.poll(async () => sse.count()).toBe(1);
}

test("a COMPLETED impersonate stream is unsubscribed — no zombie reconnect", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const sse = await routeImpersonateStreamOnce(page, { deltas: ["I step into the tavern."], end: "return" });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: "Draft your line" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("I step into the tavern.");

  await expectNoReconnect(page, sse);
});

test("a domain ERROR FRAME settles the stream once, toasts the domain message, and restores the steer", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const sse = await routeImpersonateStreamOnce(page, { end: "error-frame", message: DOMAIN_REFUSAL });
  const component = await mount(<ComposerStory />);
  const box = component.getByRole("textbox", { name: "Message" });

  await box.fill("greet the innkeeper");
  await component.getByRole("button", { name: "Guided draft your line" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();

  // The frame's message is the CURATED domain message — it rides through as the toast detail.
  await expect(component.getByTestId("composer-notified")).toHaveText(`${IMPERSONATE_FAILED_LEAD} ${DOMAIN_REFUSAL}`);
  // D57 restore-on-failure: the consumed steer comes back so the user can re-fire.
  await expect(box).toHaveValue("greet the innkeeper");
  await expectNoReconnect(page, sse);
});

test("a RETRYABLE server fault is terminal (the dead-engine zombie): one connect, one toast, on an EMPTY composer", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const sse = await routeImpersonateStreamOnce(page, { end: "server-error", message: "connect ECONNREFUSED 127.0.0.1:8000" });
  const component = await mount(<ComposerStory />); // empty composer — the D57 restore is a no-op here, so the toast is the ONLY surface

  await component.getByRole("button", { name: "Draft your line" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();

  // A link-level fault carries framework/operator text, never user copy — the generic detail is shown instead.
  await expect(component.getByTestId("composer-notified")).toHaveText(`${IMPERSONATE_FAILED_LEAD} ${GENERATION_FAILED_DETAIL}`);
  await expectNoReconnect(page, sse);
});

// ── IMP-2: the impersonate stream is STOPPABLE, and says so ──────────────────────────────────────────────
// The stream had a cancel lever (the subscription's unsubscribe) that nothing rendered: a user watching the
// composer fill could only wait it out, while every guided icon claimed to be waiting on "the current reply"
// — a turn that does not exist. These two tests are the fix's two halves: the Stop really unsubscribes, and
// the wait reason is honest.
//
// The staged stub's reconnect delay is PINNED here (`STOP_RETRY_MS`) so the inter-delta gap — the window in
// which the stream is provably still live — is a known quantity: wide enough to click Stop inside, short
// enough that STOP_WATCH_MS with no reconnect is a real observation.
const STOP_RETRY_MS = 2000;
const STOP_WATCH_MS = 2500;
const PARTIAL = "I step into the tavern, ";

test("Stop appears while impersonating, unsubscribes the stream, and KEEPS the partial fill", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const sse = await routeImpersonateStream(page, [PARTIAL, "cloak dripping."], STOP_RETRY_MS);
  const component = await mount(<ComposerStory />);
  const box = component.getByRole("textbox", { name: "Message" });

  await component.getByRole("button", { name: "Draft your line" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();
  // Mid-stream: the first delta landed, the second is still pending its staged reconnect.
  await expect(box).toHaveValue(PARTIAL);

  const stop = component.getByRole("button", { name: IMPERSONATE_STOP_LABEL });
  await expect(stop).toBeVisible();
  await stop.click();

  // The UNSUBSCRIBE fired ([[assert-the-mutation-fired]]): the staged reconnect that would have delivered
  // delta 2 never happens — proven the two ways expectNoReconnect does, over a window LONGER than the pinned
  // retry (a still-live subscription would have re-opened inside it).
  await expectNoReconnect(page, sse, STOP_WATCH_MS);
  // The deliberate divergence from ST (which clears the draft and overwrites per tick): a cancel KEEPS what
  // was written. And a cancel is not a failure — no toast, and the composer is NOT restored to the old steer.
  await expect(box).toHaveValue(PARTIAL);
  await expect(component.getByTestId("composer-notified")).toBeEmpty();
  // The stream is over: the Stop retires and the cluster comes back to life.
  await expect(stop).toBeHidden();
  await expect(component.getByRole("button", { name: "Draft your line" })).toBeEnabled();
});

test("while impersonating, the guided icons name the STREAM as the wait reason (not a phantom reply)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  await routeImpersonateStream(page, [PARTIAL, "cloak dripping."], STOP_RETRY_MS);
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: "Draft your line" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue(PARTIAL);

  // Every idled icon reads the real cause — including Try another reply, whose own phase reason is true but
  // not why it is off RIGHT NOW, and Generate reply, which has no phase reason at all.
  // (The drafted line IS composer text, so the icons are in their GUIDED mode — the P3-dualmode names.)
  //
  // THE CARRIER MOVED, THE CLAIM DID NOT (side-eye 2026-08-21). These four assertions read the native `title`
  // attribute, which is GONE: each of these controls is a Base UI TooltipTrigger that ALSO carried the same
  // string as a title, so Chrome stacked its OS tooltip on the rendered popup (two boxes, one unstyled). The
  // reason is unchanged and still reaches a DISABLED control — `focusableWhenDisabled` +
  // `data-disabled:pointer-events-auto` are what keep the tooltip reachable by hover AND focus, which is the
  // very promise the title was standing in for. So the pin is re-pointed at the surviving carrier rather
  // than dropped: same four controls, same four strings, asserted where a user actually meets them.
  await expectReason(page, component, "Try another reply with this direction", `Try another reply with this direction — ${IMPERSONATE_IN_FLIGHT}`);
  await expectReason(page, component, "Continue the reply with this direction", `Continue the reply with this direction — ${IMPERSONATE_IN_FLIGHT}`);
  await expectReason(page, component, RESPONSE_GUIDED, `${RESPONSE} — ${IMPERSONATE_IN_FLIGHT}`);
  await expectReason(page, component, "Guided draft your line", `Draft your line — ${IMPERSONATE_IN_FLIGHT}`);
});

/** An idled guided icon must EXPLAIN itself where the user meets it: the tooltip popup, on hover — which
 *  reaches these controls only because they carry `data-disabled:pointer-events-auto` (a disabled Button
 *  otherwise drops pointer events, and the reason becomes unreachable). Releases the shared hover state
 *  afterwards so the next control starts clean. */
async function expectReason(page: Page, component: Locator, name: string, reason: string): Promise<void> {
  await component.getByRole("button", { name, exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]'), `${name} must name its real disabled cause`).toHaveText(reason);
  await page.mouse.move(0, 0);
}

test("Regenerate lives in the ✨ menu and fires a PLAIN reroll of the tail assistant (no steer)", async ({ mount, page }) => {
  // Regenerate moved into the ✨ menu (owner). It's a plain reroll — chat.swipe with NO guided object.
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => EMPTY_TURN,
  });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Regenerate" }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // Settled snapshot: the poll settled the recorder at exactly 1 call. A PLAIN reroll carries no steer object.
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.swipe") as { guided?: unknown };
  const input = trpc.lastInput("chat.swipe") as { guided?: unknown };
  await expect.poll(async () => (await readInputAtAssertion()).guided).toBeUndefined();
});

test("Regenerate in the ✨ menu is disabled-with-reason when there's no assistant reply to reroll", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />); // committed, user/empty tail — no assistant tail
  await component.getByRole("button", { name: "Message tools" }).click();
  const regen = page.getByRole("menuitem", { name: "Regenerate" });
  await expect(regen).toBeDisabled();
  await expect(regen).toHaveAttribute("title", NEEDS_REPLY);
});

// P1-A: Regenerate must read APART from the top-row ⟳ Swipe icon — an enabled Regenerate carries a helper
// title that names it a PLAIN reroll (ignores the typed steer), so it is not the byte-identical twin of Swipe.
test("P1-A: an enabled Regenerate carries the plain-reroll helper (distinct from the steer-aware Swipe)", async ({ mount, page }) => {
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.listMessages": () => makeMessagesPage([tail]) });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: "Message tools" }).click();
  const regen = page.getByRole("menuitem", { name: "Regenerate" });
  await expect(regen).toBeEnabled();
  await expect(regen).toHaveAttribute("title", PLAIN_REROLL);
});

// P2-A: the menu is regrouped with labeled groups (Base UI wires each label to its group as an aria heading).
test("P2-A: the ✨ menu is grouped with labeled sections (Input · Reply · Continuation · Media)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await Promise.all(GROUP_LABELS.map((label) => expect(page.getByRole("group", { name: label, exact: true })).toBeVisible()));
});

test("Simple send fires chat.commitMessage (post without generating) and clears the composer", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.commitMessage": () => EMPTY_TURN });
  const component = await mount(<ComposerStory />);

  const box = component.getByRole("textbox", { name: "Message" });
  await box.fill("just a note, no reply");
  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Simple send" }).click();

  await expect.poll(() => trpc.count("chat.commitMessage"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above settled the recorder at exactly 1 call, so lastInput is stable at read.
  expect(trpc.lastInput("chat.commitMessage")).toMatchObject({ content: "just a note, no reply" });
  await expect(box).toHaveValue("");
});

// ── P5 game steers, re-homed into the ✨ menu (owner: "game steers go in the magic wand") ─────────────────
// The cluster reads `chat.getChat.rpg` (engaged pointer ⇒ a live game) + `rpg.getGame.publicConfig.plotProgression`
// to decide which steers render; a plot steer fires chat.generate with a trusted-template gameSteer KIND.
const GAME_CHAT = { participants: [], rpg: { gameId: "rpg_game_ct_steer", engaged: true } };

/**
 * Wait for a just-opened Base UI menu popup to STOP MOVING before pointing at anything inside it.
 *
 * A `MenuPopup` mounts in its `data-starting-style` (`scale-95 opacity-0`, OVERLAY_MOTION.anchoredPopup) and
 * only then transitions to rest — and Playwright's built-in stability check does NOT cover that: the popup's
 * box is CONSTANT for the frame(s) it sits in the starting style, so `hover()`/`click()` score it "stable",
 * park the pointer at the 95%-scale coordinates, and the rows then slide ~14px out from under a synthetic
 * pointer that never moves again. For an ordinary MenuItem that's harmless (a click re-checks its hit target),
 * but a `MenuSubmenuTrigger` is HOVER-ONLY — Base UI sets `ignoreMouse` whenever `openOnHover` is on, so the
 * click is a no-op and the missed hover is unrecoverable: the submenu never opens. `opacity: 1` is the
 * transition's own end signal, and since scale + opacity ride the SAME transition it also proves the geometry
 * has settled. (A real pointer is in continuous motion, so a human re-enters the row for free.)
 */
async function expectPopupSettled(popup: Locator): Promise<void> {
  await expect(popup).toHaveCSS("opacity", "1");
}

const SUBMENU_OPEN_RETRIES = 3;
const SUBMENU_OPEN_ATTEMPT_TIMEOUT_MS = 500;

/**
 * Hover a `MenuSubmenuTrigger` open, with a bounded retry — Base UI's `openOnHover` runs on a 100ms
 * hover-intent timer, and Playwright's synthetic hover occasionally lands+leaves inside that window
 * (board-diagnosed: menu open + submenu collapsed screenshots, NOT a slow-machine timeout). A miss
 * never opens the submenu at all, so re-hovering (not waiting longer) is the fix; each attempt gates
 * on the popup's rendered-settled state via `expectPopupSettled`.
 */
async function hoverOpenSubmenu(trigger: Locator, submenu: Locator): Promise<void> {
  for (let attempt = 1; attempt <= SUBMENU_OPEN_RETRIES; attempt++) {
    await trigger.hover();
    try {
      await expect(submenu).toBeVisible({ timeout: SUBMENU_OPEN_ATTEMPT_TIMEOUT_MS });
      await expectPopupSettled(submenu);
      return;
    } catch (error) {
      if (attempt === SUBMENU_OPEN_RETRIES) {
        throw error;
      }
      // Reset hover-intent state before the next attempt.
      await trigger.page().mouse.move(0, 0);
    }
  }
}

test("game steers live in the ✨ menu (the Plot submenu) and fire a gameSteer KIND on a game chat", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => GAME_CHAT,
    "rpg.getGame": () => ({ chatId: COMPOSER_CHAT_ID, publicConfig: { plotProgression: true } }),
    "chat.generate": () => EMPTY_TURN,
  });
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await expectPopupSettled(page.getByRole("menu", { name: "Message tools" }));

  // The six plot steers nest under a Plot submenu (side-eye P1-B). Open the submenu, then fire one. HOVER,
  // not click: Base UI's SubmenuTrigger wires `ignoreMouse` to `openOnHover`, so a mouse click on it is a
  // deliberate no-op — the pointer landing on the row (100ms hover intent) is the only mouse-driven open.
  // ("Offer choices" left this group at R3/B1 — it renders in Reply now, in every room; its own arms below.)
  await hoverOpenSubmenu(page.getByRole("menuitem", { name: "Plot" }), page.getByRole("menu", { name: "Plot" }));
  await page.getByRole("menuitem", { name: "Advance the act" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll settled the recorder at exactly 1 call. The steer rides as a trusted-template KIND.
  expect(trpc.lastInput("chat.generate")).toMatchObject({ guided: { action: "response", gameSteer: "advance" } });
});

test("Plot submenu is APPLICABILITY-gated off when plotProgression is false — and the group goes with it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => GAME_CHAT,
    "rpg.getGame": () => ({ chatId: COMPOSER_CHAT_ID, publicConfig: { plotProgression: false } }),
  });
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  // The whole Plot submenu is absent (never a disabled twin). Since R3 took its one non-plot tenant away,
  // the GROUP LABEL must go too — a "Plot" heading over nothing is the empty-promise the omit doctrine bans.
  await expect(page.getByRole("menuitem", { name: "Plot", exact: true })).toHaveCount(0);
  await expect(page.getByText("Plot", { exact: true })).toHaveCount(0);
});

test("PLOT steers are ABSENT in the ✨ menu on a non-game chat", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES }); // no rpg pointer → not a game
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByRole("menuitem", { name: "Plot", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Advance the act" })).toHaveCount(0);
});

// ── R3 (B1): the "Offer choices" ONE-SHOT is un-game-gated ────────────────────────────────────────────
// The owner's test names a PLAIN chat, so that is what these mount. The affordance is asserted the way a
// user meets it — an accessible menuitem name — and the fire is asserted on the DECODED WIRE, because
// "the item rendered" and "the item asks for choices" are different claims and only the second one matters.
test("a NON-GAME chat's ✨ menu offers 'Offer choices', and it fires the choices gameSteer KIND", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.generate": () => EMPTY_TURN });
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await expectPopupSettled(page.getByRole("menu", { name: "Message tools" }));

  await expect(page.getByRole("menuitem", { name: "Offer choices" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Offer choices" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll settled the recorder at exactly 1 call. The wire carries the KIND, never template text.
  expect(trpc.lastInput("chat.generate")).toMatchObject({ guided: { action: "response", gameSteer: "choices" } });
});

test("'Offer choices' renders EXACTLY ONCE on a game chat — moved out of Plot, not duplicated into two doors", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => GAME_CHAT,
    "rpg.getGame": () => ({ chatId: COMPOSER_CHAT_ID, publicConfig: { plotProgression: true } }),
  });
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await expectPopupSettled(page.getByRole("menu", { name: "Message tools" }));

  await expect(page.getByRole("menuitem", { name: "Offer choices" })).toHaveCount(1);
});

// ARM B (the templating fork, rows 53-73): the Rewrite modal's toggle picks ride the wire as KINDS. The
// composed fragment BYTES are the server's job now — the wire carries `guided.rewriteToggles` (the ids, in
// catalog order) plus the user's own free text, exactly like `gameSteer` carries a kind and never a template
// ("the wire carries only the kind, never template text", contracts/chat/metadata.ts). Asserted on the
// DECODED REQUEST BODY, which is the only place the fork is observable from the client.
test("Corrections fires the toggle KINDS on the wire — no composed fragment bytes leave the browser", async ({ mount, page }) => {
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => EMPTY_TURN,
  });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Corrections…" }).click();
  // Flip a LATER catalog member first — the wire list is CATALOG order, not click order.
  await page.getByRole("switch", { name: "Past tense" }).click();
  await page.getByRole("switch", { name: "More concise" }).click();
  await page.getByRole("textbox", { name: "Correction instruction" }).fill("keep the plot beats");
  await page.getByRole("button", { name: "Rewrite" }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // Settled snapshot: the poll settled the recorder at exactly 1 call.
  const readInputAtAssertion = async (): Promise<typeof input> =>
    trpc.lastInput("chat.swipe") as { guided?: { action?: string; input?: string; rewriteToggles?: readonly string[] } };
  const input = trpc.lastInput("chat.swipe") as { guided?: { action?: string; input?: string; rewriteToggles?: readonly string[] } };
  await expect.poll(async () => (await readInputAtAssertion()).guided?.action).toBe("rewrite");
  await expect.poll(async () => (await readInputAtAssertion()).guided?.rewriteToggles).toStrictEqual(["concise", "past-tense"]);
  await expect.poll(async () => (await readInputAtAssertion()).guided?.input).toBe("keep the plot beats");
  // The fragment bytes stayed on the server side of the boundary.
  await expect.poll(async () => JSON.stringify(await readInputAtAssertion())).not.toContain("cut filler");
});

test("Corrections with ONLY toggles (no typed instruction) still fires — the kinds are the whole steer", async ({ mount, page }) => {
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => EMPTY_TURN,
  });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Corrections…" }).click();
  await page.getByRole("switch", { name: "Literary style" }).click();
  await page.getByRole("button", { name: "Rewrite" }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // Settled snapshot: the poll settled the recorder at exactly 1 call.
  const readInputAtAssertion = async (): Promise<typeof input> =>
    trpc.lastInput("chat.swipe") as { guided?: { input?: string; rewriteToggles?: readonly string[] } };
  const input = trpc.lastInput("chat.swipe") as { guided?: { input?: string; rewriteToggles?: readonly string[] } };
  await expect.poll(async () => (await readInputAtAssertion()).guided?.rewriteToggles).toStrictEqual(["literary"]);
  await expect.poll(async () => (await readInputAtAssertion()).guided?.input).toBeUndefined();
});
