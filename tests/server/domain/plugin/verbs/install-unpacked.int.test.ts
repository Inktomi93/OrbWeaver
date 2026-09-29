// Development-only local directory installs must prove both the peer-local admission gate and delegation to
// the ordinary install/upgrade lifecycle, which owns persistence, provenance, and consent behavior.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginUnpackedUnavailableError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("installUnpacked is development-only and packs nothing when the gate is closed", async () => {
  const db = await freshDb();
  let packs = 0;
  const h = makePluginHarness(db, {
    development: false,
    packPluginDirectory: () => {
      packs += 1;
      return Promise.resolve(makeBundle({ id: "local-plugin" }));
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.installUnpacked({ caller: ownerPrincipalFor(owner), directory: "/tmp/local-plugin", grant: [] })).rejects.toBeInstanceOf(
    PluginUnpackedUnavailableError,
  );
  expect(packs).toBe(0);
});

test("installUnpacked refuses a remotely authenticated owner before filesystem access", async () => {
  const db = await freshDb();
  let packs = 0;
  const h = makePluginHarness(db, {
    development: true,
    packPluginDirectory: () => {
      packs += 1;
      return Promise.resolve(makeBundle({ id: "local-plugin" }));
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const remoteOwner = { ...ownerPrincipalFor(owner), via: "cookie" as const };

  await expect(h.service.installUnpacked({ caller: remoteOwner, directory: "/tmp/local-plugin", grant: [] })).rejects.toBeInstanceOf(DomainForbiddenError);
  expect(packs).toBe(0);
});

test("installUnpacked installs and then upgrades the same local slug through the ordinary lifecycle verbs", async () => {
  const db = await freshDb();
  let version = "1.0.0";
  const h = makePluginHarness(db, {
    development: true,
    packPluginDirectory: () => Promise.resolve(makeBundle({ id: "local-plugin", version })),
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  const installed = await h.service.installUnpacked({ caller, directory: "/tmp/local-plugin", grant: [] });
  version = "1.1.0";
  const upgraded = await h.service.installUnpacked({ caller, directory: "/tmp/local-plugin", grant: [] });

  expect(upgraded.id).toBe(installed.id);
  expect(upgraded.version).toBe("1.1.0");
  expect(upgraded.origin).toBe("upload");
});
