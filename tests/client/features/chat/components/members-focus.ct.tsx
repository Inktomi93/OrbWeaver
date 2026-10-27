import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeOrbSocket, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";

test("removing a member closes the real confirm onto a surviving roster control", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness();
  const initialCaller = await root.internalCallerFor(root.ownerId);
  await initialCaller.settings.updateAppSettings({ partial: { localMultiUser: true } });
  const caller = await root.internalCallerFor(root.ownerId);
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const captured = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (captured === undefined || memberId === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  const before = await caller.chat.getChat({ chatId: captured.id });
  const chatId = before.id;
  const member = before.participants.find((person) => person.userId === memberId);
  if (member === undefined) {
    throw new Error("The shared member is absent from the production read");
  }
  await seedShellState(page, { activeSection: "chats" });
  const auth = await root.http.request("/api/auth/config");
  const authBody = await auth.text();
  await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: authBody }));
  const requests = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "notifications.presence",
      "invites.kick",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
  });
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const stop = new AbortController();
  let started = false;
  await using subscription = new AsyncDisposableStack();
  subscription.defer(async () => {
    stop.abort();
    if (started) {
      await joined.promise;
    }
  });
  await routeOrbSocket(page, {
    awaitAttaches: 1,
    frames: async (signal) => {
      started = true;
      const events = root.app.liveBuses.chat.subscribeChatEvents(chatId, AbortSignal.any([signal, stop.signal]));
      listening.resolve();
      try {
        for await (const entry of events) {
          if (entry.event.type === "chatUpdated") {
            if (entry.seq === null) {
              throw new Error("The durable chat update has no sequence");
            }
            return [{ channel: "chat", chatId, seq: entry.seq, event: entry.event }];
          }
        }
        return [];
      } catch (error) {
        if (!stop.signal.aborted) {
          throw error;
        }
        return [];
      } finally {
        joined.resolve();
      }
    },
  });
  const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await page.getByRole("button", { name: /^Members — /u }).click();
  const members = page.getByRole("toolbar", { name: "Members and characters", exact: true });
  await expect(members).toBeVisible();
  const row = members.getByRole("button", { name: new RegExp(`^${member.displayName} — member`) });
  await row.click();
  await page.getByRole("menuitem", { name: "Kick…", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toBeFocused();
  await row.click();
  await page.getByRole("menuitem", { name: "Kick…", exact: true }).click();
  await expect(confirm).toBeVisible();
  await listening.promise;
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => requests.lastInput("invites.kick")).toEqual({ chatId, userId: memberId });
  await expect(row).toHaveCount(0);
  await expect(confirm).toHaveCount(0);
  const nextCharacter = before.participants.find((person) => person.kind === "character");
  if (nextCharacter === undefined) {
    throw new Error("The shared room has no next character row");
  }
  await expect(members.getByRole("button", { name: new RegExp(`^${nextCharacter.displayName} — character`, "u") })).toBeFocused();
  await component.unmount();
  await joined.promise;
});

test("the inline flank threshold resolves to its reading floor, sidebar and gap", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });
  const probe = page.locator('[data-slot="chat-room-flank-row"]').locator("..").locator(':scope > [aria-hidden="true"]');
  await expect(probe).toHaveCount(1);
  const threshold = await resolvedLength(page, "calc(var(--dimension-content-reading-floor) + var(--width-sidebar-sm) + var(--spacing-block))");
  await expect.poll(async () => (await probe.boundingBox())?.width).toBeCloseTo(threshold, 1);
});
