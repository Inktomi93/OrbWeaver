// CT: the chat composer (task #18). Drives the PRODUCTION path — routeTrpc stubs the network, the
// component fires the real `createEntityMutation`-backed hooks. Turn-lifecycle transitions (pending/
// streaming/stopping/aborted) are driven via the story's driver buttons (mirrors ghost-message-row.ct.tsx's
// approach) rather than a scripted SSE body — `markStopping`'s immediate-feedback half is client-only
// (no network round-trip involved), and the store's own `chat-stream.test.ts` already proves the DU
// transitions; this suite proves the COMPONENT wires them correctly.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
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
