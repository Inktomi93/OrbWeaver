// tests/server/domain/rpg/verbs/game/resync-from-story — the HOST resync escape hatch (crunchy-cluster §1.3,
// W-C). SECURITY-SENSITIVE: this is a NEW host-principal MODEL-CALL site (the consent seam). The load-bearing
// proofs:
//   • HOST-ONLY — a non-member gets leak-free NOT_FOUND, a present non-host member gets FORBIDDEN, BEFORE any
//     model call (a member can never trigger the host-principal model call — the principal-laundering hole this
//     gate closes).
//   • THE PRINCIPAL SEAM — the model call resolves UNDER the room HOST's userId (the caller, whom `resolveHost`
//     confirmed IS the host), never a caller-injected foreign id.
//   • THE REBUILD — a drifted state + resync → corrected (the delta merges onto the base, locks honored, written
//     BORN COMMITTED as a message-less HAND row, D124).
//   • THE DEEP READ — the injected `resolveCanonWindow` fired with the deep budget (the story feed).
//   • A no-op rebuild (empty delta / readonly connection) writes nothing.
//   • THE RECONCILER SHAPE (VER-1a) — the rebuild lands state ONLY: the journal archive is never appended to,
//     so repeated clicks cannot grow the panel. (The end-to-end idempotence proof, over the REAL fold + the
//     real append semantics `resyncStatePatch` un-appends, lives in `tests/server/entry/compose/rpg.int`.)

import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, seedMessage, test, turnConnection } from "../../_support";

test("HOST rebuild: a drifted state + resync → corrected (born-committed as a message-less HAND row)", async () => {
  const db = await freshDb();
  // The panel has DRIFTED via a prior MODEL flush (an unlocked model write — NOT a hand-pin). The resync's
  // rebuild corrects it. (A hand-edited lock is a separate case — the next test proves the lock wins.)
  const resyncDelta = {
    statePatch: { location: "the corrected throne room" },
    journal: [{ type: "location", label: "", title: "Resync", content: "Re-derived from the story." }],
  };
  const { chatId, gameId, h } = await seedLiteGame(db, {
    resyncDelta,
    toolRoundDelta: { statePatch: { location: "the STALE dungeon" }, journal: [] },
    // A non-empty deep window the injected op returns (the story the rebuild reads).
    canonWindow: [{ role: "assistant", speakerName: "GM", content: "The throne room glitters.", tokens: 6 }],
  });
  // A prior model beat drifted the (unlocked) tracked location.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_drift"), turnConnection());
  h.fakes.busEvents.length = 0;

  await h.service.resyncFromStory({ principal: principal("host"), chatId });

  // The deep window was read with the resync budget (a real, non-trivial token cap).
  expect(h.fakes.canonWindowReads).toHaveLength(1);
  expect(h.fakes.canonWindowReads[0]?.chatId).toBe(chatId);
  expect(h.fakes.canonWindowReads[0]?.maxTokens).toBeGreaterThan(1024);
  // The rebuild ran UNDER the room host's userId (the caller = the host; never a caller-injected foreign id).
  expect(h.fakes.resyncCalls).toEqual([{ chatId, hostUserId: "user_host", windowTokens: 1 }]);
  // D124: the rebuild posts NOTHING to canon — the reconciled state is a message-less hand row.
  expect(h.fakes.narratorPosts).toEqual([]);
  // The panel reads back the CORRECTED state (the drift is healed).
  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  expect(view.ambient?.location).toBe("the corrected throne room");
  // §4.9: the resync emitted snapshotPatched — and ONLY that. The rebuild does not write the journal (VER-1a:
  // the archive is the live turns' append-only record; a reconciler that appended to it could never be
  // idempotent, and the host clicks resync repeatedly), so there is no `journalChanged` and no entry.
  expect(h.fakes.busEvents.map((e) => e.type)).toEqual(["snapshotPatched"]);
  expect(await h.service.listJournal({ principal: principal("host"), chatId, limit: 50 })).toEqual([]);
  expect(gameId).toBeDefined();
});

test("a locked field SURVIVES a resync (the host's pin is never clobbered by the rebuild)", async () => {
  const db = await freshDb();
  // The rebuild tries to overwrite the location, but the host PINNED it by hand-editing → the pin wins.
  const resyncDelta = { statePatch: { location: "the rebuild's location" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { resyncDelta, canonWindow: [{ role: "assistant", speakerName: "GM", content: "story", tokens: 2 }] });
  // A hand edit AUTO-LOCKS the touched field (manual-edit-wins) — the resync must honor it.
  await h.service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "the HAND-PINNED hall" } });

  await h.service.resyncFromStory({ principal: principal("host"), chatId });

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  expect(view.ambient?.location).toBe("the HAND-PINNED hall"); // the lock held — the rebuild never clobbered the pin
});

test("AUTHORITY: a non-member gets leak-free NOT_FOUND — BEFORE any model call", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { resyncDelta: { statePatch: { location: "x" }, journal: [] } });
  // `user_stranger` is not in the membership map → the leak-free collapse.
  await expect(h.service.resyncFromStory({ principal: principal("stranger"), chatId })).rejects.toBeInstanceOf(DomainNotFoundError);
  // The host-principal model call NEVER fired (a member/stranger can't trigger it) — and no state was written.
  expect(h.fakes.resyncCalls).toEqual([]);
  expect(h.fakes.canonWindowReads).toEqual([]);
  expect(h.fakes.narratorPosts).toEqual([]);
});

test("AUTHORITY: a present NON-HOST member gets FORBIDDEN — the model call never fires", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { resyncDelta: { statePatch: { location: "x" }, journal: [] } });
  h.fakes.membership.set("user_member", "member"); // a present member, but NOT the host

  await expect(h.service.resyncFromStory({ principal: principal("member"), chatId })).rejects.toBeInstanceOf(DomainForbiddenError);
  // A member can NEVER trigger the host-principal model call (the principal-laundering hole this gate closes).
  expect(h.fakes.resyncCalls).toEqual([]);
  expect(h.fakes.narratorPosts).toEqual([]);
});

test("a no-op rebuild (empty delta) writes NOTHING — no slot, no snapshot, no emit", async () => {
  const db = await freshDb();
  // The resync fake returns the DEFAULT empty delta (a readonly connection / model no-op).
  const { chatId, h } = await seedLiteGame(db, { canonWindow: [{ role: "assistant", speakerName: "GM", content: "story", tokens: 2 }] });
  h.fakes.busEvents.length = 0;

  const result = await h.service.resyncFromStory({ principal: principal("host"), chatId });

  // The model call still fired (host resolved it), but produced nothing → no anchor slot, no snapshot, no emit.
  expect(h.fakes.resyncCalls).toHaveLength(1);
  expect(h.fakes.narratorPosts).toEqual([]);
  expect(h.fakes.busEvents).toEqual([]);
  // …and the DOOR SAYS SO. A rebuild that changed nothing is `rebuilt:false`, never an undifferentiated
  // "done" — the host clicked a button that costs money and seconds and is owed the outcome.
  expect(result).toEqual({ ok: true, rebuilt: false });
});

// ── THE DOOR IS LOUD (RESYNC-OR) ─────────────────────────────────────────────────────────────────────
// The resync returned `void`, so BOTH a provider refusal and a genuine no-change rendered identically: the
// host saw the button settle and the panel not move. Live: every resync on the default hosted backend 400'd
// at the provider, `rpg.resync.failed` logged server-side, and the client reported success. The verb now
// returns the outcome as DATA (`ResyncResult`, the `HandDoorResult` grammar) and the client toasts it.
test("a REBUILT resync reports ok:true rebuilt:true (the client's success signal)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, {
    resyncDelta: { statePatch: { location: "the corrected hall" }, journal: [] },
    canonWindow: [{ role: "assistant", speakerName: "GM", content: "story", tokens: 2 }],
  });

  expect(await h.service.resyncFromStory({ principal: principal("host"), chatId })).toEqual({ ok: true, rebuilt: true });
});

test("a FAILED round is surfaced as data — the reason reaches the caller, never a silent 'nothing to resync'", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { canonWindow: [{ role: "assistant", speakerName: "GM", content: "story", tokens: 2 }] });
  h.fakes.resyncRefusal = { ok: false, reason: "the model call failed: openrouter structured item 0 failed" };
  h.fakes.busEvents.length = 0;

  const result = await h.service.resyncFromStory({ principal: principal("host"), chatId });

  expect(result).toEqual({ ok: false, reason: "the model call failed: openrouter structured item 0 failed" });
  // A failed round writes NOTHING (the pre-existing no-op tail is unchanged) — the only change is that it SAYS so.
  expect(h.fakes.busEvents).toEqual([]);
  expect(h.fakes.narratorPosts).toEqual([]);
});
