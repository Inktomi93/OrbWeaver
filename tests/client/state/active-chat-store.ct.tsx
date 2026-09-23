// active-chat-store CT — drives the hook-backed active-chat store through its module actions and asserts
// the read hooks reflect each transition. Same probe posture as shell-store.ct.tsx (the store's read API is
// hook-only, so a browser render is the way to exercise it).
//
// THE LOAD-BEARING SEAM is the HUSK publication (D166): a
// room this device CREATED and then left, without unsent composer text, is published to
// `subscribeHuskAbandoned` — which is all the store does. It never calls the verb, never decides husk-ness
// (the server re-checks `started_at IS NULL`), and never blocks the navigation it publishes during.
//
// The old sessionKey/`commitDraft` discipline these tests were built around is gone: there is no
// draft→committed promotion to survive, because a chat row exists from the creation click.

import { expect, test } from "@playwright/experimental-ct-react";
import { ActiveChatStoreProbe } from "./_ct-stories.tsx";

test("selectChat makes an existing chat active; goToLanding returns to the landing handle", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // At rest: the LANDING handle (nothing selected — J1).
  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=none");

  await probe.getByRole("button", { name: "select chat" }).click();
  await expect(state).toHaveText("handle=committed:chat_probe_select openOverlayPanel=none reaped=none");
  await probe.getByRole("button", { name: "inspect active chat" }).click();
  await expect(probe.getByTestId("active-chat-inspection")).toHaveText("active=chat_probe_select");

  await probe.getByRole("button", { name: "migrate active chat" }).click();
  await expect(probe.getByTestId("active-chat-inspection")).toHaveText("migrated=chat_01m02xhnwkeh7s32mxccy1x17f");

  await probe.getByRole("button", { name: "go landing" }).click();
  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=none");
});

// #1662 — `resumeChat` is `selectChat` PLUS the section landing, and the section half is the whole reason
// it exists: the Characters plane's two resume doors (the library row's Chat CTA and the landing's
// Recently-chatted faces) both fire it from a section that is not Chats, and a bare `selectChat` there
// leaves a room quietly active behind a library the reader is still looking at. BOTH halves are asserted,
// because either alone is satisfied by the wrong action.
test("resumeChat makes the room active AND lands in Chats — the cross-section intent, both halves", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");
  const section = probe.getByTestId("active-section");

  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=none");
  // The control: the store starts somewhere that is NOT chats, so "landed in chats" is a transition rather
  // than a default this test happened to read.
  await expect(section).not.toHaveText("section=chats");

  await probe.getByRole("button", { name: "resume chat", exact: true }).click();
  await expect(state).toHaveText("handle=committed:chat_probe_select openOverlayPanel=none reaped=none");
  await expect(section).toHaveText("section=chats");
});

test("a room CREATED here and then left is published as a husk-reap candidate — exactly once", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "enter created chat" }).click();
  // Entering it publishes NOTHING — the user is in the room they just made.
  await expect(state).toHaveText("handle=committed:chat_probe_created openOverlayPanel=none reaped=none");

  // Leaving it is the signal.
  await probe.getByRole("button", { name: "go landing" }).click();
  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=chat_probe_created");

  // The candidate is FORGOTTEN once published: navigating again must not re-publish it (a reap is
  // idempotent server-side, but a store that re-fires forever is a leak of its own).
  await probe.getByRole("button", { name: "select chat" }).click();
  await expect(state).toHaveText("handle=committed:chat_probe_select openOverlayPanel=none reaped=chat_probe_created");
});

test("a room merely OPENED (never created here) is never published", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select chat" }).click();
  await probe.getByRole("button", { name: "go landing" }).click();
  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=none");
});

test("UNSENT COMPOSER TEXT suppresses the reap — the user may come back, and the TTL belt covers them", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "enter created chat" }).click();
  await probe.getByRole("button", { name: "type in created room" }).click();

  await probe.getByRole("button", { name: "go landing" }).click();
  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=none");
});

test("a DELETED created room is dropped as a candidate — nothing is left to reap", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "enter created chat" }).click();
  // The reap landed (or a host deleted it elsewhere): `chatDeleted` returns the room to landing AND clears
  // the candidate, so the next navigation cannot fire a reap for a row that no longer exists.
  await probe.getByRole("button", { name: "delete created chat" }).click();
  await expect(state).toHaveText("handle=landing openOverlayPanel=none reaped=none");

  await probe.getByRole("button", { name: "select chat" }).click();
  await expect(state).toHaveText("handle=committed:chat_probe_select openOverlayPanel=none reaped=none");
});

test("selectChatFromList selects the chat AND closes the LIST slide-over (dual-write)", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open list sheet" }).click();
  await expect(state).toContainText("openOverlayPanel=list");

  await probe.getByRole("button", { name: "select from list" }).click();
  await expect(state).toHaveText("handle=committed:chat_probe_list openOverlayPanel=none reaped=none");
});

test("chatDeletedFromList is a no-op unless the deleted chat IS the active one", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select from list" }).click();
  await expect(state).toContainText("handle=committed:chat_probe_list");

  // A different chat got deleted elsewhere — the active room must NOT be yanked to landing.
  await probe.getByRole("button", { name: "delete other chat" }).click();
  await expect(state).toContainText("handle=committed:chat_probe_list");

  // The ACTIVE chat got deleted — return to landing so the room never points at a dropped chat.
  await probe.getByRole("button", { name: "delete active chat" }).click();
  await expect(state).toContainText("handle=landing");
});

test("openNewChatPicker PRE-ARMS the shared picker instead of creating anything — and it is cleared, never left armed", async ({ mount, page }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");
  const intent = page.getByTestId("new-chat-intent");

  await expect(intent).toHaveText("modal=none temporary=none");

  // ONE creation ceremony: a creation-only parameter (the home temp tile's `temporary`) opens the SHARED
  // new-chat modal carrying it — it does NOT start a chat behind the picker's back.
  await probe.getByRole("button", { name: "open picker temp" }).click();
  await expect(intent).toHaveText("modal=newChat temporary=true");
  await expect(state).toContainText("handle=landing");

  // The picker clears it when it unmounts, so a later plain "New chat" cannot inherit the intent.
  await probe.getByRole("button", { name: "clear intent" }).click();
  await expect(intent).toHaveText("modal=newChat temporary=none");
});
