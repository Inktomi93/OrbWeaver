// CT: the `/join` link landing (features/chat/anchors/join-invite-dialog.tsx — the multi-human
// invites lane). Drives the preview→confirm flow over the stubbed network: mount fires
// `invites.previewInvite({ token })` (a POST-shaped read — the token never rides a GET URL), the
// minimal preview renders (room · host · member count · mode — NO roster identities pre-join), and
// confirming fires `invites.redeemInvite({ token })` then closes (the story surfaces `onDone` as
// text). A bad token renders the ONE flat "invalid or expired" state — leak-free, no oracle.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { JoinInviteDialogStory } from "../_ct-stories";

const PREVIEW = {
  chatId: "chat_ct_join",
  roomName: "Tavern Night",
  hostHandle: "alex",
  memberCount: 3,
  modeLabel: "Group · natural",
};

test("mount previews the token; confirm redeems and closes into the chat", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "invites.previewInvite": () => PREVIEW,
    "invites.redeemInvite": () => ({
      chat: { id: "chat_ct_join", participants: [] },
      participant: { id: "participant_ct_join" },
    }),
  });

  await mount(<JoinInviteDialogStory token="tok_ct_secret" />);

  // The preview-then-confirm read fired with the RAW token in the POST body.
  await expect.poll(() => trpc.count("invites.previewInvite")).toBeGreaterThanOrEqual(1);
  expect(trpc.lastInput("invites.previewInvite")).toEqual({ token: "tok_ct_secret" });

  // The MINIMAL preview renders (room · host · members · mode).
  await expect(page.getByTestId("join-invite-dialog")).toBeVisible();
  await expect(page.getByText("Tavern Night")).toBeVisible();
  await expect(page.getByText("Host: alex")).toBeVisible();
  await expect(page.getByText("Members: 3")).toBeVisible();
  await expect(page.getByText("Mode: Group · natural")).toBeVisible();

  await page.getByTestId("join-invite-confirm").click();
  await expect.poll(() => trpc.count("invites.redeemInvite")).toBeGreaterThanOrEqual(1);
  expect(trpc.lastInput("invites.redeemInvite")).toEqual({ token: "tok_ct_secret" });
  // Redeem success tears the dialog down (the story renders the done marker).
  await expect(page.getByTestId("ct-join-done")).toBeVisible();
});

test("a bad token renders the flat 'invalid or expired' state (leak-free NOT_FOUND)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "invites.previewInvite": () => trpcError({ code: "NOT_FOUND" }),
  });

  await mount(<JoinInviteDialogStory token="tok_ct_bogus" />);

  await expect(page.getByText("This invite is invalid or has expired.")).toBeVisible();
  // No preview fields leak for a bad token.
  await expect(page.getByText("Host:", { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("ct-join-done")).toBeVisible();
});

test("'Not now' dismisses without redeeming (the link stays usable)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "invites.previewInvite": () => PREVIEW,
  });

  await mount(<JoinInviteDialogStory token="tok_ct_secret" />);
  await expect(page.getByText("Tavern Night")).toBeVisible();

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("ct-join-done")).toBeVisible();
  expect(trpc.count("invites.redeemInvite")).toBe(0);
});
