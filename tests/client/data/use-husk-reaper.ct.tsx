// CT: `useHuskReaper` — the nav-away arm of husk GC (D166).
//
// A chat row exists from the creation click, so a user who starts a room and immediately leaves has minted
// a row nobody claimed. This hook, mounted ONCE at the app root, turns the active-chat store's
// `subscribeHuskAbandoned` publication into a best-effort `chat.reapHusk`.
//
// THE THREE PROPERTIES THAT MATTER ARE ALL NEGATIVE ONES, which is why they need pins: it must fire only
// for a room this device CREATED, it must NEVER block or divert navigation, and it must NEVER surface an
// error. A failed reap (offline, a race with a claim, a room that turned out to be real) is a non-event the
// user cannot act on and did not ask for — the 24h TTL sweep is the actual guarantee. The
// composer-text SKIP is the store's half and is pinned in tests/client/state/active-chat-store.ct.tsx.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import { HuskReaperStory } from "./_ct-stories.tsx";

const HUSK_ID = "chat_ct_husk_probe";

test("leaving a room this device CREATED fires chat.reapHusk for exactly that room", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.reapHusk": null });

  const component = await mount(<HuskReaperStory />);
  const state = component.getByTestId("husk-state");

  await component.getByRole("button", { name: "enter created" }).click();
  await expect(state).toHaveText(`chat=${HUSK_ID} notified=none`);
  // Entering fires nothing — the user is in the room they just made.
  await expect.poll(() => trpc.count("chat.reapHusk"), { intervals: [20, 50, 100] }).toBe(0);

  await component.getByRole("button", { name: "leave" }).click();

  await expect(state).toHaveText("chat=none notified=none");
  await expect.poll(() => trpc.count("chat.reapHusk"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.reapHusk"), { intervals: [20, 50, 100] }).toEqual({ chatId: HUSK_ID });
});

test("a FAILED reap neither blocks the navigation nor surfaces anything (fire-and-forget)", async ({ mount, page }) => {
  // The offline / raced-with-a-claim arm. The verb re-checks `started_at IS NULL` server-side and no-ops
  // otherwise, so a wrong guess costs one cheap round-trip — and a rejected one costs nothing at all.
  const trpc = await routeTrpc(page, { "chat.reapHusk": trpcError({ message: "the network is a lie" }) });

  const component = await mount(<HuskReaperStory />);
  const state = component.getByTestId("husk-state");

  await component.getByRole("button", { name: "enter created" }).click();
  await expect(state).toHaveText(`chat=${HUSK_ID} notified=none`);

  await component.getByRole("button", { name: "leave" }).click();

  // The navigation COMPLETED (the store had already moved on before the listener ran) …
  await expect(state).toHaveText("chat=none notified=none");
  // … the call went out …
  await expect.poll(() => trpc.count("chat.reapHusk"), { intervals: [20, 50, 100] }).toBe(1);
  // … and its rejection stayed silent. The mutation carries NO `errorToast` precisely for this: a toast
  // here would report a failure the user cannot act on, about a room they had already left.
  await expect(state).toHaveText("chat=none notified=none");
});
