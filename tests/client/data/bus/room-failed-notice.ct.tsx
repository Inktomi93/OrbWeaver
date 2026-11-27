// Entry: the app root's `useOrbSocket` + `useUserBus` (the story's `CtUserBus`), fed a `roomFailed` control frame by the
// stubbed socket. Layer: Playwright CT. Red: `roomRegistry.failed` dropping the frame's code (a mapped code then toasts
// the server's sentence) or `roomFailureNotice` losing a branch.

import { routeOrbSocket, routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { roomFailureNotice } from "#client/data/bus/room-failure-notice.ts";
import type { RoomFailedStory } from "./_room-failed-stories.tsx";

const SERVER_SENTENCE = "The server's own sentence for this room.";

// The four codes the room hook words itself, each toasted instead of the server's sentence.
const WORDED = ["FORBIDDEN", "NOT_FOUND", "SERVICE_UNAVAILABLE", "TOO_MANY_REQUESTS"] as const;

for (const code of [...WORDED, "PRECONDITION_FAILED"] as const) {
  test(`a roomFailed ${code} frame toasts what the room hook says for that code`, async ({ page, mount }) => {
    await routeTrpc(page, {
      "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    const socket = await routeOrbSocket(page, {
      awaitRooms: [{ channel: "user" }],
      frames: [{ channel: "control", type: "roomFailed", ref: { channel: "user" }, code, message: SERVER_SENTENCE }],
    });
    await mount<typeof RoomFailedStory>("tests/client/data/bus/_room-failed-stories/RoomFailedStory", {});
    await socket.served();
    const said = roomFailureNotice(code, SERVER_SENTENCE);
    expect(said === SERVER_SENTENCE).toBe(code === "PRECONDITION_FAILED");
    await expect(page.getByText(said, { exact: true })).toBeVisible();
  });
}
