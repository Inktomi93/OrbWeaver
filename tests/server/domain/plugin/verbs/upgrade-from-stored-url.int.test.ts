// verb test: upgradeFromStoredUrl (U8 2b — the TRUE one-click upgrade). What it pins:
//   - it re-fetches the REMEMBERED source URL (no re-paste — the call names NO url) and #615's re-consent wall
//     is INTACT through the one-click path: a reach-WIDENING bundle lands the row disabled + reconsent-pending,
//     never a silent auto-update;
//   - a FILE (upload-origin) install has no remembered source ⇒ a typed `PluginNoSourceUrlError`, raised BEFORE
//     any fetch;
//   - a FOREIGN / missing pluginId is a leak-free NOT_FOUND, and the server NEVER fetches the owner's stored URL
//     on a stranger's behalf (the owner-scoped load refuses first — the ordering the cross-tenant sweep probes).

import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNoSourceUrlError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const URL = "https://plugins.example.com/my-plugin.zip";

test("upgradeFromStoredUrl re-fetches the STORED url (no re-paste) and a reach-WIDENING bundle lands disabled-pending-reconsent", async () => {
  const db = await freshDb();
  let served = makeBundle({ id: "scraper", version: "1.0.0", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: () => Promise.resolve(served) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  // Install FROM URL (records sourceUrl) + enable, granting only chat.read.
  const installed = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  // Upstream publishes a WIDENED bundle; the one-click upgrade names NO url — it re-fetches the remembered one.
  served = makeBundle({ id: "scraper", version: "1.1.0", capabilities: ["chat.read", "notify"] });
  const upgraded = await h.service.upgradeFromStoredUrl({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  // #615's wall is INTACT through the one-click path: widened reach ⇒ disabled + reconsent-pending, never silent.
  expect(upgraded.status).toBe("disabled");
  expect(upgraded.version).toBe("1.1.0");
  expect(upgraded.reconsentPending).toBe(true);
  // The sourceUrl is unchanged by the upgrade (still the remembered install URL).
  expect(upgraded.sourceUrl).toBe(URL);
});

test("upgradeFromStoredUrl on a FILE install is a typed PluginNoSourceUrlError — and NEVER fetches", async () => {
  const db = await freshDb();
  let fetched = false;
  const h = makePluginHarness(db, {
    fetchBundle: () => {
      fetched = true;
      return Promise.reject(new Error("fetch must not run for a file install"));
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "filed", capabilities: [] }), grant: [] });

  await expect(h.service.upgradeFromStoredUrl({ caller: ownerPrincipalFor(owner), pluginId: installed.id })).rejects.toBeInstanceOf(PluginNoSourceUrlError);
  // No remembered URL ⇒ the refusal is raised BEFORE any fetch (the owner load + the null-source check both precede it).
  expect(fetched).toBe(false);
});

test("upgradeFromStoredUrl on a FOREIGN / missing pluginId is NOT_FOUND — and never fetches the owner's stored URL", async () => {
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

  await expect(h.service.upgradeFromStoredUrl({ caller: ownerPrincipalFor(stranger), pluginId: foreignId })).rejects.toBeInstanceOf(PluginNotFoundError);
  // The owner-scoped load refuses BEFORE the stored URL is ever read or fetched.
  expect(fetched).toBe(false);
});
