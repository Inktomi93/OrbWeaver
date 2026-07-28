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
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { ComposerStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID } from "../fixtures";

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

test("Send is disabled on an empty draft", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  await expect(component.getByRole("button", { name: "Send message" })).toBeDisabled();
});

// ── imagery I5 base slice: the in-chat AI generate-image affordance ─────────────────────────────────────
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
    // Hold it in flight — the button drives the loading state; the posted message rides the bus.
    await new Promise<void>(() => undefined);
  });

  const component = await mount(<ComposerStory />);
  const generate = component.getByRole("button", { name: "Generate image from text" });
  // Empty composer → the generate action is disabled (free mode needs a prompt).
  await expect(generate).toBeDisabled();

  const textarea = component.getByLabel("Message", { exact: true });
  await textarea.fill("a neon city at dusk");
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
  const generate = component.getByRole("button", { name: "Generate image from text" });

  await textarea.fill("a neon city at dusk");
  await expect(generate).toBeEnabled();
  await generate.click();

  // The generate settles as a failure (the button is actionable again, not stuck loading) and the prompt
  // is INTACT — the data-loss bug would have wiped it to "".
  await expect(generate).toBeEnabled();
  await expect(textarea).toHaveValue("a neon city at dusk");
});

test("a generate-image that SUCCEEDS clears the typed prompt (clear-on-success)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.generateImage": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });
  const generate = component.getByRole("button", { name: "Generate image from text" });

  await textarea.fill("a neon city at dusk");
  await generate.click();

  // On a green settle the composer clears (the prompt became the posted image message).
  await expect(textarea).toHaveValue("");
});

// ── #8 grey-out (side-eye P2): the composer's two secondary disabled buttons explain themselves on hover ──
// The empty composer is the FIRST thing a user sees on a fresh draft. The wand trigger + the generate-image
// button were native-disabled (title:null) — zero hover feedback. They now render `focusableWhenDisabled`
// (Base UI ⇒ aria-disabled, NOT native `disabled`), so the button stays HOVERABLE and its `title` reason
// surfaces, while the click stays a guarded no-op. These pin BOTH the mechanism (aria-disabled + a title
// that names the unlock) AND hoverability + activation-prevention — the same bar as the chat-options menu CT.
const TYPE_TO_UNLOCK = /type a message/iu;
const SEND_TO_UNLOCK = /send the first message/iu;
// Matches any attribute value — used to assert the NATIVE `disabled` attribute is ABSENT (the button is
// aria-disabled instead, so it stays hoverable and its `title` reason surfaces).
const ANY_VALUE = /.*/u;

test("#8: the generate-image button (committed, empty) is aria-disabled (hoverable) with a 'type a message' reason", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // committed by default, empty composer
  const generate = component.getByRole("button", { name: "Generate image from text" });

  // The mechanism (verified from the live DOM): the button is aria-disabled="true", NOT native
  // `disabled` — so it is NOT pointer-events:none and its `title` reason surfaces on hover (a native
  // disabled button would swallow the hover). Playwright treats aria-disabled as "disabled" for
  // toBeDisabled() (activation is prevented), while the missing native attr keeps it hoverable.
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAttribute("aria-disabled", "true");
  await expect(generate).not.toHaveAttribute("disabled", ANY_VALUE);
  await expect(generate).toHaveAttribute("title", TYPE_TO_UNLOCK);
});

test("#8: the generate-image button (DRAFT) names the send-first unlock (image gen needs a committed chat)", async ({ mount }) => {
  const component = await mount(<ComposerStory committed={false} />);
  const textarea = component.getByLabel("Message", { exact: true });
  // Even WITH text, a draft can't generate — it has no chat to post into. The reason names that unlock.
  await textarea.fill("a neon city at dusk");
  const generate = component.getByRole("button", { name: "Generate image from text" });
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAttribute("aria-disabled", "true");
  await expect(generate).toHaveAttribute("title", SEND_TO_UNLOCK);
});

test("the guided cluster shows all four icons on an empty committed composer; Response is always live (W-D)", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // empty composer, committed handle
  // W-D: the four dual-mode icons ALWAYS render (never a single text-gated wand trigger). Response is never
  // disabled — an empty committed composer fires a plain generate reply (the composer-guided-cluster.ct
  // drives the fire paths; here we only pin the composer wiring shows the cluster).
  await expect(component.getByRole("button", { name: "Generate reply" })).toBeEnabled();
  await expect(component.getByRole("button", { name: "Impersonate" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Regenerate" })).toBeVisible();
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

test("draft handle: Send lazily starts the chat, then commits the typed text as its first send", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory committed={false} />);

  await component.getByLabel("Message", { exact: true }).fill("First message");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.send"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      content: "First message",
    });
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

test("picking an image shows a removable preview and enables Send on an empty draft", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  // Empty draft → Send disabled to start.
  await expect(component.getByRole("button", { name: "Send message" })).toBeDisabled();

  await component.locator(DROPZONE_INPUT).setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG_1PX });

  // The pending preview appears and an attachment-only draft is now sendable.
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Send message" })).toBeEnabled();

  // Remove-before-send drops the preview and re-disables Send.
  await component.getByRole("button", { name: REMOVE_BTN }).click();
  await expect(component.locator(ATTACHMENT_PREVIEW)).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Send message" })).toBeDisabled();
});

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
  await component.locator(DROPZONE_INPUT).setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG_1PX });
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
  const response = component.getByRole("button", { name: "Generate reply" });

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
