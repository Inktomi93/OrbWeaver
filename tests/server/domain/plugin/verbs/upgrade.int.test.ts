// verb: upgrade — replace an installed plugin's bundle (02 §4). Slug-match, downgrade refusal, the re-grant
// rule (WIDENED REACH — new caps OR new netHosts ⇒ disabled), the old-bundle reap, and enabled-state
// preservation when no re-confirmation is needed.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ManifestInvalidError, PluginDowngradeRefusedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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
  // that compares capability names alone is structurally blind to it. Admin-gated, so this is the TOFU /
  // supply-chain case (a compromised or sold plugin shipping a new "1.1.0"), not privilege escalation.
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

test("a missing/foreign plugin is a leak-free NotFound; a non-admin is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "pp" }), grant: [] });

  await expect(
    h.service.upgrade({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing"), bundle: makeBundle({ id: "pp", version: "2.0.0" }) }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(
    h.service.upgrade({ caller: principalFor(user), pluginId: installed.id, bundle: makeBundle({ id: "pp", version: "2.0.0" }) }),
  ).rejects.toBeInstanceOf(DomainForbiddenError);
});
