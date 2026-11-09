// @subject packages/client/src/features/chat/components/member-card-viewer.tsx
// The viewer's header names the card. Where Close takes its own line under the title, the title keeps the dialog's whole width
// instead of ceding it to a Close that is no longer beside it.

import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { MemberCardViewerStory } from "./_member-card-viewer-stories.tsx";

const STORY = "tests/client/features/chat/components/_member-card-viewer-stories/MemberCardViewerStory";

test.describe("the member card viewer's title at a 390 phone and 300% text", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("keeps the dialog's width when Close wraps under it", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
    const host = await root.internalCallerFor(root.ownerId);
    const rooms = (await host.chat.listChats({ limit: 100 })).items;
    const details = await Promise.all(rooms.map((item) => host.chat.getChat({ chatId: item.id })));
    const room = details.find((chat) => chat.viewerIsHost && chat.participants.some((person) => person.kind === "character"));
    const character = room?.participants.find((person) => person.kind === "character");
    const characterId = character?.characterId ?? undefined;
    if (room === undefined || characterId === undefined) {
      throw new Error("The corpus has no hosted room with a character");
    }
    await seedShellState(page, { activeSection: "chats" });
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(host, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "chat.getMemberCard"]));
    await mount<typeof MemberCardViewerStory>(STORY, { chatId: room.id, characterId });
    await setRootFontScale(page, channelName("fontScale"), 3);
    const dialog = page.getByRole("dialog");
    const heading = dialog.getByRole("heading").first();
    const close = dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true });
    await expect(heading).toHaveText(character?.displayName ?? "");
    // A truncating title would cut here, because the avatar and the wrapped Close leave it none of the dialog's width.
    await expect.poll(() => heading.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    // The control: Close sits on its own line under the title, so the title is not ceding width to a neighbour.
    const title = await heading.boundingBox();
    const dismiss = await close.boundingBox();
    expect(dismiss?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual((title?.y ?? Number.POSITIVE_INFINITY) + (title?.height ?? 0));
  });
});
