// substrate/consent-prompt — the aggregate "your plugins are waiting on you" ask (#1041, the second half of
// #924), driven through the REAL verbs that raise and answer it.
//
// THE DEFECT (owner dogfood, 2026-08-30): a fresh boot lands nine example plugins installed, disabled, with
// an empty grant and `pending_reconsent` raised, and NOTHING ever asked the user for consent — the only path
// was to guess that Settings → Plugins held the grant rows. A capability grant the user never saw is not
// consent. RED-FIRST RECEIPT (2026-09-05, against `git show HEAD:` sources for the three touched plugin
// verbs + `substrate/consent-prompt.ts` removed): every test below failed with `notified` EMPTY — the verbs
// raised `pendingReconsent` and told nobody.
//
// The ops are RECORDED rather than wired to the real notifications service on purpose: this file pins what
// the PRODUCER decides (which move, for whom, with what count). What the moves do to the durable inbox is
// `tests/server/domain/notifications/verbs/standing.int.test.ts`, and the two ends are joined for real —
// real verbs, real notifications service, the nine real bundles — in
// `tests/server/entry/boot/seed-example-plugins.int.test.ts`.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHostOps } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

/** One recorded move on the standing-ask seam — which verb of the trio, and what it carried. */
interface Move {
  readonly move: "emit" | "refresh" | "retract";
  readonly recipientUserId: UserId;
  readonly pendingCount: number | null;
}

function recordingConsentOps(): { readonly ops: PluginHostOps; readonly moves: Move[] } {
  const base = makeInertOps();
  const moves: Move[] = [];
  const push = (move: Move["move"], event: NotificationEvent): void => {
    moves.push({
      move,
      recipientUserId: event.recipientUserId,
      pendingCount: event.type === "plugins-awaiting-consent" ? event.pendingCount : null,
    });
  };
  const ops: PluginHostOps = {
    ...base,
    notifications: {
      ...base.notifications,
      emitStanding: (event): Promise<void> => {
        push("emit", event);
        return Promise.resolve();
      },
      refreshStanding: (event): Promise<void> => {
        push("refresh", event);
        return Promise.resolve();
      },
      retractStanding: (req: { readonly recipientUserId: UserId; readonly type: NotificationType }): Promise<void> => {
        moves.push({ move: "retract", recipientUserId: req.recipientUserId, pendingCount: null });
        return Promise.resolve();
      },
    },
  };
  return { ops, moves };
}

test("the seeded sequence RAISES the ask, and a second ungranted plugin re-raises it with the new count", async () => {
  const db = await freshDb();
  const { ops, moves } = recordingConsentOps();
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  // The seeder's own two calls, verbatim: install with an empty grant, then the empty RE-GRANT that raises
  // the standing ask (`entry/boot/seed-example-plugins.ts`).
  const first = await h.service.install({ caller, bundle: makeBundle({ id: "aa", capabilities: ["chat.read"] }), grant: [] });
  // The install itself asks nothing — a fresh install has nothing to re-consent to, so it raises nothing.
  expect(moves).toEqual([]);

  await h.service.setGrant({ caller, pluginId: first.id, grant: [], acknowledgedNetHosts: [] });
  expect(moves).toEqual([{ move: "emit", recipientUserId: owner, pendingCount: 1 }]);

  const second = await h.service.install({ caller, bundle: makeBundle({ id: "bb", capabilities: ["chat.read"] }), grant: [] });
  await h.service.setGrant({ caller, pluginId: second.id, grant: [], acknowledgedNetHosts: [] });
  // A NEW ask is new information: it re-raises (a fresh row + a fresh badge), carrying the count of ALL
  // pending rows, not just this one.
  expect(moves.at(-1)).toEqual({ move: "emit", recipientUserId: owner, pendingCount: 2 });
});

test("answering LOWERS the ask quietly, and answering the LAST one retracts it", async () => {
  const db = await freshDb();
  const { ops, moves } = recordingConsentOps();
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  const first = await h.service.install({ caller, bundle: makeBundle({ id: "aa", capabilities: ["chat.read"] }), grant: [] });
  const second = await h.service.install({ caller, bundle: makeBundle({ id: "bb", capabilities: ["chat.read"] }), grant: [] });
  await h.service.setGrant({ caller, pluginId: first.id, grant: [], acknowledgedNetHosts: [] });
  await h.service.setGrant({ caller, pluginId: second.id, grant: [], acknowledgedNetHosts: [] });
  moves.length = 0;

  // A COVERING grant settles that row: one ask left, and the standing row is corrected IN PLACE — a
  // `refresh`, never an `emit`. Re-badging the bell on every grant is the re-prompt loop this must not be.
  await h.service.setGrant({ caller, pluginId: first.id, grant: ["chat.read"], acknowledgedNetHosts: [] });
  expect(moves).toEqual([{ move: "refresh", recipientUserId: owner, pendingCount: 1 }]);

  // The last answer takes the ask away rather than leaving a row that points at a settled screen.
  await h.service.setGrant({ caller, pluginId: second.id, grant: ["chat.read"], acknowledgedNetHosts: [] });
  expect(moves.at(-1)).toEqual({ move: "retract", recipientUserId: owner, pendingCount: null });
});

test("a PARTIAL grant leaves the ask standing — the count is corrected, not withdrawn", async () => {
  const db = await freshDb();
  const { ops, moves } = recordingConsentOps();
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  const installed = await h.service.install({
    caller,
    bundle: makeBundle({ id: "aa", capabilities: ["chat.read", "storage.kv"] }),
    grant: [],
  });
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });
  moves.length = 0;

  await h.service.setGrant({ caller, pluginId: installed.id, grant: ["chat.read"], acknowledgedNetHosts: [] });
  expect((await h.service.list({ caller }))[0]?.reconsentPending).toBe(true);
  expect(moves).toEqual([{ move: "refresh", recipientUserId: owner, pendingCount: 1 }]);
});

test("REMOVING an unanswered plugin withdraws its question — the ask never counts a row that is gone", async () => {
  const db = await freshDb();
  const { ops, moves } = recordingConsentOps();
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  const first = await h.service.install({ caller, bundle: makeBundle({ id: "aa", capabilities: ["chat.read"] }), grant: [] });
  const second = await h.service.install({ caller, bundle: makeBundle({ id: "bb", capabilities: ["chat.read"] }), grant: [] });
  await h.service.setGrant({ caller, pluginId: first.id, grant: [], acknowledgedNetHosts: [] });
  await h.service.setGrant({ caller, pluginId: second.id, grant: [], acknowledgedNetHosts: [] });
  moves.length = 0;

  await h.service.uninstall({ caller, pluginId: first.id });
  expect(moves).toEqual([{ move: "refresh", recipientUserId: owner, pendingCount: 1 }]);

  await h.service.uninstall({ caller, pluginId: second.id });
  expect(moves.at(-1)).toEqual({ move: "retract", recipientUserId: owner, pendingCount: null });
});

test("a reach-WIDENING upgrade raises the ask; the count is the OWNER's, per owner", async () => {
  const db = await freshDb();
  const { ops, moves } = recordingConsentOps();
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const caller = ownerPrincipalFor(owner);

  // The other user's own ungranted plugin must never be counted into this owner's ask: plugins are
  // user-scoped (D147), so the aggregate is derived per ROW OWNER and never as a deployment singleton.
  const theirs = await h.service.install({
    caller: ownerPrincipalFor(other),
    bundle: makeBundle({ id: "cc", capabilities: ["chat.read"] }),
    grant: [],
  });
  await h.service.setGrant({ caller: ownerPrincipalFor(other), pluginId: theirs.id, grant: [], acknowledgedNetHosts: [] });
  expect(moves).toEqual([{ move: "emit", recipientUserId: other, pendingCount: 1 }]);
  moves.length = 0;

  const mine = await h.service.install({ caller, bundle: makeBundle({ id: "dd", capabilities: ["chat.read"] }), grant: ["chat.read"] });
  expect(moves).toEqual([]);

  await h.service.upgrade({
    caller,
    pluginId: mine.id,
    bundle: makeBundle({ id: "dd", version: "1.1.0", capabilities: ["chat.read", "storage.kv"] }),
  });
  expect(moves).toEqual([{ move: "emit", recipientUserId: owner, pendingCount: 1 }]);
});
