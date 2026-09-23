// verb test: upgradeFromUrl (U8, seam 15 — the never-silent update mechanism). Fetch a NEW
// bundle through the EGRESS GUARD, then upgrade the OWNED plugin through the existing `upgrade` verb. The walls
// this file pins, red-first where the wall is the point:
//   - NEVER-SILENT-UPDATE (#615's re-consent wall, unchanged): a reach-WIDENING bundle lands the row DISABLED
//     pending re-consent; a strict NARROWING carries the enabled state forward silently.
//   - OWNER SCOPE BEFORE ANY FETCH: the owned row is loaded first, so a stranger's pluginId is NOT_FOUND without
//     the server ever egressing on their behalf (the ordering the cross-tenant sweep probes).
//
// The domain funnel is driven with an injected `fetchBundle` so the outcomes are provable without live DNS.

import { plugins } from "@orb/db";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const URL = "https://plugins.example.com/my-plugin.zip";

/** A fetch that SUCCEEDS with the given bundle bytes. */
const returns = (bytes: Uint8Array) => (): Promise<Uint8Array> => Promise.resolve(bytes);

test("upgradeFromUrl with a reach-WIDENING bundle lands the row DISABLED pending re-consent (never silent)", async () => {
  const db = await freshDb();
  const v2 = makeBundle({ id: "scraper", version: "1.1.0", capabilities: ["chat.read", "notify"] });
  const h = makePluginHarness(db, { fetchBundle: returns(v2) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  // Install + enable v1 (granting only chat.read), so a widening upgrade has something to DISABLE.
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "scraper", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgradeFromUrl({ caller: ownerPrincipalFor(owner), pluginId: installed.id, url: URL });

  // The wall: a widened-reach upgrade comes back disabled + reconsent-pending, and the new cap is NOT granted.
  expect(upgraded.status).toBe("disabled");
  expect(upgraded.version).toBe("1.1.0");
  const [row] = await db.select({ pending: plugins.pendingReconsent }).from(plugins).where(eq(plugins.id, installed.id));
  expect(row?.pending).toBe(true);
});

test("upgradeFromUrl with a strict NARROWING bundle carries the enabled state forward (no forced disable)", async () => {
  const db = await freshDb();
  const v2 = makeBundle({ id: "scraper", version: "1.1.0", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: returns(v2) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "scraper", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgradeFromUrl({ caller: ownerPrincipalFor(owner), pluginId: installed.id, url: URL });

  expect(upgraded.version).toBe("1.1.0");
  expect(upgraded.status).toBe("enabled");
});

test("upgradeFromUrl on a FOREIGN / missing pluginId is NOT_FOUND — and the server NEVER fetches on a stranger's behalf", async () => {
  const db = await freshDb();
  let fetched = false;
  const h = makePluginHarness(db, {
    fetchBundle: () => {
      fetched = true;
      return Promise.reject(new Error("fetch must not run for a non-owner"));
    },
  });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const foreignId = castId<PluginId>("plugin_ffffffffffffffffffffffff");

  await expect(h.service.upgradeFromUrl({ caller: ownerPrincipalFor(stranger), pluginId: foreignId, url: URL })).rejects.toBeInstanceOf(PluginNotFoundError);
  // THE ORDERING IS THE SECURITY PROPERTY: the owner-scoped row load ran and refused BEFORE `ctx.fetchBundle`.
  expect(fetched).toBe(false);
});
