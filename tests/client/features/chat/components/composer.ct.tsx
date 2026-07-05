// CT: the chat composer (task #18). Drives the PRODUCTION path — routeTrpc stubs the network, the
// component fires the real `createEntityMutation`-backed hooks. Turn-lifecycle transitions (pending/
// streaming/stopping/aborted) are driven via the story's driver buttons (mirrors ghost-message-row.ct.tsx's
// approach) rather than a scripted SSE body — `markStopping`'s immediate-feedback half is client-only
// (no network round-trip involved), and the store's own `chat-stream.test.ts` already proves the DU
// transitions; this suite proves the COMPONENT wires them correctly.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { ComposerStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID } from "../fixtures";

test("Send is disabled on an empty draft", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  await expect(component.getByRole("button", { name: "Send message" })).toBeDisabled();
});

test("committed handle: Send fires chat.send with the typed content, then clears the draft", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("Hello there");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => trpc.count("chat.send")).toBe(1);
  expect(trpc.lastInput("chat.send")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    content: "Hello there",
  });
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
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

test("a send that fails PRE-COMMIT (slot still idle) restores the cleared draft text", async ({
  mount,
  page,
}) => {
  // `chat.send` rejects and NO turn ever begins (no drive-begin click) → the slot stays `idle` → the
  // hook's phase-gate treats it as a pre-commit failure and restores the composer text.
  await routeTrpc(page, { "chat.send": () => trpcError({ message: "boom" }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("Don't lose me");
  await component.getByRole("button", { name: "Send message" }).click();

  // Optimistically cleared on submit, then restored once the send rejects with the slot still idle.
  await expect(textarea).toHaveValue("Don't lose me");
});

test("a pre-commit send failure with a STALE terminal slot from a prior turn STILL restores", async ({
  mount,
  page,
}) => {
  // The correctness pin for the `isLiveTurnPhase` gate (vs a naive `!== "idle"`): a prior turn's slot
  // lingers at a terminal phase (`aborted`) — it is NOT reset to idle between turns. A 2nd message that
  // fails pre-commit must STILL restore, because that stale terminal phase is NOT a LIVE turn for this
  // send. Drive begin→abort to leave the slot `aborted` (non-live ⇒ Send button is back), then fail send.
  await routeTrpc(page, { "chat.send": () => trpcError({ message: "boom" }) });
  const component = await mount(<ComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await component.getByTestId("drive-begin").click(); // → pending
  await component.getByTestId("drive-abort").click(); // → aborted (stale terminal, non-live)
  await textarea.fill("Keep me despite the stale slot");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect(textarea).toHaveValue("Keep me despite the stale slot");
});

test("a send that fails while a turn is LIVE keeps the cleared draft (post-commit, no restore)", async ({
  mount,
  page,
}) => {
  // Hold the `chat.send` response so the slot can be driven LIVE (turnStarted-equiv ⇒ the user's row
  // committed) BEFORE the rejection lands — the real post-commit generation-failure shape. Registered
  // BEFORE routeTrpc so it runs FIRST (Playwright routes are LIFO); it only intercepts the send mutation
  // and falls everything else through to routeTrpc.
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
  // Move the slot LIVE while the send is still in flight (the turn "started" server-side).
  await component.getByTestId("drive-begin").click();
  // Release the send → it rejects with the slot LIVE ⇒ committed ⇒ NOT restored.
  releaseSend?.();

  await expect(textarea).toHaveValue("");
  // Sanity: the composer is now showing Stop (a live turn), never Send — the row did commit.
  await expect(component.getByRole("button", { name: "Send message" })).toHaveCount(0);
});
