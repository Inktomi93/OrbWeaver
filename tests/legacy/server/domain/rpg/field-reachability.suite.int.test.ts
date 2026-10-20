// tests/server/domain/rpg/field-reachability — THE READ-SURFACE REACHABILITY SUITE (owner-ordered 2026-08-01).
//
// WHY IT EXISTS: four separate live bugs in one night were all the same class — a field the host or the model
// could WRITE that reached the model NOWHERE (the cast guides, the sheet flavor, the tracker hint/emoji, a cast
// NPC's conditions). Each was found by accident. This suite makes that class fail BY CONSTRUCTION: the field
// INVENTORY is derived mechanically from the CONTRACTS (`zodLeafPaths` over the snapshot + sheet + tracker-def
// schemas), and every leaf must either be PROVEN to reach a model-facing read surface by a probe below, or carry
// a CITED exemption. Add a column to any of those schemas and this suite reds until someone renders it or cites
// it; delete a field and the stale cite reds too (self-cleaning both ways — the D50/UNCLAIMED_SETTINGS_KEYS
// discipline).
//
// THE THREE SURFACES (the only things the model actually reads about game state):
//   • the REMINDER (`substrate/reminder.ts`) — the absolute state block injected every turn;
//   • the DELTA (`substrate/delta.ts`) — the prev→current diff rendered inside it;
//   • the MACRO/CEL FEED (`chat-ops/macro-view.ts`) — `{{rpgSceneState}}`/`{{rpgCast}}`/`{{rpgQuests}}`/
//     `{{rpgDelta}}`, the per-plane fragments a PRESET author places in their own prompt shape.
//
// The macro column was added because the feed was the SAME drift class one surface over: it carried its own
// cast/actor/ambient/quest builders, and they had decayed into a strict subset of the reminder's (no volatile
// plane on any carrier, no guides, no attribute readings, no sheet flavor, no game-subject readings, no quest
// status/description, no time-of-day, no weather description). The fix was ONE-BUILDER, not a second set of
// assertions: `macro-view.ts` now COMPOSES the reminder's exported line builders, so these probes prove the
// composition is wired on every plane and a re-grown third builder reds here. A macro needle names WHICH macro
// key carries the datum (`{ key, text }`) — "somewhere in the feed" would be exactly the hiding place this
// suite exists to close.
//
// HOW THE STATE IS BUILT: through the REAL path, never a hand-shaped view literal (hand literals are exactly
// how these gaps hid — a test that builds the view by hand asserts the renderer, not the pipeline). Every probe
// drives an `RpgExtraction` (the model's own output shape) through the production applier + accumulator merge +
// write boundary (`fakes.extractions`, `_support.ts`), a host verb (`patchSheet`/`editSnapshot`/`updateConfig`),
// and then READS the reminder off the real `gatherTurnContext`. Int-tier because the projection that produced
// three of the four bugs (`buildTrackerView`) is a db read.
//
// THE MATRIX: carrier kind (participant user · participant character · scene-npc) × field state (set/empty) × lock
// state (a `locked` def and a `fieldLocks` pin must still RENDER — D113 #4: the reminder is the model's
// KNOWLEDGE, the tools are its permissions) × pin state (the band is a panel concern; the reminder is
// pin-blind) × the config arms that gate rendering (`engaged`, `dateMode`, `recentBeatsKeepLast`,
// `trackersReadOnly`, per-carrier `max` overrides, carriage via grants/revokes).

import type { RpgDateMode, RpgTrackerDef } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { actorTrackerWriteKeys } from "#contracts/rpg/tracker.ts";
import { ACTOR_CARRIERS, CARRIERS, MANA, openGame, openingBeat, RPG_DELTA_HEADING, RPG_MACRO_KEYS, stageCast } from "./_field-reachability-support.ts";
import { expect, principal, seedLiteGame, test } from "./_support.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE STATE / LOCK / PIN / CONFIG MATRIX — the axes that gate whether a field renders at all.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

test("EMPTY state: a fresh game's read surfaces carry no phantom headers (absence, never a stub row)", async () => {
  const f = await openGame({ carrier: CARRIERS.character, trackers: [MANA] });
  // The feed stages EXACTLY the lite keys — a full-mode macro stays ABSENT so `{{rpgMap}}` resolves "" (the
  // honest empty), and an empty game's per-plane fragments are the empty STRING, never a stub header.
  const macros = await f.macros();
  expect(Object.keys(macros)).toEqual([...RPG_MACRO_KEYS]);
  expect(macros["rpgSceneState"]).toBe("");
  expect(macros["rpgQuests"]).toBe("");
  const reminder = await f.reminder();
  // The carried tracker's LABEL still reaches the model with no reading at all (carriage is the datum), but
  // nothing else invents a row.
  expect(reminder).toContain("Trackers: Mana (fuels spellcasting)");
  expect(reminder).not.toContain("Present:");
  expect(reminder).not.toContain("Active quests:");
  expect(reminder).not.toContain("Recent beats:");
  expect(reminder).not.toContain("Game trackers:");
  expect(reminder).not.toContain("Story:");
  expect(reminder).not.toContain(RPG_DELTA_HEADING);
});

test("CARRIAGE is the datum: a carried-but-unmoved tracker lists its bare label on every carrier kind", async () => {
  await Promise.all(
    ACTOR_CARRIERS.map(async (kind) => {
      const f = await openGame({ carrier: CARRIERS[kind], trackers: [MANA] });
      await f.beat(stageCast(f.carrier));
      const reminder = await f.reminder();
      expect(reminder, `${kind} must carry the unmoved tracker's label`).toContain(`${f.carrier.label} — Mana`);
    }),
  );
});

test("LOCK (D113 #4): a `locked` tracker still RENDERS in full and is ABSENT from the write schema", async () => {
  const locked: RpgTrackerDef = { ...MANA, locked: true };
  const f = await openGame({ carrier: CARRIERS.character, trackers: [locked] });
  // A locked tracker is unwritable by the model, so the host's hand seeds the reading.
  await f.beat(openingBeat(f.carrier));
  await f.handActorOps([{ op: "setTracker", key: "mana", value: { value: 7 } }]);
  const reminder = await f.reminder();
  expect(reminder).toContain("Trackers: Mana (fuels spellcasting)");
  expect(reminder).toContain("Mana 7/10");
  // The permission half: the write surface offers it nowhere.
  expect(actorTrackerWriteKeys([locked])).toEqual({ deltaKeys: [], setKeys: [] });
  expect(actorTrackerWriteKeys([MANA])).toEqual({ deltaKeys: ["mana"], setKeys: [] });
});

test("LOCK (fieldLocks): a hand-pinned value still renders AND survives the next tool write", async () => {
  const f = await openGame({ carrier: CARRIERS.character });
  await f.beat({ scene: { location: "The Bone Road" } });
  // The coarse auto-lock (the hand-edit default) pins `location`.
  await expect(f.h.service.editSnapshot({ principal: f.host, chatId: f.chatId, patch: { location: "The Crypt" } })).resolves.toEqual({ ok: true });
  await f.beat({ scene: { location: "The Docks" } });
  const reminder = await f.reminder();
  expect(reminder).toContain("Scene: The Crypt");
  expect(reminder).not.toContain("The Docks");
});

test("PIN state: the band is a panel decision — the reminder is byte-identical pinned vs unpinned", async () => {
  const drive = async (pinned: boolean): Promise<{ reminder: string; orbs: number }> => {
    const f = await openGame({ carrier: CARRIERS.character, trackers: [{ ...MANA, pinned }] });
    await f.beat({ party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "mana", value: 7 }] }] });
    const view = await f.h.service.getTrackerView({ principal: f.host, chatId: f.chatId });
    return { reminder: await f.reminder(), orbs: view.trackerOrbs.length };
  };
  const off = await drive(false);
  const on = await drive(true);
  expect(on.reminder).toBe(off.reminder);
  expect(off.orbs).toBe(0);
  expect(on.orbs).toBe(1);
});

test("READ-ONLY delivery: a game whose connection can't write state still READS the whole state block", async () => {
  const db = await freshDb();
  const carrier = CARRIERS.character;
  const { chatId, h } = await seedLiteGame(db, { participants: [...carrier.participants], trackersReadOnly: true });
  const host = await principal(db, castId<Handle>("host"));
  await h.service.updateConfig({ principal: host, chatId, patch: { trackers: [MANA] } });
  // BOTH hand doors are asserted: `trackersReadOnly` is a MODEL-write verdict, so the HOST's hand must still
  // commit here — a silently-refused edit would leave the two reads below asserting an unmoved state.
  await expect(h.service.editSnapshot({ principal: host, chatId, patch: { location: "The Crypt" } })).resolves.toEqual({ ok: true });
  // The per-actor half rides the op door (R1) — the image left `editSnapshot`'s vocabulary.
  await expect(
    h.service.patchActor({ principal: host, chatId, targetRef: carrier.actorRef, ops: [{ op: "setTracker", key: "mana", value: { value: 5 } }] }),
  ).resolves.toEqual({ ok: true });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: host.userId });
  const reminder = out?.injections[0]?.content ?? "";
  // The honest degrade (§4.6): no write path, but the hand-steered values still steer.
  expect(reminder).toContain("Scene: The Crypt");
  expect(reminder).toContain("Mana 5/10");
});

test("CONFIG dateMode: `structured` carries the day counter, `narrated` drops it (both keep time-of-day)", async () => {
  const drive = async (dateMode: RpgDateMode): Promise<string> => {
    const f = await openGame({ carrier: CARRIERS.character });
    await f.h.service.updateConfig({ principal: f.host, chatId: f.chatId, patch: { dateMode } });
    await f.beat({ scene: { day: 7, timeOfDay: "night" } });
    return f.reminder();
  };
  expect(await drive("structured")).toContain("day 7 · night");
  const narrated = await drive("narrated");
  expect(narrated).toContain("night");
  expect(narrated).not.toContain("day 7");
});

test("CONFIG recentBeatsKeepLast: 0 drops the beat block entirely; N keeps the last N", async () => {
  const drive = async (keepLast: number): Promise<string> => {
    const f = await openGame({ carrier: CARRIERS.character });
    await f.h.service.updateConfig({ principal: f.host, chatId: f.chatId, patch: { recentBeatsKeepLast: keepLast } });
    await f.beat({ scene: { recentEvent: "The first beat." } });
    await f.beat({ scene: { recentEvent: "The second beat." } });
    return f.reminder();
  };
  const off = await drive(0);
  expect(off).not.toContain("Recent beats:");
  const one = await drive(1);
  expect(one).toContain("- The second beat.");
  expect(one).not.toContain("The first beat.");
});

test("CONFIG engaged=false: the whole read surface goes silent (byte-identical no-op, rows preserved)", async () => {
  const f = await openGame({ carrier: CARRIERS.character, trackers: [MANA] });
  await f.beat({ scene: { location: "The Bone Road" } });
  await f.h.service.updateConfig({ principal: f.host, chatId: f.chatId, patch: { engaged: false } });
  expect(await f.reminder()).toBe("");
  await f.h.service.updateConfig({ principal: f.host, chatId: f.chatId, patch: { engaged: true } });
  expect(await f.reminder()).toContain("The Bone Road");
});

test("CONFIG hiddenContentReveal is a HOST-plane knob: it never changes what the model reads", async () => {
  const drive = async (hiddenContentReveal: boolean): Promise<string> => {
    const f = await openGame({ carrier: CARRIERS.character });
    await f.h.service.updateConfig({ principal: f.host, chatId: f.chatId, patch: { hiddenContentReveal } });
    await f.beat({ scene: { location: "The Bone Road" } });
    return f.reminder();
  };
  expect(await drive(true)).toBe(await drive(false));
});

test("the participant/cast SPLIT is total: the same write reaches the model on a participant actor AND a scene NPC", async () => {
  // The parity claim in one place: whatever plane a beat writes, the carrier kind must not decide whether the
  // model gets to see it. (`a4188c3a6f` fixed conditions on this axis; the volatile planes followed.)
  await Promise.all(
    ACTOR_CARRIERS.map(async (kind) => {
      const f = await openGame({ carrier: CARRIERS[kind] });
      await f.beat({
        ...stageCast(f.carrier),
        party: [{ targetRef: f.carrier.targetRef, status: "bleeding badly", addCondition: { name: "poisoned" } }],
        inventory: [{ targetRef: f.carrier.targetRef, add: [{ name: "rope" }], walletDeltas: [{ name: "gold", delta: 12 }] }],
      });
      const reminder = await f.reminder();
      for (const needle of ["bleeding badly", "conditions: poisoned", "carrying: rope", "12 gold"]) {
        expect(reminder, `${kind}: the model must read ${needle}`).toContain(needle);
      }
    }),
  );
});

test("actorRefKey is the ONE join: a tool write on a participant NAME lands under the ref the view reads", async () => {
  // The addressing cite's proof — the reason `actorRef.*` is exempt from the read surfaces is that the NAME is
  // the datum and the ref is the join; if that join broke, every probe above would still pass on `npc:` rows.
  const f = await openGame({ carrier: CARRIERS.user });
  await f.beat({ party: [{ targetRef: "player", status: "winded" }] }); // a self-alias, not the participant name
  const view = await f.h.service.getTrackerView({ principal: f.host, chatId: f.chatId });
  const you = view.actors.find((a) => actorRefKey(a.actorRef) === "user:user_host");
  expect(you?.volatile?.status).toBe("winded");
  expect(await f.reminder()).toContain("- You — winded");
});
