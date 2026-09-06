// verb test: checkForUpdates (plugin-ui-plane #679 U8 2b — the auto update-check ST's loader does). What it pins:
//   - a url-origin plugin whose REMOTE version is newer surfaces `update-available` + the newVersion to offer;
//   - an equal remote is `up-to-date` (not update-available — equality is neither newer nor a downgrade);
//   - an UNREACHABLE source (SSRF block / non-2xx / un-parseable remote) collapses to ONE leak-free arm —
//     the block reason never surfaces, the same no-SSRF-oracle posture the install funnel holds;
//   - a FILE (upload-origin) plugin is simply ABSENT from the batch — there is nothing to check, which is
//     distinct from "unreachable";
//   - the SHOWCASE arm (#1740): a seeded install is compared against the version the BUNDLED manifest declares,
//     so a DIVERGED copy (the one the boot auto-upgrade refuses to touch) reports `update-available` while a
//     PRISTINE one is equal by construction and reports up-to-date — and a slug this build ships nothing for
//     drops out of the batch rather than claiming a source it never reached for was unreachable.
// The check re-fetches through the SAME injected egress guard the install rode (`ctx.fetchBundle`); a mutable
// served-bundle proves the install→publish-upstream→check sequence without live DNS.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, makeShowcaseShipping, ownerPrincipalFor, seedUser } from "../_support.ts";

const URL = "https://plugins.example.com/my-plugin.zip";

/** A fetch that SUCCEEDS with the given bundle bytes. */
const returns = (bytes: Uint8Array) => (): Promise<Uint8Array> => Promise.resolve(bytes);
/** A fetch that FAILS — the shape `fetchPluginBundle` throws for an SSRF block / non-2xx / network error, with
 *  an "internal" detail in its message so the leak-free arm can be proven not to surface it. */
const blockedFetch = (): Promise<Uint8Array> => Promise.reject(new Error("SSRF_BLOCKED: collector.internal → 10.1.2.3 (private-address)"));

test("checkForUpdates flags a url-origin plugin whose REMOTE version is newer (update-available + newVersion)", async () => {
  const db = await freshDb();
  // ONE mutable served bundle: the install fetches v1.0.0 through the guard; the later check re-fetches the SAME
  // remembered URL and now finds v1.1.0 — exactly the "an update was published upstream" shape.
  let served = makeBundle({ id: "scraper", version: "1.0.0", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: () => Promise.resolve(served) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const view = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });

  served = makeBundle({ id: "scraper", version: "1.1.0", capabilities: ["chat.read"] });
  const checks = await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) });

  expect(checks).toEqual([{ pluginId: view.id, status: "update-available", newVersion: "1.1.0" }]);
});

test("checkForUpdates reports up-to-date when the remote version matches the installed one", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: returns(makeBundle({ id: "scraper", version: "2.0.0", capabilities: ["chat.read"] })) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const view = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });

  const checks = await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) });

  expect(checks).toEqual([{ pluginId: view.id, status: "up-to-date" }]);
});

test("checkForUpdates on an UNREACHABLE source is leak-free (the arm collapses; the block reason never surfaces)", async () => {
  const db = await freshDb();
  // Install with a working fetch, then flip the fetch to the SSRF-block shape so the CHECK cannot reach the source.
  let mode: "install" | "blocked" = "install";
  const good = makeBundle({ id: "scraper", version: "1.0.0", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: () => (mode === "install" ? Promise.resolve(good) : blockedFetch()) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const view = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });

  mode = "blocked";
  const checks = await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) });

  // ONE leak-free arm — no version, no reason, no distinction between "blocked" / "404" / "garbage".
  expect(checks).toEqual([{ pluginId: view.id, status: "unreachable" }]);
});

test("checkForUpdates flags a DIVERGED seeded showcase install when a NEWER bundle ships (#1740)", async () => {
  const db = await freshDb();
  // The build SHIPS 1.2.0; the owner's seeded copy sits at 1.1.0 because they took it over, which is exactly the
  // row the boot auto-upgrade refuses to touch. Nothing here fetches: the version comes off the shipped manifest.
  const h = makePluginHarness(db, { showcase: makeShowcaseShipping([{ id: "oracle-deck", version: "1.2.0" }]) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const view = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "oracle-deck", version: "1.1.0" }),
    grant: [],
  });

  const checks = await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) });

  expect(checks).toEqual([{ pluginId: view.id, status: "update-available", newVersion: "1.2.0" }]);
});

test("checkForUpdates reports a PRISTINE seeded showcase install up-to-date — the auto-upgrade already handled it", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { showcase: makeShowcaseShipping([{ id: "oracle-deck", version: "1.2.0" }]) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  // Equal by construction after a boot pass: the seeder installs/upgrades to exactly the shipped version.
  const view = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "oracle-deck", version: "1.2.0" }),
    grant: [],
  });

  const checks = await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) });

  expect(checks).toEqual([{ pluginId: view.id, status: "up-to-date" }]);
});

test("checkForUpdates OMITS an upload plugin this build ships no bundle for — never a dishonest 'unreachable'", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { showcase: makeShowcaseShipping([{ id: "oracle-deck", version: "1.2.0" }]) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "hand-rolled", version: "1.0.0" }), grant: [] });

  // Absent, not `unreachable`: nothing was fetched and nothing ships, so there is no source that could have
  // failed. (A shipped slug WITHDRAWN from a later build lands on this same arm, for the same reason.)
  expect(await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) })).toEqual([]);
});

test("checkForUpdates OMITS a file (upload-origin) plugin — nothing to check, never a dishonest 'unreachable'", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: returns(makeBundle({ id: "urlplug", version: "1.0.0", capabilities: ["chat.read"] })) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  // One url-origin plugin (checkable) + one file-origin plugin (NOT checkable).
  const urlView = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });
  await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "fileplug", capabilities: [] }), grant: [] });

  const checks = await h.service.checkForUpdates({ caller: ownerPrincipalFor(owner) });

  // The file plugin is simply absent — the url plugin is the only entry.
  expect(checks).toEqual([{ pluginId: urlView.id, status: "up-to-date" }]);
});
