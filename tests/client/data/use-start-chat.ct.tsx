// CT: `useStartChat` — the ONE client creation seam (chat-creation-draft-mode-replacement.md §4.1, R1).
//
// Every launcher in the app — the new-chat picker, the home quick-picks tile, "New chat with same cast",
// the character library's Chat-with CTA — fires THIS. Its three jobs are each pinned below, because each is
// silent when it breaks: the WIRE SHAPE it sends (creation intent only, never the nine-field draft carry
// that used to ride along), the NAVIGATION it performs, and the CACHE SEED that makes the room's first
// frame warm. It lives in `#data` because chat AND character both launch chats and a feature may never
// import another feature.
//
// A CT, not a unit test: the hook composes `createEntityMutation` + the real tRPC client + `#state` module
// actions, and its whole observable surface is what a mounted component sees.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/ct/route-trpc.ts";
import { StartChatStory } from "./_ct-stories.tsx";

const CREATED_ID = "chat_ct_start_chat";

const CREATED_CHAT = {
  id: CREATED_ID,
  title: "The Ashfall Road",
  participants: [],
  anchorPersonaId: null,
  cast: [],
  group: DEFAULT_GROUP_CONFIG,
  temporary: false,
  viewerIsHost: true,
  roomOverrides: {},
  background: null,
  rpg: null,
};

const START_CHAT_ROUTES = {
  "chat.startChat": { chat: CREATED_CHAT, opening: null, openingFailure: null },
  // Deliberately NOT stubbed to the same row: `chat.getChat` answering `null` here is the CONTROL for the
  // seed pin below — if the response were not written into the cache, the reader would go cold.
};

test("the Start seam creates the room, enters it, and lands the rail on Chats", async ({ mount, page }) => {
  await routeTrpc(page, START_CHAT_ROUTES);

  const component = await mount(<StartChatStory />);
  const state = component.getByTestId("start-chat-state");
  // At rest the shell is on HOME (the launcher, D62 P4) — the section switch is part of what this seam does.
  await expect(state).toHaveText("chat=none section=home pending=false");

  await component.getByRole("button", { name: "start chat" }).click();

  await expect(state).toHaveText(`chat=${CREATED_ID} section=chats pending=false`);
});

test("the response SEEDS chat.getChat — the room's first frame is warm with zero extra reads", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, START_CHAT_ROUTES);

  const component = await mount(<StartChatStory />);
  await component.getByRole("button", { name: "start chat" }).click();

  // The reader renders the row's title WITHOUT a `getChat` round-trip: `StartChatResult.chat` IS a full
  // `ChatDetail`, so the write's own response is authoritative for that read (§4.10). The harness stubs
  // `getChat` to the unlisted-proc `null`, which is exactly what a COLD read would render — so "cold" here
  // is the planted control, and the real title is the claim.
  await expect(component.getByTestId("seeded-room")).toHaveText("The Ashfall Road");
  await expect.poll(() => trpc.count("chat.getChat"), { intervals: [20, 50, 100] }).toBe(0);
});

test("the wire carries CREATION INTENT ONLY — no draft carry rides along", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, START_CHAT_ROUTES);

  const component = await mount(<StartChatStory />);
  await component.getByRole("button", { name: "start chat" }).click();
  await expect(component.getByTestId("start-chat-state")).toContainText(CREATED_ID);

  // The nine-field carry (`seedGreetings`/`rosterOverrides`/`groupConfig`/`roomOverrides`/`injections`/
  // `guided`/`startAsGame`/`opening:"generate"`) was the whole reason a rowless draft had to exist. The
  // input this seam sends names the room and nothing else; every one of those config concerns is now the
  // committed verb it shadowed, reachable because the room exists.
  await expect
    .poll(() => Object.keys((trpc.lastInput("chat.startChat") ?? {}) as Record<string, unknown>).toSorted(), { intervals: [20, 50, 100] })
    .toEqual(["anchorPersonaId", "characterIds", "title"]);
});

test("a FAILED create leaves the caller where they were — no half-navigation into a room that does not exist", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.startChat": trpcError({ message: "nope" }) });

  const component = await mount(<StartChatStory />);
  const state = component.getByTestId("start-chat-state");

  await component.getByRole("button", { name: "start chat" }).click();

  // NEITHER pointer moves on a rejected create: no chat, and not even the section switch — the navigation
  // is sequenced AFTER the awaited mutation precisely so a failure cannot strand the user on an empty
  // Chats landing wondering what happened. The picker stays open on its picked cast (its own CT covers that
  // half) and the mutation's `errorToast` says why.
  await expect(state).toHaveText("chat=none section=home pending=false");
});

test("a founding cast rides through as characterIds", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, START_CHAT_ROUTES);
  // MINTED, never a hand-written literal — `typeIdSchema` validates the 26-char suffix at RUNTIME.
  const aria: CharacterId = mintTypeId(ID_PREFIX.character);

  const component = await mount(<StartChatStory characterIds={[aria]} />);
  await component.getByRole("button", { name: "start chat" }).click();
  await expect(component.getByTestId("start-chat-state")).toContainText(CREATED_ID);

  await expect
    .poll(() => (trpc.lastInput("chat.startChat") as { characterIds: string[] } | undefined)?.characterIds, { intervals: [20, 50, 100] })
    .toEqual([aria]);
});
