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

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CapabilityNotGrantedError, PluginNetHostsUnacknowledgedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { describe } from "vitest";
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
  // The two inversions, both directions. An enable that recomputed the grant would silently widen authority on
  // every restart; a re-grant that enabled would turn "you may have this power" into "and use it now".
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

test("a missing/foreign plugin is a leak-free NotFound; a non-admin is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["chat.read"] }),
    grant: [],
  });

  await expect(
    h.service.setGrant({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing"), grant: [], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(
    h.service.setGrant({ caller: principalFor(user), pluginId: installed.id, grant: ["chat.read"], acknowledgedNetHosts: [] }),
  ).rejects.toBeInstanceOf(DomainForbiddenError);
});

// THE SYSTEM'S OWN REFUSAL, RECORDED (#650 P1-1). A forced disable used to render identically to the owner's
// own toggle-off, so the surface presented OUR refusal as THEIR decision. `reconsentPending` is the event —
// deliberately not derived, because `declared ⊄ granted` is legitimately true for an ENABLED plugin whose
// owner granted a paranoid subset, and the netHosts half is judged against the PRIOR manifest, which nothing
// persists. These rows pin all three transitions plus the one that must NOT move it.
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
