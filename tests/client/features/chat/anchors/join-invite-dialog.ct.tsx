// Controlled invite presentation, focus and completion; membership and whole-app navigation belong to integration and E2E.
import { DEAD_INVITE_SENTENCE, inviteRoomSentence } from "@orb/client/lib";
import { invitePreviewSchema } from "@orb/contracts/chat";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { makeChatDetail, makeChatId, makeRedeemInviteResult } from "@orb/testkit/node/helpers";
import type { JoinInviteDialogStory } from "./_join-invite-stories.tsx";

const TOKEN = "controlled-invite-token";
const PREVIEW = invitePreviewSchema.parse({
  chatId: makeChatId(),
  roomName: "Lantern Quay",
  hostHandle: "preview-host",
  memberCount: 3,
  modeLabel: "The room mode supplied by the preview.",
});
const ROOM_SENTENCE = inviteRoomSentence(PREVIEW);
const DIALOG = "Join a chat";

function providerReads(corpus: CorpusWire): TrpcRoutes<"settings.getUserSettings" | "sessions.me"> {
  return {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
  };
}

test("a controlled loading preview becomes ready and focuses its newly mounted primary action", async ({ corpus, mount, page }) => {
  const preview = trpcHold<"invites.previewInvite">();
  const wire = await routeTrpc(page, { ...providerReads(corpus), "invites.previewInvite": preview });
  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith("/invites.previewInvite"));
  await mount<typeof JoinInviteDialogStory>("tests/client/features/chat/anchors/_join-invite-stories/JoinInviteDialogStory", { token: TOKEN });
  await preview.requested;
  const dialog = page.getByRole("dialog", { name: DIALOG, exact: true });
  await expect(dialog.getByText("Checking the invite…", { exact: true })).toBeVisible();
  await expect(dialog).toBeFocused();
  expect((await request).method()).toBe("POST");
  expect(wire.requireLastInput("invites.previewInvite")).toEqual({ token: TOKEN });
  preview.release(PREVIEW);
  await expect(dialog.getByText(ROOM_SENTENCE, { exact: true })).toBeVisible();
  await expect(dialog.getByText(PREVIEW.modeLabel, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Join chat", exact: true })).toBeFocused();
  expect(wire.count("invites.redeemInvite")).toBe(0);
});

test("popup focus delivered after a ready preview still lands on Join chat", async ({ corpus, mount, page }) => {
  await routeTrpc(page, { ...providerReads(corpus), "invites.previewInvite": () => PREVIEW });
  await mount<typeof JoinInviteDialogStory>("tests/client/features/chat/anchors/_join-invite-stories/JoinInviteDialogStory", { token: TOKEN });
  const dialog = page.getByRole("dialog", { name: DIALOG, exact: true });
  const join = dialog.getByRole("button", { name: "Join chat", exact: true });
  await expect(join).toBeVisible();
  // Deliver the native popup focus after readiness, without replacing a browser prototype or timing a queued callback.
  await dialog.focus();
  await expect(join).toBeFocused();
});

test("an invalid preview discloses no room or host and closes through the caller callback", async ({ corpus, mount, page }) => {
  const wire = await routeTrpc(page, {
    ...providerReads(corpus),
    "invites.previewInvite": trpcError({ code: "NOT_FOUND", message: "The preview cannot be read." }),
  });
  await mount<typeof JoinInviteDialogStory>("tests/client/features/chat/anchors/_join-invite-stories/JoinInviteDialogStory", { token: TOKEN });
  const dialog = page.getByRole("dialog", { name: DIALOG, exact: true });
  await expect(dialog.getByText(DEAD_INVITE_SENTENCE, { exact: true })).toBeVisible();
  await expect(page.getByText(PREVIEW.roomName, { exact: false })).toHaveCount(0);
  await expect(page.getByText(PREVIEW.hostHandle, { exact: false })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Join chat", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("status", { name: "Join dialog completion", exact: true })).toHaveText("Closed");
  await expect(dialog).toHaveCount(0);
  expect(wire.count("invites.redeemInvite")).toBe(0);
});

test("Not now dismisses the ready component without redeeming the invite", async ({ corpus, mount, page }) => {
  const wire = await routeTrpc(page, { ...providerReads(corpus), "invites.previewInvite": () => PREVIEW });
  await mount<typeof JoinInviteDialogStory>("tests/client/features/chat/anchors/_join-invite-stories/JoinInviteDialogStory", { token: TOKEN });
  const dialog = page.getByRole("dialog", { name: DIALOG, exact: true });
  await expect(dialog.getByText(ROOM_SENTENCE, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("status", { name: "Join dialog completion", exact: true })).toHaveText("Closed");
  await expect(dialog).toHaveCount(0);
  expect(wire.count("invites.redeemInvite")).toBe(0);
});

test("a refused redemption replaces the previous preview with the same flat invalid state", async ({ corpus, mount, page }) => {
  const wire = await routeTrpc(page, {
    ...providerReads(corpus),
    "invites.previewInvite": () => PREVIEW,
    "invites.redeemInvite": trpcError({ code: "NOT_FOUND", message: "The invite was spent after preview." }),
  });
  await mount<typeof JoinInviteDialogStory>("tests/client/features/chat/anchors/_join-invite-stories/JoinInviteDialogStory", { token: TOKEN });
  const dialog = page.getByRole("dialog", { name: DIALOG, exact: true });
  await expect(dialog.getByText(ROOM_SENTENCE, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Join chat", exact: true }).click();
  await expect(dialog.getByText(DEAD_INVITE_SENTENCE, { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(PREVIEW.roomName);
  await expect(dialog).not.toContainText(PREVIEW.hostHandle);
  await expect(dialog).not.toContainText(PREVIEW.modeLabel);
  expect(wire.requireLastInput("invites.redeemInvite")).toEqual({ token: TOKEN });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("status", { name: "Join dialog completion", exact: true })).toHaveText("Closed");
});

test("successful redemption completes through the caller callback", async ({ corpus, mount, page }) => {
  const viewer = createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"])(undefined);
  const chat = makeChatDetail({ id: PREVIEW.chatId, title: PREVIEW.roomName, viewerIsHost: false, viewerUserId: viewer.userId });
  const wire = await routeTrpc(page, {
    ...providerReads(corpus),
    "invites.previewInvite": () => PREVIEW,
    "invites.redeemInvite": () => makeRedeemInviteResult({ chat }),
  });
  await mount<typeof JoinInviteDialogStory>("tests/client/features/chat/anchors/_join-invite-stories/JoinInviteDialogStory", { token: TOKEN });
  const dialog = page.getByRole("dialog", { name: DIALOG, exact: true });
  await dialog.getByRole("button", { name: "Join chat", exact: true }).click();
  await expect(page.getByRole("status", { name: "Join dialog completion", exact: true })).toHaveText("Closed");
  await expect(dialog).toHaveCount(0);
  expect(wire.count("invites.redeemInvite")).toBe(1);
  expect(wire.requireLastInput("invites.redeemInvite")).toEqual({ token: TOKEN });
});
