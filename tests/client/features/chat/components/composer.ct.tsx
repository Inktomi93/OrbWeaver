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

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { ComposerStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID } from "../fixtures";

test("Send is disabled on an empty draft", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  await expect(component.getByRole("button", { name: "Send message" })).toBeDisabled();
});

test("committed handle: Send fires chat.send; the draft is NOT cleared until the commit signal, then clears", async ({
  mount,
  page,
}) => {
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
  await expect.poll(() => sendBody).not.toBeNull();
  expect(sendBody).toContain("Hello there");
  expect(sendBody).toContain(COMPOSER_CHAT_ID);
  // ...but the draft is STILL there — no optimistic clear (this is the whole point of clear-on-commit).
  await expect(textarea).toHaveValue("Hello there");

  // The bus confirms the user's own row committed → the composer clears.
  await component.getByTestId("drive-message-committed").click();
  await expect(textarea).toHaveValue("");
});

test("draft handle: Send lazily starts the chat, then commits the typed text as its first send", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory committed={false} />);

  await component.getByLabel("Message", { exact: true }).fill("First message");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => trpc.count("chat.startChat")).toBe(1);
  await expect.poll(() => trpc.count("chat.send")).toBe(1);
  expect(trpc.lastInput("chat.send")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    content: "First message",
  });
});

test("the reasoning-effort control renders (Auto default) and its selection threads intent.effort into chat.send", async ({
  mount,
  page,
}) => {
  // The effort quick-control is sticky per-turn (ux-flow-revamp §3): Auto ⇒ no `intent` on the wire
  // (server default); a level ⇒ `intent.effort`. Each CT gets a fresh page ⇒ the store's effort starts
  // at its `null` (Auto) default.
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  // Renders at the Auto default — and an Auto send carries NO intent.
  await expect(component.getByRole("button", { name: "Reasoning effort: Auto" })).toBeVisible();
  await component.getByLabel("Message", { exact: true }).fill("no effort set");
  await component.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => trpc.count("chat.send")).toBe(1);
  expect((trpc.lastInput("chat.send") as { intent?: unknown }).intent).toBeUndefined();

  // Pick High → the trigger relabels and the NEXT send carries intent.effort = "high".
  await component.getByRole("button", { name: "Reasoning effort: Auto" }).click();
  await page.getByRole("menuitemradio", { name: "High", exact: true }).click();
  await expect(component.getByRole("button", { name: "Reasoning effort: High" })).toBeVisible();

  await component.getByLabel("Message", { exact: true }).fill("effortful");
  await component.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => trpc.count("chat.send")).toBe(2);
  expect(trpc.lastInput("chat.send")).toMatchObject({ intent: { effort: "high" } });
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
  await expect.poll(() => trpc.count("chat.abort")).toBe(1);
  expect(trpc.lastInput("chat.abort")).toMatchObject({ chatId: COMPOSER_CHAT_ID });

  // The slot has NOT closed optimistically — Send never reappears on its own.
  await expect(component.getByRole("button", { name: "Send message" })).toHaveCount(0);

  // Only the bus's turnAborted (simulated here via the driver) closes the slot.
  await component.getByTestId("drive-abort").click();
  await expect(component.getByRole("button", { name: "Send message" })).toBeVisible();
});

test("a second Stop click while already stopping does not fire a second chat.abort", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, { "chat.abort": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByTestId("drive-begin").click();
  await component.getByTestId("drive-delta").click();
  await component.getByRole("button", { name: "Stop generating" }).click();
  await expect(component.getByRole("button", { name: "Stopping…" })).toBeVisible();

  // The button is disabled while stopping (canStop is false once the phase leaves pending/streaming) —
  // a forced click still must not re-fire the mutation.
  await component.getByRole("button", { name: "Stopping…" }).click({ force: true });

  await expect.poll(() => trpc.count("chat.abort")).toBe(1);
});

test("a send that FAILS keeps the draft for retry (never cleared — no commit signal ever fires)", async ({
  mount,
  page,
}) => {
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

test("the draft stays cleared after a POST-commit send failure (commit signal fired ⇒ no restore)", async ({
  mount,
  page,
}) => {
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
      json: [
        { error: { code: -32_603, message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } } },
      ],
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
  await expect(component.getByRole("button", { name: "Send message" })).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(textarea).toHaveValue("");
});

test("the wand is disabled while a Send is in flight (clear-on-commit reopened the pre-commit window)", async ({
  mount,
  page,
}) => {
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
  const wand = component.getByRole("button", { name: "Guided generations" });

  // With a draft typed and no send in flight, the wand is available.
  await textarea.fill("steer it");
  await expect(wand).toBeEnabled();

  // Fire Send — it stays in flight (held) → the wand disables even though the draft is still populated.
  await component.getByRole("button", { name: "Send message" }).click();
  await expect(wand).toBeDisabled();
});
