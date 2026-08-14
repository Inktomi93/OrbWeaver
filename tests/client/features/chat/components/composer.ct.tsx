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

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { ComposerStory } from "../_ct-stories.tsx";
import { COMPOSER_CHAT_ID } from "../fixtures.ts";

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
// The single clean accessible name for the Attach images row (P1-C — size-hinted, no doubled name).
const ATTACH_NAME = /^Attach images, up to [\d.]+ MB per file$/u;

// ── D111 ☰ RELOCATION: the ⋯ chat-options menu lives in the composer's LEFT gutter, and ONLY there ──
// Owner ruling 2026-08-09 closed D111's parked "topbar vs composer" fork on the composer and removed the
// topbar trail widget in the same change. These assert the PLACEMENT (the sibling composer-chat-options.ct
// owns the menu's contents): present in both phases, and geometrically LEFT of the guided cluster — a
// mount that landed it on the right would satisfy a presence-only assertion.
test("D111: the ⋯ chat-options menu renders in the composer, LEFT of the guided cluster (committed)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => ({ title: "Council", participants: [], viewerIsHost: true }) });
  const component = await mount(<ComposerStory />);
  const options = component.getByRole("button", { name: "Chat options" });
  await expect(options).toBeVisible();

  const optionsBox = await options.boundingBox();
  const clusterBox = await component.locator('[data-slot="composer-guided-cluster"]').boundingBox();
  expect(optionsBox).not.toBeNull();
  expect(clusterBox).not.toBeNull();
  expect(optionsBox?.x ?? 0).toBeLessThan(clusterBox?.x ?? 0);
});

// ── #54 honest-refusal pre-send gate: SEND + the guided fire actions refuse when the connection can't serve ─
// The composer reads `chat.checkSendAvailability` (a deterministic verdict, no turn fired). When it returns
// `available:false`, Send disables WITH the cause-specific reason surfaced via the base-ui-disabled idiom
// (aria-disabled + `title`, native `disabled` absent so the title is hoverable). The reason string is
// asserted per cause; an available verdict leaves Send in its normal (draft-empty-disabled) state.
const ENGINE_OFF_REASON = "Local engine is off — enable it to send.";
const ENGINE_DOWN_REASON = "Local engine is down — start it to send.";
const NO_CONNECTION_REASON = "This chat has no working connection — configure one to send.";

test("#54: engine-off — Send is aria-disabled with the engine-off reason (native disabled absent, title hoverable)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }) });
  const component = await mount(<ComposerStory />); // committed; text present so it's not draft-empty-disabled
  await component.getByLabel("Message", { exact: true }).fill("hello");
  const send = component.getByRole("button", { name: "Send message" });
  // The base-ui-disabled idiom: aria-disabled + title, NOT native disabled (so the reason shows on hover).
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).not.toHaveAttribute("disabled", "");
  await expect(send).toHaveAttribute("title", ENGINE_OFF_REASON);
});

test("#54: engine-down — Send carries the engine-down reason (a DEAD registered engine under adopt-only)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.checkSendAvailability": () => ({ available: false, cause: "engine-down" }) });
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("hello");
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAttribute("title", ENGINE_DOWN_REASON);
});

test("#54: no-connection — Send carries the no-connection reason (the cause drives the copy)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.checkSendAvailability": () => ({ available: false, cause: "no-connection" }) });
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("hello");
  const send = component.getByRole("button", { name: "Send message" });
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAttribute("title", NO_CONNECTION_REASON);
});

test("#54: an unserveable connection refuses the SEND click — no chat.send fires", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
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

test("#54: engine-off idles the guided fire actions with the engine-off reason (Response, Impersonate)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.checkSendAvailability": () => ({ available: false, cause: "engine-off" }) });
  const component = await mount(<ComposerStory />);
  // Response is otherwise NEVER disabled — an off engine is its only disabled state; the reason surfaces.
  const response = component.getByRole("button", { name: "Generate reply" });
  await expect(response).toHaveAttribute("aria-disabled", "true");
  await expect(response).toHaveAttribute("title", new RegExp(`— ${ENGINE_OFF_REASON.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));
  // Impersonate (always fires a turn/draft) idles too, with the send cause winning over its phase reason.
  await expect(component.getByRole("button", { name: "Impersonate" })).toHaveAttribute("aria-disabled", "true");
});

test("#54: an AVAILABLE verdict leaves Send serveable (a typed committed composer sends)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
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

test("generate-image is gated on typed text, then fires chat.generateImage (mode free, the text as prompt)", async ({ mount, page }) => {
  let genBody: string | null = null;
  await routeTrpc(page, {});
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
  await routeTrpc(page, { "chat.generateImage": () => trpcError({ message: "gen boom" }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("a neon city at dusk");
  await component.getByRole("button", UTILITY_TRIGGER).click();
  await page.getByRole("menuitem", { name: "Generate image from text" }).click();

  // The generate settles as a failure and the prompt is INTACT — the data-loss bug would have wiped it to "".
  await expect(textarea).toHaveValue("a neon city at dusk");
});

test("a generate-image that SUCCEEDS clears the typed prompt (clear-on-success)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.generateImage": () => ({ ok: true }) });
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

test("wand v2: Attach images lives in the ✨ menu (image controls re-homed off the bar)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", UTILITY_TRIGGER).click();
  // The attach row is present in the menu (the sanctioned FileDropzone picker), off the composer bar.
  await expect(page.getByRole("menuitem", { name: "Attach images" })).toBeVisible();
});

// P1-C: the file input is NOT a focus target inside the menuitem's accessible name. Exactly one control
// carries the "Attach images…" name (the menuitem), and its name is the single clean size-hinted string —
// the doubled name ("Attach images Attach images Up to …") + second focus target are gone.
test("P1-C: Attach images is a SINGLE accessible control (input is aria-hidden, off the accessible name)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", UTILITY_TRIGGER).click();

  // One clean accessible name (a size-hinted "Attach images, up to N MB per file"); no doubled name.
  const attach = page.getByRole("menuitem", { name: ATTACH_NAME });
  await expect(attach).toHaveCount(1);
  // The real <input type=file> exists for the upload path but is OFF the accessible tree (aria-hidden,
  // tabIndex -1) — it is not a second focusable control announced under the menuitem.
  const input = page.locator('[data-slot="file-dropzone-input"]');
  await expect(input).toHaveAttribute("aria-hidden", "true");
  await expect(input).toHaveAttribute("tabindex", "-1");
});

test("the guided cluster shows all four icons on an empty committed composer; Response is always live (wand v2)", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // empty composer, committed handle
  // The four dual-mode icons ALWAYS render on the top row. Response is never disabled — an empty committed
  // composer fires a plain generate reply. The ⟳ icon is now labeled "Swipe" (Regenerate moved to the ✨ menu).
  await expect(component.getByRole("button", { name: "Generate reply" })).toBeEnabled();
  await expect(component.getByRole("button", { name: "Impersonate" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Swipe" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("committed handle: Send fires chat.send; the draft is NOT cleared until the commit signal, then clears", async ({ mount, page }) => {
  // Hold chat.send so its clear-on-commit listener stays alive (the send promise stays open for the
  // whole turn in production; the commit signal arrives MID-flight). Registered BEFORE routeTrpc so it
  // runs FIRST (Playwright routes are LIFO); it captures the send body then holds (never falls through
  // to routeTrpc, so we read the captured body directly rather than routeTrpc's counter).
  let sendBody: string | null = null;
  await routeTrpc(page, {});
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
  const trpc = await routeTrpc(page, { "chat.abort": () => ({ ok: true }) });
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
  const trpc = await routeTrpc(page, { "chat.abort": () => ({ ok: true }) });
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

test("a send that FAILS keeps the draft for retry (never cleared — no commit signal ever fires)", async ({ mount, page }) => {
  // `chat.send` rejects and NO commit signal is ever driven → clear-on-commit never fires → the draft
  // survives. This is the race-free replacement for the old phase-gated restore: nothing was cleared, so
  // nothing needs restoring.
  await routeTrpc(page, { "chat.send": () => trpcError({ message: "boom" }) });
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
  await routeTrpc(page, {});
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

test("sending with an attachment uploads it to CAS and includes the asset id on chat.send", async ({ mount, page }) => {
  // Stub the raw multipart upload route (not tRPC) → returns a StoredAsset.
  let uploadCalled = 0;
  await page.route("**/api/assets/upload", async (route) => {
    uploadCalled += 1;
    await route.fulfill({
      json: { assetId: STUB_ASSET_ID, hash: "cthash", size: PNG_1PX.length, created: true },
    });
  });
  // Hold chat.send so we can read its captured body (registered BEFORE routeTrpc — LIFO).
  let sendBody: string | null = null;
  await routeTrpc(page, {});
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

test("the wand is disabled while a Send is in flight (clear-on-commit reopened the pre-commit window)", async ({ mount, page }) => {
  // Removing the optimistic clear left the draft populated during a send's pre-commit window; without a
  // gate the wand could fire a guided action against it (its own user-role messageCommitted could even
  // satisfy the send's clear correlation → a double-action). `busy={sendMessage.isPending}` closes it.
  // Hold chat.send so isPending stays true for the assertion.
  await routeTrpc(page, {});
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

// ── PD-146: continue-on-empty (continueOnSend) ───────────────────────────────────────────────────────────
test("continueOnSend: an empty Send on an assistant tail fires chat.continueTurn on that message", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
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
