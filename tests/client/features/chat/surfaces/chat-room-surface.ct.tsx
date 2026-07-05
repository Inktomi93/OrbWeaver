// CT: the composed chat-room pane (transcript + composer) — the surface that was untested before this
// task. Two shapes: a SEEDED DRAFT (the new-chat-with-character landing) renders the empty transcript +
// the live composer WITHOUT ever reading the server (the ChatHandle discriminant is the gate — no
// `listMessages` call for a draft, skipToken in spirit); a COMMITTED chat reads canon (routeTrpc stubs
// `chat.listMessages`) and renders the rows beside the composer.
//
// NOTE: `chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the draft case asserts it is NEVER
// hit (the surface must not fetch for a chat with no server row yet).

import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatRoomSurfaceStory } from "../_ct-stories";
import { makeMessageView } from "../fixtures";

const CANON = [
  makeMessageView({
    id: castId<MessageId>("msg_room_user"),
    role: "user",
    content: "Hi Aria",
    seq: 1,
  }),
  makeMessageView({
    id: castId<MessageId>("msg_room_ai"),
    role: "assistant",
    content: "Well met, traveller.",
    seq: 2,
  }),
];

test("a seeded draft renders the empty transcript + the live composer, with no server read", async ({
  mount,
  page,
}) => {
  let listMessagesCalls = 0;
  await routeTrpc(page, {
    "chat.listMessages": () => {
      listMessagesCalls += 1;
      return [];
    },
  });

  const component = await mount(<ChatRoomSurfaceStory committed={false} />);

  // The draft transcript is empty and the composer is present + typeable.
  await expect(component.getByText("No messages yet.")).toBeVisible();
  await expect(component.getByTestId(testId("composer"))).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Message" })).toBeVisible();
  // The discriminant gate held — a draft NEVER read the server.
  expect(listMessagesCalls).toBe(0);
});

test("a committed chat reads canon and renders the rows beside the composer", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.listMessages": CANON });

  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

  await expect(component.getByText("Hi Aria")).toBeVisible();
  await expect(component.getByText("Well met, traveller.")).toBeVisible();
  await expect(component.getByTestId(testId("composer"))).toBeVisible();
});
