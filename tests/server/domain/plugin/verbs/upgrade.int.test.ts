// verb: upgrade — replace an installed plugin's bundle (02 §4). Slug-match, downgrade refusal, the re-grant
// rule (WIDENED REACH — new caps OR new netHosts ⇒ disabled), the old-bundle reap, and enabled-state
// preservation when no re-confirmation is needed.

import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { HostVersionUnservedError, ManifestInvalidError, PluginDowngradeRefusedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { magicBytes } from "../../../../support/magic-bytes.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("upgrades the bundle: version bump, new bytes stored, old bundle reaped", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "pp", version: "1.0.0" }), grant: [] });

  const upgraded = await h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: installed.id, bundle: makeBundle({ id: "pp", version: "1.1.0" }) });

  expect(upgraded.version).toBe("1.1.0");
  expect(h.storedBytes.size).toBe(1); // the old bundle asset was reaped, the new one remains
});

test("a version LOWER than installed is refused (no silent rollback)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "pp", version: "2.0.0" }), grant: [] });
  await expect(
    h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: installed.id, bundle: makeBundle({ id: "pp", version: "1.9.9" }) }),
  ).rejects.toBeInstanceOf(PluginDowngradeRefusedError);
});

test("a bundle whose slug differs from the installed plugin is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "pp" }), grant: [] });
  await expect(
    h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: installed.id, bundle: makeBundle({ id: "other", version: "2.0.0" }) }),
  ).rejects.toBeInstanceOf(ManifestInvalidError);
});

test("an upgrade for an unsupported host major is distinctly refused without replacing the installed bundle", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "pp", version: "1.0.0" }), grant: [] });

  await expect(
    h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: installed.id, bundle: makeBundle({ id: "pp", version: "2.0.0", hostVersion: 2 }) }),
  ).rejects.toBeInstanceOf(HostVersionUnservedError);

  expect((await h.service.list({ caller: ownerPrincipalFor(owner) }))[0]?.version).toBe("1.0.0");
  expect(h.storedBytes.size).toBe(1);
});

test("an upgrade that declares a NEW capability lands disabled (pending re-grant) — and is NOT re-activated", async () => {
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

  expect(upgraded.status).toBe("disabled");
  expect(h.port.created.length).toBe(1); // only the initial enable activated — NOT re-activated on the new-cap upgrade
  expect(h.port.disposed.length).toBe(1); // the old instance was torn down
});

test("upgrading an ENABLED plugin with no new caps re-activates on the new bundle", async () => {
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
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["chat.read"] }),
  });

  expect(upgraded.status).toBe("enabled");
  expect(h.port.created.length).toBe(2); // re-activated on the new bundle
  expect(h.port.disposed.length).toBe(1); // the old instance stopped first
});

test("an upgrade that SWAPS the netHosts allowlist lands disabled — the egress wall never re-arms without re-consent", async () => {
  // P3-H. RED-FIRST RECEIPT (2026-08-24, against unmodified source): status was "enabled" and the plugin was
  // re-activated on the new bundle, i.e. `net.fetch` came back up pointed at a host the owner never approved.
  // The capability set is byte-identical across this upgrade — only the DESTINATION moved — so a re-grant rule
  // that compares capability names alone is structurally blind to it. It is the TOFU / supply-chain case (a
  // compromised or sold plugin shipping a new "1.1.0"), never privilege escalation — a plugin's reach is its
  // INSTALLER's reach under D147, so the loss here is the installer's own data going somewhere they did not
  // agree to, which is exactly why the consent, not a role gate, is what has to hold.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["collector.attacker.example"] }),
  });

  expect(upgraded.status).toBe("disabled");
  expect(upgraded.grantedCapabilities).toEqual(["net.fetch"]); // the grant survives; the ENABLE is what must be re-taken
  expect(h.port.created.length).toBe(1); // only the initial enable activated — the new wall was NOT armed
  expect(h.port.disposed.length).toBe(1); // the old instance was torn down
});

test("a strictly NARROWING netHosts change carries forward enabled (consent to {A,B} already covers {A})", async () => {
  // The asymmetry is deliberate: nothing the owner refused becomes reachable, so there is nothing to
  // re-confirm — and prompting here would train authors never to shrink an allowlist.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["a.vendor.example", "b.vendor.example"] }),
    grant: ["net.fetch"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["a.vendor.example"] }),
  });

  expect(upgraded.status).toBe("enabled");
  expect(h.port.created.length).toBe(2); // re-activated on the new (narrower) bundle
});

test("a CASE-only netHosts respelling reaches the identical host and does not re-prompt", async () => {
  // Coupled site: `hostAllowed` (infra/network/egress.ts) lowercases every allowlist entry, so this upgrade
  // changes no reach at all. A re-consent prompt here would be false, and false prompts are how a real one
  // stops being read.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["API.Vendor.Example"] }),
  });

  expect(upgraded.status).toBe("enabled");
  expect(h.port.created.length).toBe(2);
});

test("a STANDING re-consent survives a later NON-widening upgrade — the system never forgets its own refusal", async () => {
  // RED-FIRST RECEIPT (2026-08-24, against unmodified source): `quiet.reconsentPending` came back FALSE.
  //
  // THE HOLE. `widened` is judged against the PRIOR MANIFEST, and the prior manifest is whatever the LAST
  // upgrade wrote — including one the owner refused. So a plugin author ships v2 bolting a new destination
  // onto the allowlist (refused, recorded, row disabled), then immediately ships v3 with the IDENTICAL
  // reach: v3 widens nothing relative to v2, so the old code wrote `pendingReconsent: false` and the
  // system's refusal evaporated. `net.fetch` is still granted (the grant survives a widening upgrade by
  // design — the CONSENT is what is pending), so the owner is then one unremarkable toggle away from
  // running a plugin whose egress wall is armed at `collector.attacker.example`, with no notice, no badge
  // and no status line saying anything happened. Two owner-initiated upgrades and one toggle, all of which
  // look routine, because the surface has stopped saying otherwise.
  //
  // The fix is one clause: a refusal is cleared by a covering `setGrant` and by nothing else.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });

  const widened = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
  });
  expect(widened.reconsentPending).toBe(true);

  // v3 declares exactly what v2 declared — nothing widens RELATIVE TO V2, but the owner never answered v2.
  const quiet = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.1", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
  });

  expect(quiet.reconsentPending).toBe(true);
  expect(quiet.status).toBe("disabled");
  expect(quiet.widenedNetHosts).toEqual(["collector.attacker.example"]);
});

test("…but it is NOT a latch: a later upgrade that DROPS the refused host clears it", async () => {
  // The opposite error, and the reason the flag is recomputed from the new manifest rather than carried
  // forward as a boolean. If v3 walks the destination back, there is nothing left to consent to — a notice
  // still standing there would be the same class of lie the flag exists to fix, pointing the other way, and
  // a re-consent prompt about nothing is how a real one stops being read.
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

  const walkedBack = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.2.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
  });

  expect(walkedBack.reconsentPending).toBe(false);
  expect(walkedBack.widenedNetHosts).toEqual([]);
});

// THE HOST DELTA, PERSISTED (#659). `pending_reconsent` says a re-consent stands; `widened_net_hosts` says
// WHICH destinations it is about — the half that used to die at the instant it was computed, because the
// widening is judged against the PRIOR manifest and this very write overwrites it. Without the column a
// notice can only render the whole host list unmarked; with it, and ONLY with it, the "New" mark is derived
// rather than invented. These pin the full lifecycle, because a delta that is set and never cleared is a
// stale-badge generator — the same lie, delayed.
describe("widenedNetHosts — which destinations the pending re-consent added", () => {
  test("a widening upgrade records exactly the NEW hosts, and the carried-forward one is not among them", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
      grant: ["net.fetch"],
    });
    expect(installed.widenedNetHosts).toEqual([]); // a fresh install has nothing widened

    const upgraded = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
    });

    expect(upgraded.reconsentPending).toBe(true);
    expect(upgraded.widenedNetHosts).toEqual(["collector.attacker.example"]);
    // The delta is a SUBSET of the rendered list, which is what lets a surface mark it by exact string
    // membership instead of re-implementing the host fold.
    expect(upgraded.netHosts).toEqual(["api.vendor.example", "collector.attacker.example"]);
  });

  test("a CAPABILITY-only widening records an EMPTY host delta — nothing to mark is not the same as unknown", async () => {
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
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch", "notify"], netHosts: ["api.vendor.example"] }),
    });

    expect(upgraded.reconsentPending).toBe(true);
    expect(upgraded.widenedNetHosts).toEqual([]);
  });

  test("consecutive unanswered widenings ACCUMULATE — the first update's hosts stay marked", async () => {
    // Replace-instead-of-accumulate would leave `x.attacker.example` rendering unmarked beside a marked
    // `y.attacker.example`, i.e. reading as "carried forward, already allowed", which it never was.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["a.vendor.example"] }),
      grant: ["net.fetch"],
    });
    await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["a.vendor.example", "x.attacker.example"] }),
    });

    const second = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({
        id: "pp",
        version: "1.2.0",
        capabilities: ["net.fetch"],
        netHosts: ["a.vendor.example", "x.attacker.example", "y.attacker.example"],
      }),
    });

    expect(second.widenedNetHosts).toEqual(["x.attacker.example", "y.attacker.example"]);
    // …and the host that was there before any of this is still unmarked.
    expect(second.widenedNetHosts).not.toContain("a.vendor.example");
  });

  test("a NON-widening upgrade on a SETTLED row leaves the delta empty", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["a.vendor.example"] }),
      grant: ["net.fetch"],
    });

    const upgraded = await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["a.vendor.example"] }),
    });

    expect(upgraded.reconsentPending).toBe(false);
    expect(upgraded.widenedNetHosts).toEqual([]);
  });
});

test("a missing plugin id is a leak-free NotFound", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(
    h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing"), bundle: makeBundle({ id: "pp", version: "2.0.0" }) }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
});

// THE #668-CLASS DRIFT GUARD, UNDER SELF-SCOPE (D147). Every re-consent test above runs as `role:"owner"`
// because install used to demand it. The machinery must not have been quietly wired to the ROLE — a plain
// user's widening upgrade has to land `disabled` with the recorded refusal exactly like anyone else's, and
// the plain user is now the COMMON case, not the exotic one.
test("a plain user's widening upgrade still records the refusal — the re-consent machinery is not role-keyed", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({
    caller: principalFor(user),
    bundle: makeBundle({ id: "pp", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  await h.service.setEnabled({ caller: principalFor(user), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgrade({
    caller: principalFor(user),
    pluginId: installed.id,
    bundle: makeBundle({ id: "pp", version: "1.1.0", capabilities: ["net.fetch", "notify"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
  });

  expect(upgraded.status).toBe("disabled");
  expect(upgraded.reconsentPending).toBe(true);
  expect(upgraded.widenedNetHosts).toEqual(["collector.attacker.example"]);
  expect(upgraded.grantedCapabilities).toEqual(["net.fetch"]); // the INTERSECTION — `notify` was never confirmed
  expect(h.port.created.length).toBe(1); // the new wall was NOT armed
});

// The upgrade arm of the cross-user matrix. It is the sharpest write-IDOR on this surface: an ungated
// upgrade would let a stranger REPLACE the code another user's row runs, so the refusal is asserted together
// with A's row being byte-unchanged (version, grant, and the bundle bytes still in the CAS).
test("a stranger cannot upgrade another user's plugin — not a plain user, and NOT an owner/admin either", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const hers = await h.service.install({ caller: principalFor(alice), bundle: makeBundle({ id: "pp", version: "1.0.0" }), grant: [] });
  const hostile = makeBundle({ id: "pp", version: "9.9.9", capabilities: ["net.fetch"], netHosts: ["collector.attacker.example"] });

  await expect(h.service.upgrade({ caller: principalFor(bob), pluginId: hers.id, bundle: hostile })).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(h.service.upgrade({ caller: ownerPrincipalFor(boss), pluginId: hers.id, bundle: hostile })).rejects.toBeInstanceOf(PluginNotFoundError);

  const [row] = await h.service.list({ caller: principalFor(alice) });
  expect(row?.version).toBe("1.0.0"); // never swapped
  expect(row?.declaredCapabilities).toEqual([]); // the hostile manifest never landed
  expect(h.storedBytes.size).toBe(1); // and the stranger's bytes were never stored
});

// ── #820 seam 11 — the bundle-asset SET is REPLACED by an upgrade, not merged into. The three properties
//    below are one rule seen from three sides: what the new bundle ships is what the plugin holds.
describe("#820 the bundle-asset set across an upgrade", () => {
  test("an unchanged image keeps its id and is NEVER reaped; a dropped one goes", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", version: "1.0.0" }, undefined, undefined, {
        "ui/assets/keep.png": magicBytes("png"),
        "ui/assets/drop.gif": magicBytes("gif"),
      }),
      grant: [],
    });
    const before = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
    const keptId = before.find((entry) => entry.path === "ui/assets/keep.png")?.assetId;
    const droppedId = before.find((entry) => entry.path === "ui/assets/drop.gif")?.assetId;
    expect(keptId).toBeDefined();
    expect(droppedId).toBeDefined();

    // v1.1 re-ships `keep.png` VERBATIM and drops `drop.gif`. The harness CAS de-duplicates by (owner, hash)
    // exactly as production does, so the re-shipped bytes come back with the SAME assetId — which is what
    // makes `reapIfOrphan`'s reference re-check the whole diff.
    await h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "1.1.0" }, undefined, undefined, { "ui/assets/keep.png": magicBytes("png") }),
    });

    const after = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
    expect(after.map((entry) => entry.path)).toEqual(["ui/assets/keep.png"]);
    // THE DROPPED path resolves to nothing — a node still naming it paints a placeholder rather than stale art.
    expect(after.some((entry) => entry.path === "ui/assets/drop.gif")).toBe(false);
    // …and the dropped blob is gone from the CAS, while the surviving link's asset is still there.
    expect(h.storedBytes.has(droppedId as never)).toBe(false);
    expect(h.storedBytes.has(after[0]?.assetId as never)).toBe(true);
  });

  test("upgrading to a bundle with NO images clears the whole set", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", version: "1.0.0" }, undefined, undefined, { "ui/assets/a.png": magicBytes("png") }),
      grant: [],
    });

    await h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: installed.id, bundle: makeBundle({ id: "pp", version: "1.1.0" }) });

    expect(await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id })).toEqual([]);
  });

  test("a REFUSED asset in the new bundle leaves the INSTALLED version and its images untouched", async () => {
    // The trust edge again, on the swap path: `parseBundle` throws before the row is read for its prior links
    // and before any CAS write, so a hostile v2 cannot half-replace a working install.
    const db = await freshDb();
    const h = makePluginHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", version: "1.0.0" }, undefined, undefined, { "ui/assets/a.png": magicBytes("png") }),
      grant: [],
    });

    await expect(
      h.service.upgrade({
        caller: ownerPrincipalFor(owner),
        pluginId: installed.id,
        bundle: makeBundle({ id: "pp", version: "2.0.0" }, undefined, undefined, { "ui/assets/evil.svg": magicBytes("svg") }),
      }),
    ).rejects.toBeInstanceOf(ManifestInvalidError);

    const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
    expect(row?.version).toBe("1.0.0");
    expect((await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id })).map((entry) => entry.path)).toEqual([
      "ui/assets/a.png",
    ]);
  });

  // ── THE TEARDOWN COMES AFTER THE FALLIBLE WRITES, NOT BEFORE THEM ────────────────────────────────────────
  // `deps.deactivate` used to run FIRST, ahead of the bundle store, the image wave and the row swap. Any
  // failure in that span stranded the row saying `enabled` with no resident instance behind it — the plugin's
  // tools silently gone while every surface reported it running — and the reap only ran after a SUCCESSFUL
  // `applyUpgrade`, so the bytes the failed attempt wrote were orphaned forever. The stop is now the last
  // thing before the swap, and the failure path repairs both halves.
  test("a CAS failure during the swap leaves the RUNNING plugin running, and reaps what the attempt wrote", async () => {
    const db = await freshDb();
    // install = bundle (1) + image (2); the upgrade's bundle store is (3) and its image wave is (4).
    const h = makePluginHarness(db, { failStoreAfter: 3 });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", version: "1.0.0" }, undefined, undefined, { "ui/assets/a.png": magicBytes("png") }),
      grant: [],
    });
    await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
    const assetsBefore = await db.select().from(assets);

    await expect(
      h.service.upgrade({
        caller: ownerPrincipalFor(owner),
        pluginId: installed.id,
        bundle: makeBundle({ id: "pp", version: "2.0.0" }, undefined, undefined, { "ui/assets/b.webp": magicBytes("webp") }),
      }),
    ).rejects.toThrow(/CAS write failed/u);

    // The resident instance was never torn down — the row that still says `enabled` is telling the truth.
    expect(h.port.disposed).toEqual([]);
    const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
    expect(row?.status).toBe("enabled");
    expect(row?.version).toBe("1.0.0");
    // …and the half-written v2 bundle asset did not survive as an unreferenced blob.
    expect(await db.select().from(assets)).toHaveLength(assetsBefore.length);
  });

  test("a failed ROW SWAP repairs the row it stranded — no `enabled` row without a resident instance", async () => {
    let failBatch = false;
    // `applyUpgrade` is the ONE batch in the upgrade path; everything before it is a plain select/insert. The
    // flag is flipped after install so the install's own batch still lands.
    const brokenDb = new Proxy(await freshDb(), {
      get: (target, prop, receiver): unknown => {
        if (prop === "batch" && failBatch) {
          return (): never => {
            throw new Error("db unavailable: the row swap failed");
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;
    const h = makePluginHarness(brokenDb);
    const owner = await seedUser(brokenDb, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", version: "1.0.0" }, undefined, undefined, { "ui/assets/a.png": magicBytes("png") }),
      grant: [],
    });
    await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

    failBatch = true;
    await expect(
      h.service.upgrade({
        caller: ownerPrincipalFor(owner),
        pluginId: installed.id,
        bundle: makeBundle({ id: "pp", version: "2.0.0" }, undefined, undefined, { "ui/assets/b.webp": magicBytes("webp") }),
      }),
    ).rejects.toThrow(/db unavailable/u);
    failBatch = false;

    // The instance IS gone (the stop precedes the swap by design) — so the row must not still claim `enabled`.
    expect(h.port.disposed).toHaveLength(1);
    const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
    expect(row?.status).toBe("disabled");
    expect(row?.version).toBe("1.0.0");
    expect(row?.lastError).toMatch(/db unavailable/u);
  });

  // THE REPAIR MUST NOT EAT THE FAILURE IT IS REPAIRING. The pin above only reddens the swap, so the repair's
  // own write still worked — and that hid the case the repair EXISTS for. When the db is genuinely
  // unavailable, the swap fails AND the repair fails, and an unguarded `await setStatus` in the catch replaces
  // the caller's error with the repair's: the operator is told the status write broke while the actual event —
  // "the upgrade could not be applied" — is gone, and the row is still `enabled` with no instance behind it.
  // The repair is BEST-EFFORT and the original failure is what leaves.
  test("a repair that ALSO fails still reports the ORIGINAL swap failure, never its own", async () => {
    // An annotated PROPERTY, not a `let`: biome's type service narrows a `let x = false` from both sides and
    // then calls every read of it unreachable.
    const control: { armed: boolean; swapFailed: boolean } = { armed: false, swapFailed: false };
    // A db that is DOWN, staged in the order the verb touches it — and the staging is load-bearing, not
    // ceremony: `applyUpgrade` builds its statements through `db.update(plugins)` BEFORE it calls `db.batch`,
    // so a proxy that failed `update` from the start would break the SWAP's own builder and never reach the
    // repair at all (the failure would carry the repair's sentence for the wrong reason — which is exactly
    // what a first version of this pin measured). `update` is therefore armed only ONCE the swap has failed,
    // at which point the sole remaining `update` in the flow is the repair's.
    const brokenDb = new Proxy(await freshDb(), {
      get: (target, prop, receiver): unknown => {
        if (control.armed && prop === "batch") {
          return (): never => {
            control.swapFailed = true;
            throw new Error("db unavailable: the row swap failed");
          };
        }
        if (control.swapFailed && prop === "update") {
          return (): never => {
            throw new Error("db unavailable: the repair write failed");
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;
    const h = makePluginHarness(brokenDb);
    const owner = await seedUser(brokenDb, { handle: castId<Handle>("owner") });
    const installed = await h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "pp", version: "1.0.0" }, undefined, undefined, { "ui/assets/a.png": magicBytes("png") }),
      grant: [],
    });
    await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

    control.armed = true;
    const rejection = h.service.upgrade({
      caller: ownerPrincipalFor(owner),
      pluginId: installed.id,
      bundle: makeBundle({ id: "pp", version: "2.0.0" }, undefined, undefined, { "ui/assets/b.webp": magicBytes("webp") }),
    });
    // The caller learns THE UPGRADE FAILED — not that a status write it never asked for failed.
    await expect(rejection).rejects.toThrow(/the row swap failed/u);
    await expect(rejection).rejects.not.toThrow(/the repair write failed/u);
    control.armed = false;
    control.swapFailed = false;

    // …and the version is untouched: nothing half-applied behind the swallowed error.
    const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
    expect(row?.version).toBe("1.0.0");
  });
});
