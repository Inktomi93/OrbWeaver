// @subject packages/client/src/features/app-shell/components/section-context-host.tsx
// The CONTEXT pane's boundary follows the section's selection: a room whose read failed gives way to the next room opened.

import { contextToggleLabel } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { QUERY_DEFAULT_READ_LABEL, queryFailedLabel } from "#client/data/query-state-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROOM_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "notifications.presence",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const CONTEXT_ERROR = queryFailedLabel(QUERY_DEFAULT_READ_LABEL);

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("a room whose context read failed gives way to the next room opened", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [failing, live] = (await caller.chat.listChats({ limit: 2 })).items;
  if (failing === undefined || live === undefined) {
    throw new Error("The corpus needs two chats");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ROOM_READS),
    ...serveCorpusProcedures(caller, ["chat.getChat"], (input) => (input.chatId === failing.id ? trpcError({ code: "BAD_REQUEST" }) : undefined)),
  });
  const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId: failing.id });
  const toggle = page.getByRole("button", { name: contextToggleLabel(true), exact: true });
  if ((await toggle.count()) > 0) {
    await toggle.click();
  }
  const context = page.locator(CONTEXT);
  await expect(context.getByText(CONTEXT_ERROR, { exact: true })).toBeVisible();
  await component.update({ chatId: live.id });
  await expect(context.getByText(CONTEXT_ERROR, { exact: true })).toHaveCount(0);
  await expect(context.getByRole("tab").first()).toBeVisible();
});
