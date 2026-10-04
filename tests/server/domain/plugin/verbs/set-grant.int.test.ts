// verb: setGrant — the RE-CONSENT act (02 §2/§4). Before this verb the re-consent loop could not close:
// `upgrade` intersects the prior grant with the newly-declared set (so a new capability lands NOT granted) and
// `setEnabled` activates with the STORED grant and recomputes nothing, so the only way to allow a
// newly-declared capability was uninstall + reinstall — which also drops the plugin's `storage.kv` rows. It
// failed CLOSED, so it was a dead end plus a comment that overstated a security mechanism, not a hole.
//
// What these pins hold, and each is the thing a later "simplification" would break:
//   • the LOOP CLOSES — upgrade → setGrant → setEnabled activates WITH the newly-declared capability;
//   • re-grant is NOT enabling and enabling is NOT re-granting (the two inversions, both directions pinned);
//   • the running instance can never enforce a superseded grant (a narrowing restarts the resident);
//   • the ANTI-TOCTOU echo: `net.fetch` is the one capability whose reach the owner does not type, so a
//     manifest that moved under a rendered consent screen must not arm a host nobody confirmed.

import type { PluginCapability } from "@orb/contracts/plugin";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CapabilityNotGrantedError, PluginNetHostsUnacknowledgedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { afterEach, describe } from "vitest";
import { __terminateManagedPluginBrokerForTest } from "../../../../../packages/server/src/infra/plugin-host/process-runtime.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("THE LOOP CLOSES: upgrade declares a new capability → setGrant allows it → enabling activates WITH it", async () => {
  // The defect proof. Pre-fix there was no verb to call here at all: `setEnabled` takes `{pluginId, enabled}`
  // and activates with `existing.grantedCapabilities`, so the newly-declared `notify` could never be granted
  // without uninstall + reinstall (which also drops the plugin's storage.kv rows).
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read", "notify"] }),
  });
  // The upgrade's own posture: disabled, and the new capability is NOT granted (the intersection).
  expect(upgraded.status).toBe("disabled");
  expect(upgraded.grantedCapabilities).toEqual(["chat.read"]);
  expect(upgraded.declaredCapabilities).toEqual(["chat.read", "notify"]); // the ASK is now projected

  const regranted = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["chat.read", "notify"],
    acknowledgedNetHosts: [],
  });
  expect(regranted.grantedCapabilities).toEqual(["chat.read", "notify"]);
  expect(regranted.status).toBe("disabled"); // re-grant is NOT enabling

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(h.port.created.at(-1)?.grants).toEqual(["chat.read", "notify"]); // the guest runs with the re-consented set
});

test("re-grant never enables a disabled plugin, and enabling never re-grants", async () => {
  // Both directions. An enable that recomputed the grant would silently widen authority on every restart; a
  // re-grant runs the plugin only when the owner's approval asks it to (`enable`), never by itself.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read", "notify"] }),
    grant: ["chat.read"],
  });

  const regranted = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["chat.read", "notify"],
    acknowledgedNetHosts: [],
  });
  expect(regranted.status).toBe("disabled");
  expect(h.port.created.length).toBe(0); // nothing was activated by the consent act

  // …and the reverse: enabling a plugin whose manifest declares MORE than the grant does not widen it.
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  const narrow = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["chat.read"],
    acknowledgedNetHosts: [],
  });
  expect(narrow.grantedCapabilities).toEqual(["chat.read"]);
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(h.port.created.at(-1)?.grants).toEqual(["chat.read"]); // still the STORED grant, not the declared set
});

test("re-granting an ENABLED plugin restarts the resident so the running grants match the row", async () => {
  // A resident guest's grants are fixed at activation (`createInstance({grants})` → the membrane's capability
  // set), so a NARROWING written while an instance is resident would not take effect until the next restart —
  // a consent bug wearing a race's clothes.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read", "notify"] }),
    grant: ["chat.read", "notify"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(h.port.created.at(-1)?.grants).toEqual(["chat.read", "notify"]);

  const narrowed = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["chat.read"],
    acknowledgedNetHosts: [],
  });

  expect(narrowed.status).toBe("enabled"); // the enabled state the owner already chose is RESTORED, not implied
  expect(h.port.disposed.length).toBe(1); // the instance holding the wider grant was torn down
  expect(h.port.created.at(-1)?.grants).toEqual(["chat.read"]); // and came back under the narrowed one
});

// #698 FOLLOW-UP — THE UNIFORM-WITHHOLD DIVERGENCE. A standing re-consent withholds its hosts from the egress
// wall at EVERY activation site, decided only by whether the ask is fully answered — never by whether the row
// happened to be enabled. This pins the divergence a fail-open audit found: a PARTIAL re-grant (net.fetch
// re-confirmed WITH the full host echo, but ANOTHER capability of the same update left pending) of an already-
// ENABLED row used to reactivate with the FULL declared reach, restoring a host that was echoed but not fully
// consented — while the same partial re-grant on a DISABLED row, then enable, withheld it. Same consent state,
// different reach. Now uniform: the still-unanswered host stays off the wall until a COVERING grant clears it.
test("a PARTIAL re-grant of an ENABLED row does NOT restore the withheld host (uniform withhold, #698 follow-up)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  // v2 widens BOTH a capability (notify) AND a host (collector) — so a partial answer is possible.
  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({
      id: "pp",
      version: "1.1.0",
      capabilities: ["net.fetch", "notify"],
      netHosts: ["api.vendor.example", "collector.attacker.example"],
    }),
  });
  // Turn it ON while the re-consent stands — the switch the surface leaves live. Wall carries the consented set.
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(h.port.created.at(-1)?.netHosts).toEqual(["api.vendor.example"]);

  // PARTIAL re-grant of the now-ENABLED row: net.fetch re-confirmed with the full host echo, notify LEFT. The
  // acknowledgement gate forces the echo to cover collector, yet the update is not fully consented (notify).
  const partial = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["net.fetch"],
    acknowledgedNetHosts: upgraded.netHosts ?? [],
  });
  expect(partial.status).toBe("enabled"); // the enabled state is RESTORED (reactivation), as before
  expect(partial.reconsentPending).toBe(true); // …but the ask is still standing (notify)
  // The reactivation must NOT arm the wall at the still-unanswered host — this is the divergence #698's
  // follow-up closes. Pre-fix this reactivated with `[]` and the wall carried collector.
  expect(h.port.created.at(-1)?.netHosts).toEqual(["api.vendor.example"]);
});

test("a COVERING re-grant of an ENABLED row DOES restore full reach (the delta cleared, nothing withheld)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(h.port.created.at(-1)?.netHosts).toEqual(["api.vendor.example"]);

  // COVERING re-grant: the whole ask answered (net.fetch is the only capability, echo covers every host).
  const covered = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["net.fetch"],
    acknowledgedNetHosts: upgraded.netHosts ?? [],
  });
  expect(covered.reconsentPending).toBe(false); // the delta cleared
  expect(h.port.created.at(-1)?.netHosts).toEqual(["api.vendor.example", "collector.attacker.example"]); // full reach restored
});

test("a grant outside the PERSISTED manifest's declared set is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
    grant: [],
  });
  await expect(
    h.service.setGrant({ caller: ownerPrincipalFor(owner), pluginId: installed.id, grant: ["turn.trigger"], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(CapabilityNotGrantedError);
});

test("granting net.fetch WITHOUT acknowledging the manifest's hosts is refused (fail-closed echo)", async () => {
  // Every other capability is consented to BY NAME, so a manifest that moved cannot make the owner grant
  // something they did not type. `net.fetch`'s reach is `netHosts`, which the owner never names — so the
  // caller must echo the list it displayed, and an empty echo confirms nothing.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: [],
  });

  await expect(
    h.service.setGrant({ caller: ownerPrincipalFor(owner), pluginId: installed.id, grant: ["net.fetch"], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(PluginNetHostsUnacknowledgedError);

  // The same call WITH the echo the view hands the client (`PluginView.netHosts`) succeeds.
  const granted = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["net.fetch"],
    acknowledgedNetHosts: installed.netHosts ?? [],
  });
  expect(granted.grantedCapabilities).toEqual(["net.fetch"]);
});

test("a STALE netHosts echo cannot arm the egress wall at a host the owner never saw (the consent-act TOCTOU)", async () => {
  // P3-H's shape, re-opened at the consent act rather than at the upgrade: the screen renders
  // `api.vendor.example`, an upgrade lands `collector.attacker.example` before the click, and the click must
  // not confirm what it never displayed. The refusal NAMES the unacknowledged host so the surface can re-render.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: [],
  });
  await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["collector.attacker.example"] }),
  });

  const refused = h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["net.fetch"],
    acknowledgedNetHosts: ["api.vendor.example"], // the stale screen
  });
  await expect(refused).rejects.toBeInstanceOf(PluginNetHostsUnacknowledgedError);
  await expect(refused).rejects.toThrow("collector.attacker.example");
});

test("a CASE-only echo difference is the same reach and is accepted (no false consent prompt)", async () => {
  // Coupled site: `hostAllowed` (infra/network/egress.ts) lowercases every allowlist entry, so this echo
  // confirms exactly the host the manifest declares. `widenedNetHosts` is the SAME fold the upgrade re-consent
  // trigger uses, so the two can never disagree about what a new destination is.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: [],
  });
  const granted = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["net.fetch"],
    acknowledgedNetHosts: ["API.Vendor.Example"],
  });
  expect(granted.grantedCapabilities).toEqual(["net.fetch"]);
});

test("the netHosts echo is only consulted when net.fetch is in the grant", async () => {
  // The hosts are inert without the capability (the manifest biconditional makes them meaningless alone), so
  // demanding an echo there would be ceremony — and a consent prompt nobody needs is how a real one stops
  // being read.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read", "net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  const dropped = await h.service.setGrant({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    grant: ["chat.read"],
    acknowledgedNetHosts: [],
  });
  expect(dropped.grantedCapabilities).toEqual(["chat.read"]);
});

test("a missing plugin id is a leak-free NotFound", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(
    h.service.setGrant({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing"), grant: [], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
});

test("a plain user (role:'user') re-consents on their OWN plugin — D147", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({
    caller: principalFor(user),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read", "notify"] }),
    grant: ["chat.read"],
  });

  const regranted = await h.service.setGrant({
    caller: principalFor(user),
    pluginId: installed.id,
    grant: ["chat.read", "notify"],
    acknowledgedNetHosts: [],
  });

  expect(regranted.grantedCapabilities).toEqual(["chat.read", "notify"]);
  expect(regranted.reconsentPending).toBe(false);
});

// THE SEEDER SHAPE, as a plain user (interlock with the example-plugins seeder, #673). It seeds per-user with
// `install({grant: []})` followed by `setGrant({grant: [], acknowledgedNetHosts: []})`, and under the old
// admin gate that pair THREW for every non-admin. Pinned as its own row rather than folded into the test
// above because the EMPTY grant is the part with a distinct path: it must not trip the grant ⊆ declared check
// (∅ is a subset of anything) and must not reach the `net.fetch` host acknowledgement (nothing to acknowledge).
test("the seeder's own shape works for a plain user: install(grant:[]) then setGrant(grant:[])", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({ caller: principalFor(user), bundle: makeBundle({ id: "example", capabilities: [] }), grant: [] });

  const settled = await h.service.setGrant({ caller: principalFor(user), pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });

  expect(settled.grantedCapabilities).toEqual([]);
  expect(settled.status).toBe("disabled"); // a re-grant without `enable` never enables
  expect(settled.reconsentPending).toBe(false); // nothing declared, so nothing left unanswered
});

// The CONSENT arm of the cross-user matrix, and the one whose failure would be worst: `setGrant` is the verb
// that WIDENS what a plugin may do, so an ungated one would let a stranger grant themselves-by-proxy powers
// over another user's reach. Refused for a plain user and for the apex role alike — no admin any-row branch
// (D147) — and A's grant is asserted UNCHANGED, since the verb answers with a view rather than a mutation
// count and a silent widening would leave no other trace.
test("a stranger cannot re-grant another user's plugin — not a plain user, and NOT an owner/admin either", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const hers = await h.service.install({
    caller: principalFor(alice),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read", "notify"] }),
    grant: ["chat.read"],
  });

  await expect(
    h.service.setGrant({ caller: principalFor(bob), pluginId: hers.id, grant: ["chat.read", "notify"], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(
    h.service.setGrant({ caller: ownerPrincipalFor(boss), pluginId: hers.id, grant: ["chat.read", "notify"], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);

  expect((await h.service.list({ caller: principalFor(alice) }))[0]?.grantedCapabilities).toEqual(["chat.read"]);
});

// THE SYSTEM'S OWN REFUSAL, RECORDED (#650 P1-1). A forced disable used to render identically to the owner's
// own toggle-off, so the surface presented OUR refusal as THEIR decision. `reconsentPending` is the event —
// deliberately not derived, because `declared ⊄ granted` is legitimately true for an ENABLED plugin whose
// owner granted a paranoid subset. Its host half rides `widenedNetHosts` (#659), the column that made the
// "which destinations are new" question answerable at all. These rows pin every transition of the pair, plus
// the ones that must NOT move them.
describe("reconsentPending — the forced-disable flag", () => {
  test("a WIDENED-CAPABILITY upgrade raises it; the flag is what distinguishes our refusal from a toggle-off", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
      grant: ["chat.read"],
    });
    expect(installed.reconsentPending).toBe(false); // a fresh install has nothing to re-consent to

    const upgraded = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read", "notify"] }),
    });

    expect(upgraded.status).toBe("disabled");
    expect(upgraded.reconsentPending).toBe(true);
  });

  test("a WIDENED-NETHOSTS upgrade raises it too — the half that is not derivable from any projected state", async () => {
    // The capability set is byte-identical across this upgrade; only the DESTINATION moved. Nothing a read
    // surface projects can reconstruct that, because the comparison is against the PRIOR manifest.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
      grant: ["net.fetch"],
    });

    const upgraded = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["collector.attacker.example"] }),
    });

    expect(upgraded.reconsentPending).toBe(true);
    expect(upgraded.grantedCapabilities).toEqual(["net.fetch"]); // the grant survives; the CONSENT is what is pending
  });

  test("a NON-widening upgrade leaves it false (nothing new was asked for)", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
      grant: ["chat.read"],
    });

    const upgraded = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read"] }),
    });

    expect(upgraded.reconsentPending).toBe(false);
  });

  test("a FULL re-grant CLEARS it — the flag is not a one-way latch", async () => {
    // Without this the surface would keep saying "needs re-consent" after the person just re-consented, which
    // is the same class of lie the flag exists to fix, pointing the other way.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
      grant: ["chat.read"],
    });
    await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read", "notify"] }),
    });

    const regranted = await h.service.setGrant({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      grant: ["chat.read", "notify"],
      acknowledgedNetHosts: [],
    });

    expect(regranted.reconsentPending).toBe(false);
  });

  test("a PARTIAL re-grant leaves it STANDING — the plugin is still asking for something unallowed", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
      grant: ["chat.read"],
    });
    await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read", "notify", "storage.kv"] }),
    });

    // The owner allows ONE of the two newly-declared capabilities.
    const partial = await h.service.setGrant({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      grant: ["chat.read", "notify"],
      acknowledgedNetHosts: [],
    });

    expect(partial.grantedCapabilities).toEqual(["chat.read", "notify"]);
    expect(partial.reconsentPending).toBe(true);
  });

  test("the HOST DELTA moves with the flag: carried by a partial re-grant, emptied by a covering one", async () => {
    // #659. The delta is what the notice marks "New", and the notice renders iff `reconsentPending` — so the
    // two move together or the surface ends up marking an ask nobody is being asked about. The db refuses
    // the settled-but-marked combination outright (`plugins_widened_hosts_check`); this pins that the verb
    // never gets there, in both directions, over a single row.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
      grant: ["net.fetch"],
    });
    // v2 adds a destination AND a capability, so a partial answer is possible.
    const upgraded = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({
        id: "pp",
        version: "1.1.0",
        capabilities: ["net.fetch", "notify"],
        netHosts: ["api.vendor.example", "collector.attacker.example"],
      }),
    });
    expect(upgraded.widenedNetHosts).toEqual(["collector.attacker.example"]);

    // A PARTIAL answer — `net.fetch` re-confirmed with the full echo, `notify` still refused. The same notice
    // is still standing about the same update, so its marks stay: dropping them would quietly remove
    // information from a live consent surface.
    const partial = await h.service.setGrant({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      grant: ["net.fetch"],
      acknowledgedNetHosts: upgraded.netHosts ?? [],
    });
    expect(partial.reconsentPending).toBe(true);
    expect(partial.widenedNetHosts).toEqual(["collector.attacker.example"]);

    // The COVERING answer clears both — there is no longer an ask to mark.
    const full = await h.service.setGrant({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      grant: ["net.fetch", "notify"],
      acknowledgedNetHosts: upgraded.netHosts ?? [],
    });
    expect(full.reconsentPending).toBe(false);
    expect(full.widenedNetHosts).toEqual([]);
  });

  test("ENABLING does not clear the HOST DELTA either — the marks outlive the toggle, like the flag", async () => {
    // Same inversion as the flag's, one column over: a person who works around the refusal by turning the
    // plugin on must not thereby erase WHICH destination the system refused, and the surface has to keep
    // being able to say so.
    //
    // TRUTH-REPAIR (2026-08-24): this comment used to end "it is running with the stored grant against a host
    // it was never consented for" — stated as the accepted shape, which BLESSED a real consent bypass. It was
    // one toggle to an armed `safeFetch` at an unconfirmed destination, and the toggle is the control the
    // notice itself points at ("turning it back on is still a separate step, above"). The row may still be
    // enabled with a standing ask — the two owner decisions are deliberately separate — but the unanswered
    // destination is withheld from the wall until it is answered (`consentedNetHosts`; the reach pin lives
    // beside the act that arms it, `set-enabled.int.test.ts`). The delta assertions below are unchanged: what
    // the notice SAYS was always right, it was the reach underneath it that was not.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
      grant: ["net.fetch"],
    });
    await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
    });

    await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

    const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
    expect(row?.status).toBe("enabled");
    expect(row?.reconsentPending).toBe(true);
    expect(row?.widenedNetHosts).toEqual(["collector.attacker.example"]);
    // …and the marked destination is exactly what the running instance CANNOT reach.
    expect(h.port.created.at(-1)?.netHosts).toEqual(["api.vendor.example"]);
  });

  test("ENABLING does NOT clear it — re-enabling grants nothing, so the gap outlives the toggle", async () => {
    // This is the inversion the flag must not acquire: if enabling cleared it, the surface would forget the
    // system ever refused the moment the person worked around the refusal.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
      grant: ["chat.read"],
    });
    await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read", "notify"] }),
    });

    await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

    const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
    expect(row?.status).toBe("enabled");
    expect(row?.reconsentPending).toBe(true);
    // …and it is running with the STORED grant, not the declared set — the two facts together are the whole
    // honest picture the surface owes: on, and still not allowed everything it asked for.
    expect(row?.grantedCapabilities).toEqual(["chat.read"]);
    expect(row?.declaredCapabilities).toEqual(["chat.read", "notify"]);
  });
});

// APPROVE TURNS IT ON (owner ruling, item 573). The owner's approval of a plugin's ask is also the act that
// runs it, in ONE call under the plugin's lifecycle lane. These pins hold what that must not cost: the guest
// runs with exactly the stored grant and the consented reach, a call that does not ask to enable never
// enables (the seeder and the fan-out still mint rows that do nothing), and a later widening update still
// stops the plugin until it is approved again.
describe("approve with enable", () => {
  test("approving with enable turns a never-approved plugin on, under exactly the approved set", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const caller = principalFor(owner);
    const installed = await h.service.install({ caller, bundle: makeBundle({ id: "pp", capabilities: ["chat.read", "notify"] }), grant: [] });
    // The seeder's shape: the empty re-grant raises the standing ask and runs nothing.
    await h.service.setGrant({ caller, pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });
    expect(h.port.created.length).toBe(0);

    const approved = await h.service.setGrant({ caller, pluginId: installed.id, grant: ["chat.read", "notify"], acknowledgedNetHosts: [], enable: true });

    expect(approved.status).toBe("enabled");
    expect(approved.reconsentPending).toBe(false);
    expect(h.port.created.length).toBe(1);
    expect(h.port.created.at(-1)?.grants).toEqual(["chat.read", "notify"]);
  });

  test("enable never widens reach: a still-unanswered host stays off the egress wall", async () => {
    // A PARTIAL approval with enable is the same consent state as a partial approval followed by the switch,
    // so it must arm the same narrower wall `setEnabled` arms.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const caller = principalFor(owner);
    const installed = await h.service.install({
      caller,
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
      grant: ["net.fetch"],
    });
    const upgraded = await h.service.upgrade({
      caller,
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch", "notify"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
    });

    const partial = await h.service.setGrant({
      caller,
      pluginId: installed.id,
      grant: ["net.fetch"],
      acknowledgedNetHosts: upgraded.netHosts ?? [],
      enable: true,
    });

    expect(partial.status).toBe("enabled");
    expect(partial.reconsentPending).toBe(true);
    expect(h.port.created.at(-1)?.grants).toEqual(["net.fetch"]);
    expect(h.port.created.at(-1)?.netHosts).toEqual(["api.vendor.example"]);
  });

  test("after approve-and-enable, a widening update still stops the plugin until it is approved again", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const caller = principalFor(owner);
    const installed = await h.service.install({ caller, bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }), grant: [] });
    await h.service.setGrant({ caller, pluginId: installed.id, grant: ["chat.read"], acknowledgedNetHosts: [], enable: true });
    expect(h.port.created.length).toBe(1);

    const upgraded = await h.service.upgrade({
      caller,
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read", "notify"] }),
    });

    expect(upgraded.status).toBe("disabled");
    expect(upgraded.reconsentPending).toBe(true);
    expect(upgraded.grantedCapabilities).toEqual(["chat.read"]);
    expect(h.port.disposed.length).toBe(1); // the approved resident was torn down
    expect(h.port.created.length).toBe(1); // and nothing came back up on the wider bundle
  });

  test("a stranger cannot approve-and-enable another user's plugin, and it stays off", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const alice = await seedUser(db, { handle: castId<Handle>("alice") });
    const boss = await seedUser(db, { handle: castId<Handle>("boss") });
    const hers = await h.service.install({ caller: principalFor(alice), bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }), grant: [] });

    await expect(
      h.service.setGrant({ caller: ownerPrincipalFor(boss), pluginId: hers.id, grant: ["chat.read"], acknowledgedNetHosts: [], enable: true }),
    ).rejects.toBeInstanceOf(PluginNotFoundError);

    expect(h.port.created.length).toBe(0);
    const [row] = await h.service.list({ caller: principalFor(alice) });
    expect(row?.status).toBe("disabled");
    expect(row?.grantedCapabilities).toEqual([]);
  });
});

// THE SANDBOX STILL GATES EVERY CAPABILITY ON THE GRANT after approve-and-enable, proven through the REAL
// plugin host rather than the fake port. The guest probes `chat.current` (capability `chat.read`) at
// activation: without the grant the membrane throws `PluginCapabilityError`; with it, the capability check
// passes and the call fails later for a different reason (no chat is in scope at activation). The fully
// approved plugin is the positive control that tells the two apart.
const PROBE_MAIN_JS = [
  "const host = orb.host(1);",
  "try { host.chat.current(); host.log.info('probe:allowed'); } catch (e) { host.log.info('probe:' + e.name); }",
].join("\n");

describe("approve with enable — real guest", () => {
  afterEach(async () => {
    await __terminateManagedPluginBrokerForTest();
  });

  function realHost(): ReturnType<typeof createPluginHost> {
    let n = 0;
    return createPluginHost({
      nowEpochMs: (): number => FROZEN_AT_MS,
      nextRandom: (): number => 0.5,
      mintId: (): string => {
        n += 1;
        return `grant_${n}`;
      },
    });
  }

  test("an approved-and-running guest is still refused a capability it declared but was not granted", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db, { port: realHost() });
    const caller = principalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const declared: PluginCapability[] = ["storage.kv", "chat.read"];

    // Both plugins DECLARE `chat.read`, so only the grant can tell them apart: the first is approved without it.
    const withheld = await h.service.install({ caller, bundle: makeBundle({ id: "withheld", capabilities: declared }, PROBE_MAIN_JS), grant: [] });
    const runningWithheld = await h.service.setGrant({ caller, pluginId: withheld.id, grant: ["storage.kv"], acknowledgedNetHosts: [], enable: true });
    const granted = await h.service.install({ caller, bundle: makeBundle({ id: "granted", capabilities: declared }, PROBE_MAIN_JS), grant: [] });
    const runningGranted = await h.service.setGrant({ caller, pluginId: granted.id, grant: declared, acknowledgedNetHosts: [], enable: true });

    expect(runningWithheld.status).toBe("enabled");
    expect(runningGranted.status).toBe("enabled");
    const refusedLog = await h.service.getLog({ caller, pluginId: withheld.id });
    const controlLog = await h.service.getLog({ caller, pluginId: granted.id });
    expect(refusedLog.map((line) => line.message)).toEqual(["probe:PluginCapabilityError"]);
    expect(controlLog.map((line) => line.message)).toEqual(["probe:Error"]);
  });
});
